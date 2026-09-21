# ADR 004: Local usability and distribution

Status: accepted, 2026-09-20.

The graphical editor needed a discoverable library, reusable user-defined design systems, and a setup path that does not assume the user knows the repository. These take priority over organizational authentication.

## Local storage adapter

`forma serve --directory PATH` starts an optional Node HTTP adapter on loopback. It creates the chosen folder if missing and serves the prebuilt editor. The default directory is `~/Forma`. The library recursively lists `.forma.json` files and subfolders; users can switch to another absolute source directory in the UI. Files remain ordinary Git-friendly documents readable by any agent.

Save is explicit. Browser recovery is labeled as a draft rather than falsely claiming it has been saved to disk. Opening another library file starts a fresh undo history. Unsaved edits require a save-or-open-without-saving choice. Export always downloads a separate artifact and does not change the native file binding.

The adapter validates documents, rejects path traversal and symlinks, bounds file/request sizes, serializes its own mutations, and compares file-content revisions before overwriting. This is optimistic conflict detection, not a cross-process database transaction: external tools should still reread immediately before patching. A changed workspace ID rejects stale tab writes after a source-directory switch. Requests use a same-origin custom-header check, strict loopback Host validation, and no CORS permission. This server has no authentication and is deliberately **not an internet-facing self-hosted service**.

A static deployment keeps a browser-only library with virtual subfolder paths and import/download workflow. It cannot read arbitrary local folders without the optional local adapter. Browser libraries and saved visual identities are convenience storage, not backups.

## Exports

The previous export path fetched fonts at click time and retained rejected fetch promises. A stopped server or failed request could therefore repeatedly produce a fetch error. Fonts are now embedded in the already-loaded application bundle, removing that runtime request and preserving deterministic SVG/PNG exports. The library may be unavailable if its process is stopped; rendering and export of the open scene continue locally.

## Custom visual identities

A dedicated editor provides palette, typography size, corner, and spacing controls, plus validated full JSON for the complete style vocabulary and roles. Users can save a design in their browser, reuse it, import it, or export a standalone JSON for agents/Git. Applying it retains element overrides. No new canonical schema is needed.

## Distribution

Start with GitHub source and a versioned npm-installable release tarball containing the built static editor, CLI, core, bundled fonts/licenses, examples, and repository skills. Runtime `tsx` belongs in production dependencies because the current package exposes TypeScript source. `npm install -g RELEASE_URL` provides `forma`; `forma serve` provides the editor without a build step for users. Validate an actual packed install before publishing the release. No npm-registry credentials, curl-to-shell bootstrapper, or Homebrew tap are required for this first distribution path.

## Later: organizational hosting

Google sign-in and per-user server-side diagram storage are deliberately deferred. That mode needs OAuth/OIDC authorization-code flow, secure sessions, explicit user/workspace authorization, ownership checks on every file operation, storage quotas, backups, and conflict handling. The organization should operate and configure its own Google client and host. The shared core/document and storage-adapter boundary allow this without adding accounts or cloud dependencies to local mode. Do not expose the local adapter as a shortcut to that product.
