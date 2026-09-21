# 0.5.0 connector and text verification

Verified 2026-09-21.

40 automated tests, the production build, and `npm publish --dry-run` pass on the 0.5.0 tree. Install docs, the agent setup prompt, and hosted update instructions still use the GitHub release tarball. `forma-diagrams` is not on the npm registry; the 0.4.3 publish workflow failed with `ENEEDAUTH` because `NPM_TOKEN` is not available to Actions. Publishing the GitHub release will try that workflow again.

0.5.0 adds evenly spaced connection points (one per side by default), optional pinned connector paths, routing that keeps existing bends and allows shared horizontal or vertical runs, shift-click multi-select, and text alignment on both axes.
