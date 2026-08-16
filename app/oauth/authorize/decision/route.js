import { prisma } from '../../../../lib/db';
import { currentUser } from '../../../../lib/auth';
import { mintAuthCode, authCodeExpiry } from '../../../../lib/oauth';

export async function POST(request) {
  const form = await request.formData();
  const clientId = String(form.get('client_id') || '');
  const redirectUri = String(form.get('redirect_uri') || '');
  const codeChallenge = String(form.get('code_challenge') || '');
  const state = String(form.get('state') || '');
  const decision = String(form.get('decision') || '');
  const scope = form.get('scope') === 'READ_WRITE' ? 'READ_WRITE' : 'READ_ONLY';

  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) {
    // The session lapsed between loading the consent screen and submitting it —
    // send them back through the top of the flow rather than guess at intent.
    const restart = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return Response.redirect(new URL(`/oauth/authorize?${restart.toString()}`, request.url));
  }

  const back = new URL(redirectUri);
  if (state) back.searchParams.set('state', state);

  if (decision !== 'allow') {
    back.searchParams.set('error', 'access_denied');
    return Response.redirect(back);
  }

  const code = mintAuthCode();
  await prisma.oAuthCode.create({
    data: {
      code,
      clientId: client.id,
      userId: user.id,
      redirectUri,
      codeChallenge,
      scope,
      expiresAt: authCodeExpiry(),
    },
  });

  back.searchParams.set('code', code);
  return Response.redirect(back);
}
