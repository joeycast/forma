# Alignment verification

Verified during the 0.4.2 implementation on 2026-09-21.

## Automated checks

`npm run check` passes all 31 tests, TypeScript, and the production build. Formatting checks also pass. New coverage in `tests/align.test.ts` and the CLI suite exercises:

- Left alignment to the selection bounds and even-gap distribution.
- Pinned near-alignment inspection on rows and columns, with merged x/y `--fix` pins.
- Snapping an unpinned neighbor to a pinned edge without marking it pinned.
- `forma align --left --ids` writing shared coordinates.

Existing engine, gallery, hosted, and local-library tests remain green. Automatic layout is unchanged; near-alignment warnings apply to pinned nodes.

## Browser and deployment boundary

The editor bundle includes multi-select, the align bar, inspector actions, 8px snap matching the visible grid, and arrow-key nudge. Those UI paths were not clicked in a live browser in this environment; the core and CLI operations they call are covered by tests.

Static hosting of `dist/` remains the account-free editor. Organizational Google sign-in still requires `forma host`.
