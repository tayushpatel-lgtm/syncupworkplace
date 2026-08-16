import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/db';
import { currentUser } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

function ErrorCard({ title, detail }) {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="brand">
          <b>SYNCUP</b>
          <span>CONNECT</span>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 600 }}>{title}</h2>
        <p className="hint" style={{ marginTop: 0 }}>{detail}</p>
      </div>
    </div>
  );
}

function safeState(value) {
  return typeof value === 'string' ? value.slice(0, 512) : '';
}

/**
 * The user-facing half of the OAuth flow (RFC 6749 §3.1 + PKCE, RFC 7636).
 * A client (e.g. Claude) lands here after registering; this page authenticates
 * the person through Syncup's own login and asks them to approve access —
 * nothing here trusts the client beyond "is this a redirect URI it registered."
 */
export default async function AuthorizePage({ searchParams }) {
  const params = await searchParams;
  const responseType = params?.response_type;
  const clientId = params?.client_id;
  const redirectUri = params?.redirect_uri;
  const codeChallenge = params?.code_challenge;
  const codeChallengeMethod = params?.code_challenge_method;
  const state = params?.state;

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge) {
    return (
      <ErrorCard
        title="Invalid request"
        detail="This authorization request is missing something it needs (response_type, client_id, redirect_uri or code_challenge)."
      />
    );
  }
  if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
    return <ErrorCard title="Unsupported PKCE method" detail="Only S256 is supported." />;
  }

  const client = await prisma.oAuthClient.findUnique({ where: { id: String(clientId) } });
  if (!client || !client.redirectUris.includes(String(redirectUri))) {
    return (
      <ErrorCard
        title="Unknown application"
        detail="This app isn't registered with Syncup, or its redirect address doesn't match what it registered."
      />
    );
  }

  const user = await currentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(params).toString()}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="brand">
          <b>SYNCUP</b>
          <span>CONNECT</span>
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 600 }}>
          {client.name || 'An application'} wants to connect to Syncup
        </h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Signed in as <b>{user.name}</b> ({user.email}). Allowing this lets it read your
          company&apos;s Syncup data — and, if you pick full access below, take actions on your
          behalf. It can never delete a person or reset a password.
        </p>

        <form method="POST" action="/oauth/authorize/decision">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="state" value={safeState(state)} />

          <div className="field-label" style={{ marginTop: 22 }}>
            ACCESS LEVEL
          </div>
          <div className="stack" style={{ gap: 10, margin: '10px 0 22px' }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="scope" value="READ_ONLY" defaultChecked style={{ marginTop: 3 }} />
              <span>
                <b>Read-only</b>
                <br />
                <small className="muted">Can look things up — attendance, tasks, reports, leave. Can&apos;t change anything.</small>
              </span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="scope" value="READ_WRITE" style={{ marginTop: 3 }} />
              <span>
                <b>Full access</b>
                <br />
                <small className="muted">Also assign tasks, move task status and decide leave requests, attributed to you.</small>
              </span>
            </label>
          </div>

          <div className="row">
            <button className="btn" type="submit" name="decision" value="deny">
              Deny
            </button>
            <button className="btn btn-primary" type="submit" name="decision" value="allow">
              Allow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
