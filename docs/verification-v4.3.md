# 0.4.3 distribution verification

Verified 2026-09-21.

`npm run check` and `npm publish --dry-run` pass on the 0.4.3 tree. Install docs, the agent setup prompt, and hosted update instructions use `npm install -g forma-diagrams` / `npm update -g forma-diagrams`. GitHub releases still attach a checksummed tarball. Publishing the GitHub release is intended to publish the same version to the npm registry via `.github/workflows/publish.yml`.
