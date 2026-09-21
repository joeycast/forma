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
