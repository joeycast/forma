# ADR 001: a document engine with three adapters

Status: accepted · 2026-09-20

Forma proves architecture diagrams and process flows, two themes, nested groups,
stable semantic IDs, persistent human overrides, SVG/PNG exports, a file-oriented
CLI, and a static graphical editor. The project is MIT licensed.

## Research and alternatives

- [ELK / elkjs](https://github.com/kieler/elkjs), EPL-2.0: mature layered layout,
  compound graphs, labels and orthogonal routing. Selected as an unmodified dependency.
  [Algorithm reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html).
- [Dagre](https://github.com/dagrejs/dagre), MIT: simpler directed layout, but compound
  grouping and routing would require more of our own infrastructure. Not selected.
- [React Flow](https://github.com/xyflow/xyflow), MIT: selected for pan/zoom,
  selection, keyboard interaction, node dragging and connection handles. Its state
  is disposable view state, never the document format.
- [tldraw](https://tldraw.dev/community/license): production SDK licensing does not
  satisfy the no-proprietary-dependencies requirement. Not selected.
- [resvg-js](https://github.com/thx/resvg-js), MPL-2.0: native local SVG rasterization
  for CLI PNG exports; browser exports use SVG + Canvas. No rendering service.

Research read on 2026-09-20. Lockfile records actual dependency versions.

## Decision

A pure TypeScript core validates and patches documents, measures and wraps text,
composes ELK geometry, routes pinned-node edges, inspects layout, and renders SVG.
Node and browser adapters handle I/O. Exporters consume a resolved scene of native
rectangles, text and polylines, enabling later editable VSDX/PPTX/draw.io exporters.
We do not rasterize the scene inside the native artifact.

The composition layer owns deliberate type scale, an 8px rhythm, comfortable
container padding, semantic accents, title/footer framing, and connector labels.
Layout alone is not the product. SVG primitives are shared by editor and exports.

## Human / agent merge contract

Version 1 JSON contains semantic nodes, edges, groups and layout intent separately
from presentation overrides. Patches upsert by ID and preserve unrelated overrides.
Moves pin absolute positions. Auto layout retains pins; resetting them is explicit.
Deleting a node removes incident relationships and its own override. Renaming an
ID is a delete/add and cannot automatically preserve identity. Groups are derived
containers; group names/accents and node membership are editable, bounds are not.

Resolved scenes carry a document fingerprint and can be emitted separately for
inspection. The MVP does not load those files or implement a geometry cache;
rendering always computes a fresh scene from the native document. Derived layout
is not required in Git. Serialization is stable with no wall-clock timestamps.

## Scope boundaries

No accounts, required DB, hosted AI, collaboration server, MCP, freehand drawing,
or arbitrary vector illustration. No claim of global crossing-free routing.
Inspector diagnostics are geometric heuristics, with explicit thresholds. Pinned
conflicts are reported, never silently 'fixed' by moving the human's node.
