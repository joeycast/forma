import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
export type Identity = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  hd?: string;
  nonce?: string;
};
export type LoginAttempt = { state: string; nonce: string; verifier: string; challenge: string };
/** Dependency boundary for deterministic tests; the shipped command always uses Google. */
export interface IdentityProvider {
  authorize(attempt: LoginAttempt): string;
  exchange(code: string, attempt: LoginAttempt): Promise<Identity>;
}
export function googleProvider(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): IdentityProvider {
  if (!clientId || !clientSecret)
    throw new Error('Set FORMA_GOOGLE_CLIENT_ID and FORMA_GOOGLE_CLIENT_SECRET.');
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
    transporterOptions: { timeout: 15_000 },
  });
  return {
    authorize: ({ state, nonce, challenge }) =>
      client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: 'select_account',
        access_type: 'online',
      }),
    async exchange(code, attempt) {
      const { tokens } = await client.getToken({ code, codeVerifier: attempt.verifier });
      if (!tokens.id_token) throw new Error('Missing ID token.');
      // The maintained Google library validates the signature, issuer, audience and expiry.
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Missing identity.');
      // Do not persist access or refresh tokens: this application needs identity only.
      return payload as Identity;
    },
  };
}
