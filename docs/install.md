# Install and use Forma

Requires Node.js 22+ and npm. Start with the released package:

```sh
npm install -g https://github.com/joeycast/forma/releases/download/v0.4.2/forma-diagrams-0.4.2.tgz
forma serve --directory ~/Forma
```

Open the printed URL (normally http://127.0.0.1:4242). Keep the terminal process running. Forma creates the folder when needed. Stop with Ctrl+C. Use `--port 4243` if the default port is occupied. No account or external service is needed.

If global npm installation requires administrator privileges, use your normal user-owned Node installation or install to a user-owned prefix; do not blindly run npm with sudo.

## Your diagrams

Open **Library** to browse diagrams, search, filter subfolders, refresh agent changes, or change the source folder. Save with **Save** or Cmd/Ctrl+S. The first save asks for a relative path such as `architecture/checkout.forma.json`; subfolders are created. **Export → Forma document** downloads a copy, while **Save** writes back to the library.

If an agent changes a file after you opened it, a conflicting save is rejected and your edits remain in the editor. Reopen the disk version or use a new save path to retain both. Refresh the library to see new agent-created files. The app remembers the active file within the tab session; after restarting the server, reopen it from Library to establish a fresh file revision.

Browser-only/static-hosted Forma has a separate library stored in that browser. It supports path-based organization, but does not read local disk folders. Export native files to back it up or move to a local folder.

## Give your agent the setup prompt

Choose **Agent guide → Copy setup prompt**. The prompt explains installation, the shared folder, how to locate the bundled skill, the CLI workflow, and preservation of human edits. No particular model or harness is assumed.

The skill is at `$(npm root -g)/forma-diagrams/skills/forma/SKILL.md` after a global installation. Specialized skills are alongside it. The package README and document reference explain the same interfaces for other integrations.

## Define your visual identity

Choose **Create or edit design system** in the Design inspector. Set your palette, corners, typography size, and spacing. Advanced JSON exposes roles and all supported properties. Give the design a unique identity ID, save/apply it, and export its JSON for your agents:

```sh
forma style ~/Forma/architecture/checkout.forma.json --system company.design.json
```

Element-level overrides take precedence. Only IBM Plex Sans is bundled for deterministic font metrics; custom font packaging remains future work.

## Source installation and updates

```sh
git clone https://github.com/joeycast/forma.git
cd forma
npm ci
npm run build
node packages/cli/bin.mjs serve --directory ~/Forma
```

Install a newer version's release tarball to update. The diagrams directory is separate from the application and is not replaced during an update. The release includes an SHA-256 checksum file. npm registry publication and Homebrew are not available yet; do not use similarly named packages as substitutes.

Static hosting of `dist/` remains supported. Google sign-in, private server-side user libraries, and optional agent tokens are available through the separate authenticated `forma host` mode; see [self-hosting](self-hosting.md). The local `serve` command only binds to loopback and must not be reverse-proxied onto the internet.
