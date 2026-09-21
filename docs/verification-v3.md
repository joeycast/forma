# Usability release verification

Verified locally on 2026-09-20 for v0.3.0.

- `npm run check`: 20 tests, TypeScript, and production build pass. File-server integration covers nested files, revision conflicts, external edits, directory changes, stale workspace rejection, traversal/symlink rejection, Origin/Host restrictions, and required mutation headers.
- Real browser: opened a diagram from a nested local folder, changed its title, saved it to disk, created and applied a custom gold design system, and saved again. Read the disk file to confirm both changes.
- Changed that file externally. The editor rejected its stale save without discarding the draft. Refreshed Library and reopened the agent-modified document; the custom identity and individual overrides remained intact.
- Saved a second file under a new subfolder and reloaded the page. The active save path survived the tab reload. Changed the source directory in the UI, created the missing folder, and saved there successfully.
- Stopped the local server after the diagram loaded. Browser SVG and PNG exports both downloaded successfully; PNG displayed the success notification. Inspected the actual PNG: typography, group bounds, arrow routing, colors, and the individually dashed verification node remained correct.
- Static-hosted build: saved a diagram to the browser library under a virtual subfolder. No local file server or account was required.
- The in-app agent prompt includes installation, skill discovery, source folder, CLI verification, and human-edit preservation. Its copy button was exercised.
- Packed the release and installed it to an isolated npm global prefix. From outside the repository, the installed `forma` created and rendered an architecture diagram with zero inspection warnings/errors, then served the packaged editor. Browser library tests ran against that installed editor.

The export change removes the export-time font fetch and rejected-promise cache. The originally reported intermittent failure was not independently reproduced; the now-network-independent export path was directly verified with the server stopped.

Known boundaries: one local folder server, explicit saves/refresh, optimistic file revision checks rather than cross-process transactions, and browser-local saved design presets. Local server restarts require reopening the file from Library. Static browser storage is not a backup. Google authentication and organizational server storage are deliberately deferred.
