import { prisma } from '../../../lib/db';
import { hashToken } from '../../../lib/tokens';
import { TOOLS, toolsForScope, runTool } from '../../../lib/mcp-tools';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER = { name: 'syncup', title: 'Syncup', version: '1.0.0' };

function rpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Bearer token → a live, unrevoked row. Also stamps last-used for the settings list. */
async function authorise(request) {
  const header = request.headers.get('authorization') || '';
  const offered = header.replace(/^Bearer\s+/i, '').trim();
  if (!offered) return null;

  const token = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(offered) },
    include: { createdBy: true },
  });
  if (!token || token.revokedAt) return null;

  await prisma.mcpToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return token;
}

async function handle(message, token) {
  const { id, method, params } = message;
  const scoped = toolsForScope(token.scope);

  switch (method) {
    case 'initialize':
      return rpc(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          token.scope === 'READ_WRITE'
            ? 'Syncup holds one company\'s working day: attendance, the daily plan, tasks, end-of-day reports, leave and holidays. This token can also assign tasks, change task status and decide leave requests — those actions are attributed to whoever this token was minted for. It can never delete a person or reset a password; those stay human-only actions in the app.'
            : 'Syncup holds one company\'s working day: attendance, the daily plan, tasks, end-of-day reports, leave and holidays. This token is read-only.',
      });

    case 'ping':
      return rpc(id, {});

    case 'tools/list':
      return rpc(id, { tools: scoped });

    case 'tools/call': {
      const name = params?.name;
      const tool = scoped.find((t) => t.name === name);
      if (!tool) {
        const knowsIt = TOOLS.some((t) => t.name === name);
        const message = knowsIt
          ? `"${name}" needs a read-write token. This one is read-only.`
          : `No tool called "${name}".`;
        return rpcError(id, -32602, message);
      }
      try {
        const result = await runTool(name, params?.arguments || {}, { actor: token.createdBy });
        return rpc(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
      } catch (err) {
        return rpc(id, {
          content: [{ type: 'text', text: `That query failed: ${err.message}` }],
          isError: true,
        });
      }
    }

    default:
      // Notifications carry no id and expect no reply.
      if (id === undefined || id === null) return null;
      return rpcError(id, -32601, `Unsupported method "${method}".`);
  }
}

export async function POST(request) {
  const token = await authorise(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'A valid bearer token is required.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="syncup"',
      },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'That is not valid JSON.'), { status: 400 });
  }

  // A client may batch several calls into one array.
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handle(m, token)))).filter(Boolean);
    return replies.length === 0 ? new Response(null, { status: 202 }) : Response.json(replies);
  }

  const reply = await handle(body, token);
  return reply === null ? new Response(null, { status: 202 }) : Response.json(reply);
}

// This server never pushes to the client, so there is no stream to open.
export async function GET() {
  return new Response(JSON.stringify({ error: 'This endpoint speaks JSON-RPC over POST.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
}
