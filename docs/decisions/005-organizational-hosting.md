# ADR 005: Optional organizational hosting

Status: accepted, 2026-09-21.

## Boundary and scope

`forma host` is an explicitly configured, authenticated deployment mode. `forma serve` remains a loopback local-folder adapter; static hosting remains account-free. Authentication and storage do not enter the rendering core or native document format. Version 1 and 2 diagrams continue to work unchanged.

This first hosted release provides private libraries for individual users of one organization. Shared folders, team ACLs, real-time collaboration, public links, and agent API tokens are outside this release. An agent can edit an exported native file; a user imports and saves it back. Trusted server-side automation can work on the same ordinary files with the existing CLI.

## Google identity

Reuse Google's maintained `google-auth-library` (Apache-2.0), now developed in the [google-cloud-node repository](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs). Use the authorization-code flow with S256 PKCE, state bound to an HttpOnly browser cookie, single-use short-lived login attempts, and an independently checked nonce. The library verifies ID-token signatures, issuer, audience, and expiration. Only OpenID/email/profile scopes are requested; no Google access or refresh tokens are persisted.

Admission requires an explicit email allowlist or a Google Workspace domain allowlist. Domain admission checks the verified `hd` claim, not the suffix of an email address or the authorization request's domain hint. Require verified email in both cases. The stable Google `sub` identifies ownership; email is a display/admission property, not a filesystem path. These choices follow [Google's OpenID Connect guidance](https://developers.google.com/identity/openid-connect/openid-connect).

Opaque random session tokens live in HttpOnly, SameSite=Lax cookies, with Secure and the `__Host-` prefix on HTTPS deployments. The server keeps only token hashes, expires sessions after 12 hours, and revokes them on sign-out. Sessions intentionally do not survive restart. Login attempts and session maps are bounded. The allowlist is applied to every authenticated request. Changes to environment configuration require restart, which also revokes all sessions.

## Storage and isolation

Extract the existing local library implementation into a shared file adapter. Every hosted operation derives its root from the authenticated Google subject, never from a submitted user ID or directory. Data is stored under `users/SHA256(google:SUB)/diagrams/`; an administrator-only `identity.json` maps the directory to the identity. Each library retains nested files, document validation, atomic replacement, optimistic content revisions, and path/symlink containment checks. The host API never exposes absolute data paths or a directory-switch operation.

Default limits are 100 MB and 1,000 files per user, 5 MB per document, and 500 admitted user directories. Files and owner directories are created with restrictive modes. Administrators own backups and retention. A data-directory lock rejects concurrent hosted processes; this is a single-instance, local-filesystem deployment. It is not a distributed store or a cross-process transactional system. Operators must stop the process before restore/migration and confirm no process is running before removing a crash-left lock.

## Browser and HTTP boundary

Hosted sessions gate mounting the editor. Hosted diagram drafts and active-file bindings are not persisted in browser storage; private diagrams are read from the server Library after reload. Design presets are session-only, while applied identities are preserved in saved diagram documents. Logout broadcasts to other tabs, and restored back-forward-cache pages reload their authentication state. Unsaved drafts require an explicit sign-out warning. This avoids displaying a previous account's recovered diagrams to another user of the same browser.

The HTTP service enforces a configured canonical Host and Origin, custom-header JSON writes, no CORS, bounded bodies, and a content policy that disallows remote scripts, object embedding, and framing. HTTPS is required except for loopback development. Reverse proxies preserve the public Host; forwarded headers are not trusted to establish identity or the canonical origin. Production cookies are never sent over HTTP. A Caddy/Docker Compose recipe provides TLS termination without publishing Forma's internal port.

## Validation and remaining deployment work

Authentication is injected at a small TypeScript interface for deterministic tests. `forma host` always uses Google: there is no environment-configurable fake provider, test account, or bypass route. The test preview is excluded from npm release packages and carries a visible simulated-provider label. Automated tests cover identity admission, nonce/state failures, isolation, revision conflicts, quotas, expiry, and logout. Browser tests exercise real HTTP sessions and file operations using the simulated provider. A production operator must still configure and exercise their real Google OAuth client, consent screen, domain, and TLS deployment.
