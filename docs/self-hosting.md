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
| `FORMA_ENABLE_MCP`           | `true` enables the optional Streamable HTTP MCP endpoint at `/mcp`; default is off      |

HTTP is allowed only for `localhost` or `127.0.0.1` development origins and binds to loopback. Google must have the matching loopback callback URI registered. Production uses HTTPS Secure cookies. Forma does not infer its public URL from untrusted forwarded headers. `/healthz` is a public health endpoint, still subject to the canonical Host check.

## Vercel (personal hosted editor)

The static Vercel deployment can run the same Google sign-in and private library as `forma host`, using [Vercel Blob](https://vercel.com/docs/vercel-blob) instead of a local disk. Sessions are signed cookies, so they work across serverless invocations. This is a personal/small-team host, not a replacement for a dedicated VM when you need a locked data directory.

1. Create a Google **Web application** OAuth client. Authorized JavaScript origin and redirect URI:

```
https://YOUR-DEPLOYMENT.vercel.app
https://YOUR-DEPLOYMENT.vercel.app/auth/callback
```

2. Create a private Blob store and set environment variables on the Vercel project (Production and Preview):

| Variable                     | Meaning                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `FORMA_HOSTED`               | `1` so the editor build includes the hosted sign-in shell               |
| `FORMA_PUBLIC_URL`           | The stable `https://….vercel.app` origin (no path)                      |
| `FORMA_GOOGLE_CLIENT_ID`     | Google Web client ID                                                    |
| `FORMA_GOOGLE_CLIENT_SECRET` | Google client secret                                                    |
| `FORMA_ALLOWED_EMAILS`       | Your Google account, comma-separated if several                         |
| `FORMA_ALLOWED_DOMAINS`      | Optional Workspace `hd` values                                          |
| `FORMA_SESSION_SECRET`       | Long random string; changing it signs everyone out                      |
| `BLOB_READ_WRITE_TOKEN`      | Set automatically when a Blob store is linked to the project            |

3. Redeploy. Visit the production origin, sign in with an allowed Google account, and save a diagram in Library. Agent tokens from **Agent access** still work with `FORMA_REMOTE_URL` set to that origin.

## Updating a hosted instance

The application and the diagram store are separate. An update replaces Forma. It does not replace libraries, Blob objects, Docker volumes, or `FORMA_DATA_DIR` unless you delete those yourself.

Check the latest GitHub [release](https://github.com/joeycast/forma/releases) and its notes before you move. Read the notes for env-var or OAuth-redirect changes. Google client secrets, allowlists, and session/Blob tokens stay on the host; they are not in the public repository.

### Node (`forma host`)

Installations today use the GitHub release tarball, which npm already understands:

```sh
npm install -g https://github.com/joeycast/forma/releases/download/v0.4.2/forma-diagrams-0.4.2.tgz
```

Restart the `forma host` process (or its supervisor). Leave `FORMA_DATA_DIR` pointed at the same disk. Verify `/healthz`, then sign in and open a known diagram.

The npm registry name `forma-diagrams` is reserved in documentation for a future `npm install -g forma-diagrams` / `npm update -g forma-diagrams` flow. Until a registry package is published, do not install similarly named packages. Source checkouts update with `git fetch` and a checkout of the release tag, then `npm ci && npm run build`, then restart.

### Docker Compose

Keep the named volumes. Rebuild and recreate the app container from the tag you want:

```sh
git fetch
git checkout v0.4.2
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

Do not pass `--volumes` to `docker compose down` unless you intend to delete diagrams and TLS state.

### Vercel

A Vercel project runs a specific deployment of this repository. Env vars and Blob data survive deploys.

If Production is **not** connected to GitHub (CLI deploys only), update by deploying the tree you want:

```sh
git fetch
git checkout v0.4.2
vercel --prod --yes
```

If you connect GitHub, every push to the linked branch deploys that branch to the project. That is convenient and also means `main` commits go live on your login host. Prefer Production deploys from **release tags** when the project is your own workspace.

After changing Vercel env vars (allowlist, OAuth, session secret), trigger a new deployment so the functions load the new values.

npm does not update a Vercel site. Registry packages help CLI and `forma host` operators; Vercel still needs a git or CLI deploy of the app.

## Daily use and agents

After sign-in, Library opens to your private files. Create diagrams, organize them with relative paths such as `engineering/platform.forma.json`, and save explicitly. Reloading opens Library rather than restoring a private draft from browser storage. Unsaved hosted edits do not survive a page reload or sign-out; use Save or export a native copy first. Sign-out also closes authenticated views in other tabs.

Use **Agent access** to issue a scoped, revocable token for a user’s own library. The agent never receives Google credentials or browser cookies. Set `FORMA_REMOTE_URL` to this origin and store the token in a private `chmod 600` file referenced by `FORMA_AGENT_TOKEN_FILE` (or `FORMA_AGENT_TOKEN` in the agent’s secret environment). Then:

```sh
forma remote whoami
forma remote list
forma remote pull engineering/platform.forma.json --output platform.forma.json
forma remote push platform.forma.json
```

`forma mcp` is a local stdio bridge over that same authenticated API. Set `FORMA_ENABLE_MCP=true` only if you also want Streamable HTTP clients to POST to `/mcp` with a Bearer token. This release does not implement MCP OAuth discovery; prefer the stdio bridge when the client cannot set HTTP headers. Revoking a token in the editor blocks new operations immediately. File export/import still works if a user does not want to issue a token.

Opening an imported file detaches its old library binding; save to a new path if one already exists. Remote pull/push keep a `.forma-remote.json` sidecar with the server, owner, path, and revision; a conflict means reread and reconcile rather than retrying blindly.

Applied design systems live inside saved diagrams. In hosted mode, saved design presets last for the page session; export the design JSON to reuse it elsewhere. Shared organizational preset administration is not included yet. Agent tokens are stored hashed in `agent-tokens.json` at the data-directory root; include that file in backups.

## Administration, backup, and recovery

Data lives under `users/<opaque-subject-hash>/diagrams/` as native JSON. The sibling `identity.json` identifies the owner for the administrator. Ordinary users cannot access this metadata or other user directories through HTTP. Host administrators can read the disk; this is not end-to-end encrypted storage.

Back up the entire data directory/volume, preserving ownership and permissions. Stop Forma for a consistent snapshot. Restore into a stopped instance; omit `.forma-host.lock` from a restored snapshot, then start and verify two users' files. Keep secrets and TLS backups separate from public source control. Test recovery periodically. Stop-before-copy also applies to administrative file moves or deletions; the app currently has no delete/retention UI.

A clean shutdown removes `.forma-host.lock`. After an unclean shutdown the lock may remain. Confirm that every Forma process using that directory is stopped before removing that one lock file; never remove a live process's lock. Named Docker volumes can be inspected or mounted in a maintenance container by an administrator. Do not remove the users directory to clear a lock.

Admission is `FORMA_ALLOWED_EMAILS` and/or `FORMA_ALLOWED_DOMAINS`. Domain access permits all users whose verified Google `hd` matches; use explicit emails when selective access is required. Existing files remain when admission is removed. On Node/`forma host`, changing the allowlist requires a process restart and in-memory sessions are cleared. On Vercel, change the env vars and redeploy; admission is re-checked on each API request. Sessions expire after 12 hours. Google account changes are checked on the next sign-in. Immediate offboarding is: update the allowlist, then restart or redeploy. Add internet-edge rate limiting/monitoring appropriate to your host; the application bounds sessions, login attempts, users, document sizes, and per-user storage, but is not a general denial-of-service protection service.

## Verification boundary

Tests and the visibly labeled local preview exercise simulated identities, real cookie sessions, private filesystem storage, quotas, and browser interactions. They do not claim to complete a live Google consent exchange. The deployment owner must supply an OAuth client and validate the real redirect, admission, and TLS configuration. No fake-auth switch is available in `forma host`.
