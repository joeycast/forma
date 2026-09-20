# General engine verification

Performed locally on 2026-09-20, after validating the original MVP. No remote CI run or external deployment is claimed.

## Automated checks

`npm run check` runs the original regression suite plus general-engine tests, TypeScript checking, and the static production build. The 19 tests cover v1 compatibility, explicit migration, strict style validation, style cascade precedence, transactional merges, preservation of human overrides, grid reflow, side ports, diagonal obstacle intersection, ellipse attachment, and every rendered gallery artifact. The original CLI file workflow remains covered.

Every gallery artifact has zero errors and zero warnings from the inspector. The inspector measures geometric heuristics; it does not certify aesthetic quality. All eight PNGs were also visually reviewed. Refinements included moving a feedback loop to side ports, composing the mind map around its center, reducing excess export whitespace, increasing timeline breathing room, and fixing fixed-color text contrast under a dark design system.

The seven repository skills passed the skill-creator validator. The initial Python environment lacked PyYAML; validation used a temporary virtual environment with PyYAML, without adding it to the product dependencies. Skills remain plain Markdown and harness-independent.

## Actual graphical round trip

1. Rendered `examples/gallery/development.forma.json` through the CLI and inspected the PNG.
2. Opened that native file through the web editor's file chooser.
3. Changed `verify` from **Verify & integrate** to **Verify with evidence** using its label control.
4. Changed its fill to `#ffe5a3` using the appearance control.
5. Dragged it graphically; the saved position is **x 568, y 336**.
6. Downloaded the native document through Export. The result is preserved in `examples/roundtrip/human-edited.forma.json`.
7. Applied `examples/roundtrip/agent-patch.json` via the CLI. It updates descriptions and adds the connector label **Evidence accepted**, without replacing human properties.
8. Exported the result to SVG and PNG, with strict inspection reporting zero issues.
9. Reopened it in the editor and verified the new description, label, fill, and pin. The complete result is `examples/roundtrip/agent-continued.forma.json`.

Assertions against the actual downloaded file checked that the original node style object survived unchanged, the human fill override survived, and the complete presentation object was identical before and after the agent patch.

## Static-client and design-system checks

The production build was served at a nested `/forma/` path using Python's static HTTP server. The native v2 round-trip artifact loaded and rendered without an application backend. The visual identity selector changed the imported diagram to Signal while preserving content and explicit node styles. As documented, changing system geometry around absolute human pins can produce layout suggestions; no pin was silently discarded. The separate unpinned Signal gallery artifact demonstrates a clean complete restyle of identical content.

CLI `migrate` and `style --system` were also exercised on the original v1 architecture artifact. The resulting document validated as v2. New CLI commands preserve atomic-write behavior.

## Remaining limits

- Only IBM Plex Sans is bundled and measured. Other font names survive editing but can use platform fallback; inspection warns about them.
- Group heading dimensions are fixed. Context-specific style properties are documented rather than interpreted as arbitrary CSS.
- The grid is content-sized and ordinal. Empty index gaps do not reserve tracks; timelines are not calibrated time-axis or scheduling tools.
- Absolute pins can conflict after structural or design-system changes; inspection makes those conflicts visible.
- Direct connectors do not avoid obstacles. Orthogonal routing has obstacle avoidance, but dense diagrams can still need refinement.
- Crow's-foot markers, full sequence lifelines, reusable component definitions, and editable Office/draw.io exporters remain future work.
- Large build-chunk warnings come from the lazy ELK bundle and editor dependencies. Runtime remains local and static.
