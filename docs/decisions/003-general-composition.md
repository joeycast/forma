# ADR 003: General composition and organizational design systems

Status: accepted, 2026-09-20.

## Evidence and scope

The original MVP was validated before this phase (14 tests, production build, real editor round trip). Its shared renderer, ELK hierarchy, native patch model, and React Flow interaction layer remain useful. Closed `type` and `kind` enums, fixed card geometry, and two palettes unnecessarily limited agents.

We reviewed [C4's levels](https://c4model.com/diagrams), [Mermaid's ER conventions](https://mermaid.js.org/syntax/entityRelationshipDiagram.html), its [sequence](https://mermaid.js.org/syntax/sequenceDiagram.html) and [timeline](https://mermaid.js.org/syntax/timeline.html) references, and [Graphviz layout families](https://graphviz.org/docs/layouts/). C4 emphasizes audience and abstraction level; ER diagrams need explicit cardinality and attribute conventions. Different layout families solve different geometry problems. None implies that a document must select a diagram category.

The initial skills cover systems, process decisions, organization, data models, phase timelines, and concept maps. This is a deliberate coverage choice across different professional communication tasks, not a measured popularity ranking. Sequence lifelines and calibrated time axes deserve further work rather than a superficial claim of full support.

## Decisions

- Version 2 keeps nodes, directed relationships, nested groups, and stable IDs. `kind` is open domain vocabulary; `type` is optional descriptive metadata and never a renderer dispatch key. No category-specific geometry implementation is added.
- Retain ELK for inferred layered geometry. Add a content-sized composition grid, general geometric shapes, straight connectors, and explicit cardinal-side ports. Grid cells encode relative composition; measured text and design-system spacing determine pixels. Human absolute pins still win.
- General shapes are rectangles, pills, diamonds, ellipses, cylinders, and text annotations. There is no raw SVG/path/CSS injection or illustration canvas. Legacy v1 cards retain their original renderer.
- Use a data-only, strict style vocabulary. Cascade: built-in fallback → system element defaults → named system role → element style → human node override. `roles` are arbitrary reusable visual conventions, not engine-defined semantic types. A role like `caution` can be reinterpreted by another organization.
- A design system has its own version, stable ID, human name, revision, canvas treatment, spacing, node/edge/group defaults, and role styles. Standalone JSON files are reusable; applying one copies a snapshot into the native document. This makes a file portable and deterministic without a filesystem resolver or network dependency. Updating the organization file does not silently change existing diagrams: reapply deliberately.
- Node/group `style` and edge `appearance` stay separate from their semantic labels/relationships. Legacy edge `style: solid|dashed` remains compatible. Arbitrary semantic kinds leave a future component library room to map meaning to visual conventions without changing identity.
- The editor patches the same validated artifact. Advanced supported fields are preserved even when controls are absent; source editing exposes the full format. There is no agent-only representation.
- Patches merge element style properties and retain omitted fields. Migration is explicit for existing files; use of v2 features through a patch upgrades the version. Unknown schema fields and future versions fail rather than disappear.

## Composition evaluation

The first custom comparison proved grid-based fan-out/fan-in without a bespoke diagram type. Reviewing exports revealed a retry crossing, a low-contrast override after restyling, and excess whitespace in short diagrams. Side ports, coherent foreground/background overrides, and content-fit v2 bounds resolved those cases. Direct connectors now use shape intersections and diagonal collision detection. The representative gallery has no inspection warnings; the visual review remains separate from that metric.

## Tradeoffs

IBM Plex Sans is bundled and measured exactly. Other font family names are preserved and rendered through available fallback, but are not portable until a future font packaging mechanism; inspection warns about this. Shape styles are typed but context-specific: marker/routing properties affect edges; geometry and text sizing affect nodes. Group headings retain fixed size to keep containment reliable. No crow's-foot markers, reusable object definitions, external asset loading, collaborative backend, or additional exporter formats are claimed in this phase.
