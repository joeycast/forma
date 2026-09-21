# Contributing to Forma

Use Node.js 22 or newer. `npm ci` installs the lockfile; `npm run dev` starts the
local editor. `npm run check` runs engine and real-process CLI tests, TypeScript,
and the static build. `npm run format:check` checks formatting; `npm run format`
formats the repository.

## Boundaries worth preserving

- Native documents are semantic, versioned JSON. React Flow state is not a file format.
- Put geometry, typography, diagnostics and rendering changes in `packages/core`.
  Keep Node I/O and browser APIs in their adapters.
- Never discard human overrides during semantic patches. Preserve stable IDs.
- The SVG fragments used in the editor are the fragments used for export.
- Do not add runtime accounts, telemetry, remote fonts or operated services.
- Keep the root agent skill concise. Detailed guidance belongs in references.

`documentSchema` is the source of truth for field validation. Run `npm run schema`
after schema changes, and update format documentation and migration decisions.
Cross-object constraints (references, unique IDs and group cycles) also require
`parseDocument`; JSON Schema alone cannot express them all.

The bundled font advances are generated from the static TTFs using
`python3 scripts/font-metrics.py` (standard library only). Regenerate them if fonts
change, and inspect both browser and CLI exports. Glyph advances deliberately omit
kerning: this errs toward a little extra space. Complex text shaping and scripts
outside the bundled font's coverage are not yet a supported visual-quality target.

## Releasing

Bump `package.json` (and lockfile) together with CLI/help version strings and
install docs. Tag `vX.Y.Z` and create a GitHub release with the packed tarball
and `SHA256SUMS-X.Y.Z`. Publishing that GitHub release runs
`.github/workflows/publish.yml`, which publishes `forma-diagrams` to the npm
registry. The workflow needs repository secret `NPM_TOKEN` (an npm automation
token with permission to publish `forma-diagrams`) and `id-token: write` for
provenance.

CLI and `forma host` operators install with `npm install -g forma-diagrams` and
update with `npm update -g forma-diagrams`. Vercel and Docker still deploy a
git tree or image build; npm does not roll those hosts forward.

## Review a visual change

1. Render both `examples/*.forma.json` to PNG and SVG through the CLI.
2. Inspect the actual images, at natural size as well as fit-to-screen.
3. Open the editor, drag a node, edit a label/color, save JSON, then CLI-patch it.
4. Verify the override survives; inspect and export the result again.
5. Check both themes and directions. Include long text and nested groups where relevant.

Tests cover schema rejection, transactional edits, stable serialization, hierarchy,
layout determinism, routing, preserved overrides, diagnostic signals and actual
CLI files. The manual browser acceptance walkthrough is in
[verification](docs/verification.md). Add regression tests for meaningful failures,
not snapshots that merely reproduce the implementation.

## Future exporters

Implement the `Exporter<T>` interface against `Scene`. Map text, shapes, group
hierarchy and connectors to editable native objects where the target permits it.
Do not treat an image pasted into a container as an editable diagram export.

See [architectural decisions](docs/decisions/001-foundation.md). Changes to schema
ownership, pin behavior or required services deserve a new decision record.
