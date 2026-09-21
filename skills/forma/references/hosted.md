# Hosted agent access

Use this only when the user has a hosted Forma workspace and has given you an agent token from **Agent access**. Do not ask for Google credentials or browser cookies.

```sh
export FORMA_REMOTE_URL=https://diagrams.example.com
umask 077
printf '%s\n' "$TOKEN" > "$HOME/.config/forma/agent.token"
chmod 600 "$HOME/.config/forma/agent.token"
export FORMA_AGENT_TOKEN_FILE="$HOME/.config/forma/agent.token"
# Prefer the file. Use FORMA_AGENT_TOKEN only in a secret environment, never both.
```

```sh
forma remote whoami
forma remote list
forma remote pull path/to/diagram.forma.json --output diagram.forma.json
# edit the native file with validate / inspect / render
forma remote push diagram.forma.json
```

`--create --path folder/name.forma.json` creates a new server file. `--overwrite` on pull replaces a local file and sidecar after you have preserved local edits.

The sidecar `diagram.forma.json.forma-remote.json` binds server, owner, path, and revision. Do not copy it onto a different user, host, or path. A conflict means the file changed on the server: pull into a new output path, reconcile, and push that copy.

`forma mcp` exposes `forma_list_diagrams`, `forma_read_diagram`, `forma_write_diagram`, `forma_inspect_diagram`, and `forma_render_svg` over the same token. Write requires the latest revision; `null` creates a new file only. HTTP `/mcp` exists only if the administrator enabled it; the stdio bridge works without that.

The token can only see that user’s library, optionally limited to one folder prefix. A 401 after a working session usually means expiry or revocation.
