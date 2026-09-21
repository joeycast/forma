# Host Forma for your organization

Hosted Forma supports Google sign-in and a private server-backed diagram library for each admitted user. Your organization operates the server, disk, domain, Google OAuth client, and backups. No Forma-operated service or external database is required. Local `forma serve` and static deployments still work without accounts.

This release is **single-instance**, with private libraries rather than shared team folders. Do not run multiple replicas against the same data directory.

## Configure Google

Create a **Web application** OAuth client in your organization's Google Cloud project. Configure its consent screen and authorized users according to your organization's Google policy. Set the exact authorized redirect URI:

```
https://diagrams.example.com/auth/callback
```

Use the same origin for `FORMA_PUBLIC_URL`. Request only OpenID, email, and profile; Forma does not need Drive access. Use an Internal consent audience when suitable for your Workspace organization, or explicitly manage your External/test audience. Follow [Google's setup and OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

Store the client secret only on the host, never in a diagram, frontend build variable, public repository, or agent prompt. The server requires an allowlist even if the Google consent audience is restricted. Workspace domains use Google's `hd` claim, not email suffix matching.

## Docker Compose with HTTPS

Requires Docker Compose, a public domain pointing to your host, and inbound ports 80 and 443 available for Caddy. From a checkout:

```sh
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` with the public URL, real client ID/secret, and allowed Workspace domains and/or individual Google emails. The example values are placeholders. Then:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

Caddy terminates HTTPS and proxies to the unprivileged Forma container. Only Caddy publishes network ports. Persistent named volumes hold diagrams and TLS state. Do not run `down --volumes` unless you intentionally want to delete that data. See [Caddy reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and [Compose environment-file documentation](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Visit the public URL, sign in with an allowed Google account, and save a diagram in Library. Confirm that another allowed account has an independent library. Verify a disallowed account cannot sign in before inviting users.

## Run with Node instead

Build a source checkout with `npm ci && npm run build`, or install a release package. Configure environment variables through your service manager or a private environment file. For example, from a checkout using Node's environment-file support:

```sh
node --env-file=/etc/forma/forma.env packages/cli/bin.mjs host
```

A release installation exposes the same command as `forma host` when the environment is already loaded. A process supervisor should keep it running. Terminate TLS with your existing reverse proxy and preserve the original public `Host` header. Keep the upstream private. Do not expose the unauthenticated `forma serve` command.

| Variable                     | Meaning / default                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `FORMA_PUBLIC_URL`           | Required canonical HTTPS origin, without a path, such as `https://diagrams.example.com` |
| `FORMA_GOOGLE_CLIENT_ID`     | Required Google Web client ID                                                           |
| `FORMA_GOOGLE_CLIENT_SECRET` | Required server-only client secret                                                      |
| `FORMA_DATA_DIR`             | Required durable directory; Compose sets `/data`                                        |
| `FORMA_ALLOWED_EMAILS`       | Comma-separated explicit Google emails                                                  |
| `FORMA_ALLOWED_DOMAINS`      | Comma-separated Google Workspace domains; at least one allowlist must be nonempty       |
| `FORMA_BIND_HOST`            | `127.0.0.1`; Compose sets `0.0.0.0` on its private network                              |
| `FORMA_PORT`                 | `4242`                                                                                  |
| `FORMA_USER_BYTES`           | `100000000` bytes per user                                                              |
| `FORMA_USER_FILES`           | `1000` diagrams per user, maximum 1000                                                  |
| `FORMA_MAX_USERS`            | `500` user directories                                                                  |

HTTP is allowed only for `localhost` or `127.0.0.1` development origins and binds to loopback. Google must have the matching loopback callback URI registered. Production uses HTTPS Secure cookies. Forma does not infer its public URL from untrusted forwarded headers. `/healthz` is a public health endpoint, still subject to the canonical Host check.

## Daily use and agents

After sign-in, Library opens to your private files. Create diagrams, organize them with relative paths such as `engineering/platform.forma.json`, and save explicitly. Reloading opens Library rather than restoring a private draft from browser storage. Unsaved hosted edits do not survive a page reload or sign-out; use Save or export a native copy first. Sign-out also closes authenticated views in other tabs.

Use **Agent guide → Copy setup prompt** for the hosted workflow: export the native document, have an agent edit it with the CLI, import it through **Open**, then save. Opening an imported file detaches its old library binding; save to a new path if one already exists. To replace an existing file without losing revision protection, first open its latest server version and use **View document source** to apply the agent's full JSON, then Save. Re-read/export the latest file before each agent edit.

Applied design systems live inside saved diagrams. In hosted mode, saved design presets last for the page session; export the design JSON to reuse it elsewhere. Shared organizational preset administration and remote agent tokens are not included yet.

## Administration, backup, and recovery

Data lives under `users/<opaque-subject-hash>/diagrams/` as native JSON. The sibling `identity.json` identifies the owner for the administrator. Ordinary users cannot access this metadata or other user directories through HTTP. Host administrators can read the disk; this is not end-to-end encrypted storage.

Back up the entire data directory/volume, preserving ownership and permissions. Stop Forma for a consistent snapshot. Restore into a stopped instance; omit `.forma-host.lock` from a restored snapshot, then start and verify two users' files. Keep secrets and TLS backups separate from public source control. Test recovery periodically. Stop-before-copy also applies to administrative file moves or deletions; the app currently has no delete/retention UI.

A clean shutdown removes `.forma-host.lock`. After an unclean shutdown the lock may remain. Confirm that every Forma process using that directory is stopped before removing that one lock file; never remove a live process's lock. Named Docker volumes can be inspected or mounted in a maintenance container by an administrator. Do not remove the users directory to clear a lock.

Changing allowlists requires restart and signs everyone out. Domain access permits all users whose verified Google `hd` matches; use explicit emails instead when selective access is required. Existing files remain on disk when admission is removed. Sessions expire after 12 hours and all sessions are revoked on restart. Google account changes are checked on the next sign-in; immediate offboarding requires updating admission and restarting. Add internet-edge rate limiting/monitoring appropriate to your host; the application bounds sessions, login attempts, users, document sizes, and per-user storage, but is not a general denial-of-service protection service.

## Verification boundary

Tests and the visibly labeled local preview exercise simulated identities, real cookie sessions, private filesystem storage, quotas, and browser interactions. They do not claim to complete a live Google consent exchange. The deployment owner must supply an OAuth client and validate the real redirect, admission, and TLS configuration. No fake-auth switch is available in `forma host`.
