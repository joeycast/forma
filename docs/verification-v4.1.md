# Hosted agent-access verification

Verified during the 0.4.1 implementation on 2026-09-21.

## Automated checks

`npm run check` passes all 27 tests, TypeScript, and the production build. Formatting and schema-regeneration checks also pass. New coverage in `tests/agent-access.test.ts` exercises:

- Session-issued tokens that never store or list the secret, with hashed on-disk registry reload.
- Folder scope, path containment, read-only denial, and cross-user isolation.
- REST create/read/update with optimistic revision conflicts.
- `forma remote` pull/push, sidecar binding, and refusal to push another user’s document.
- Streamable HTTP MCP and stdio `forma mcp` over the same token, including revocation.
- Token expiry and rejected remote origins.

Existing hosted authentication, library isolation, quota, cookie, and local CLI tests remain green.

## Browser and deployment boundary

The Agent access UI is included in the production editor bundle. End-to-end clicks of token creation were not exercised in a live browser in this environment; the REST routes that UI calls are covered by the automated suite. Live Google sign-in, public TLS, and a production MCP client configuration still require the operator’s OAuth client and host, as in 0.4.0.

See [self-hosting](self-hosting.md) and [ADR 006](decisions/006-hosted-agent-access.md).

## Follow-up verification — 2026-09-27

Revalidated release 0.5.2 at `6f2b611d1c9919d787a8ef02b36c60a03b3be3b2`.

- A clean checkout passed all 42 tests, TypeScript, and the production build on Node 26.7.0. This includes REST, remote CLI, HTTP MCP, stdio MCP, user isolation, folder scope, read-only enforcement, revocation, and revision conflicts.
- Exercised the production editor through `tests/fixtures/hosted-preview.ts`, using its explicitly labeled simulated identity provider. Opened **Agent access**, created a read-only token restricted to `verification` with a seven-day expiry, dismissed the one-time secret, and confirmed the displayed permissions and expiry.
- Clicked **Revoke** and **Confirm revoke** and verified the connection disappeared. The test token was revoked; no secret was retained in screenshots or verification notes.
- Visually inspected the rendered connection dialog after hiding the secret. Its fields, scope explanation, connection metadata, and revocation control were visible without clipping.

The original browser-verification gap above is now closed. Live Google OAuth and a public deployment were not exercised in this follow-up. MCP currently uses manually configured bearer tokens, not an OAuth discovery/consent flow. Local CLI, local editor, and static use remain account-free.

The original workspace had macOS-offloaded dependency and source files, causing reads to stall. Validation therefore ran from an independent checkout of the identical commit outside the synced Documents directory, with dependencies installed from the lockfile. The build emitted non-fatal upstream annotation and bundle-size warnings.
