# ADR 006: Hosted agent access

Status: accepted, 2026-09-21.

## Boundary

Hosted agents authenticate with user-issued bearer tokens, never Google cookies or OAuth client secrets. A token belongs to one admitted Google identity, inherits that user’s private library, and may further restrict folder prefix and read/write permission. The same authorization layer serves REST, `forma remote`, stdio MCP, and optional Streamable HTTP MCP. MCP is an adapter, not a security boundary.

Local `forma serve` and static deployments are unchanged. They keep using files on disk or in the browser. No token is required, and `/mcp` is not part of those modes.

## Tokens

The signed-in editor creates tokens through `/api/tokens` using the existing session, origin, and custom-header checks. The secret is shown once. Only SHA-256 digests are stored in `agent-tokens.json` at the data-directory root, with restrictive file modes. Tokens expire in 1–90 days, can be revoked immediately, and are rejected if the owner is later removed from the admission allowlist. Folder scope is a relative prefix; path checks reject empty, hidden, parent, and absolute segments before the library adapter runs.

Agent HTTP routes (`/api/agent/*` and `/mcp`) require `Authorization: Bearer`. A session cookie is not accepted as an agent credential, and an agent token cannot list or revoke tokens.

## CLI and MCP

`forma remote` talks to the hosted origin from `FORMA_REMOTE_URL`. The token comes from `FORMA_AGENT_TOKEN` or a private `FORMA_AGENT_TOKEN_FILE` (regular file, ≤4 KB, mode `0600` on Unix). Pull writes a `.forma-remote.json` sidecar binding server, owner, path, and content revision. Push refuses to cross that binding and uses the same optimistic revision check as human saves.

`forma mcp` is a local stdio bridge over that HTTP API. Streamable HTTP MCP at `/mcp` is off unless `FORMA_ENABLE_MCP=true`. This release uses configured bearer tokens rather than MCP OAuth discovery.

## Remaining work

OAuth for MCP clients, shared team folders, and per-diagram ACLs remain out of scope. Operators still supply Google identity, TLS, backups (including `agent-tokens.json`), and edge rate limiting.
