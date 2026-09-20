# Native documents, composition, and styling

The canonical artifact is UTF-8 JSON (`name.forma.json`). Version 2 supports general diagrams. Version 1 files remain readable and preserve the original card presentation. Use `forma migrate input.forma.json --output upgraded.forma.json` for an explicit lossless upgrade. A patch introducing v2 capabilities upgrades the version automatically. Unknown fields and unsupported versions are rejected; no editor silently drops them.

IDs start with a letter, then letters/digits/`_`/`-`, up to 80 characters. IDs are globally unique. References and group cycles are validated. See [v2 schema](../schema/forma.v2.schema.json), [frozen v1 schema](../schema/forma.v1.schema.json), and [design-system schema](../schema/design-system.v1.schema.json).

```json
{
  "version": 2,
  "title": "Request path",
  "nodes": [
    { "id": "client", "label": "Customer portal", "kind": "client" },
    { "id": "api", "label": "API", "kind": "service", "role": "emphasis" }
  ],
  "edges": [{ "id": "request", "source": "client", "target": "api", "label": "HTTPS" }]
}
```

No diagram type is required. `type` is optional descriptive metadata, not a layout selector. Node `kind` is arbitrary domain vocabulary; it does not restrict shapes. Nodes can have descriptions and a `group` ID. Groups have labels and optional parent IDs. `role` on a node, edge, or group selects a reusable convention from the active design system. Legacy `emphasis`, group accent `color`, edge `style: solid|dashed`, and base themes remain available.

## General composition

`layout.direction` is RIGHT or DOWN; `spacing` is comfortable or compact. With `mode: layered` (default), relationships drive ELK and the composition/routing refinements. The engine measures typography, sizes shapes, wraps text, fits groups, routes edges, and places edge labels.

Use `layout.mode: grid` when relative placement expresses meaning. Each node can have `placement: {column: 0, row: 1}`. Occupied columns and rows size to their widest/tallest member, with system spacing between them. Indices establish order, not physical units; unused indices do not reserve empty tracks. Each cell holds one node. Omitted placements use the node's array index as column and row zero. Groups fit their descendants after placement. This supports comparisons, parallel streams, phase sequences, and custom explanations without adding categories.

`presentation.nodes[id].position: {x,y}` is an absolute human pin in scene coordinates. Pins override automatic/grid positions. Adding content around pins can conflict; inspect after editing. Clearing just a position returns that node to engine control without erasing its style.

## Design systems

Apply a versioned identity:

```sh
node packages/cli/bin.mjs style diagram.forma.json --system examples/design-systems/atelier.json
```

Standalone systems contain `version: 1`, `id`, `name`, `revision`, and optional `canvas`, `spacing`, `node`, `edge`, `group`, and `roles`. The CLI validates then embeds the system under `presentation.designSystem`. Files are portable snapshots with no external resolution or service dependency. Edit/reuse the system JSON in Git; reapply a revision deliberately. The editor offers Atelier and Signal and preserves imported custom systems. Source editing exposes every supported property.

Cascade, from least to most specific:

1. Built-in theme defaults.
2. Design-system node/edge/group defaults.
3. Design-system `roles[role]`.
4. Node/group `style` or edge `appearance`.
5. Human node override `presentation.nodes[id].style`.

Content and relationships remain intact when changing identity. Use coherent foreground/background overrides when an element must retain a fixed color across light and dark systems.

## Style vocabulary

| Context | Properties                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nodes   | `shape`: rect, pill, diamond, ellipse, cylinder, text; `fill`, `stroke`, `strokeWidth`, `dash`, `radius`, `opacity`, `text`, `secondary`, `fontFamily`, `fontSize`, `fontWeight` (400/600), `padding`, `width`, `height`, `align` (left/center) |
| Edges   | `stroke`, `strokeWidth`, `dash`, `opacity`, `arrowStart`, `arrowEnd` (none/open/filled/diamond/circle), `routing` (orthogonal/straight), `sourcePort`, `targetPort` (top/right/bottom/left); `fill` and `text` color the label plate and text   |
| Groups  | `fill`, `stroke`, `strokeWidth`, `dash`, `radius`, `opacity`, `text`, `fontFamily`; heading geometry stays fixed                                                                                                                                |
| Canvas  | `background`, `text`, `secondary`, `border`, `fontFamily`                                                                                                                                                                                       |
| Spacing | `node` and `layer`, in scene pixels; override the legacy spacing preset                                                                                                                                                                         |

Paint values are hex colors, `none`, or `transparent`. Dash is solid/dashed/dotted. Width is explicit; height is a minimum that grows to avoid clipping text. Pills/diamonds/ellipses center their content. Plain text nodes omit the surrounding shape and are useful for diagram annotations. All values are bounded and data-only: no CSS, remote URLs, or raw SVG fragments.

IBM Plex Sans Regular and SemiBold are bundled, measured, and embedded in exported SVG. Other font families are accepted but may fall back differently across machines; inspection reports that limitation. Portable custom-font packaging is future work. Straight routes attach to shape boundaries and do not avoid obstacles; inspect them. Side ports apply to orthogonal routes. Human pins preserve placement, not a frozen route.

Example customization:

```json
{
  "nodes": [
    {
      "id": "api",
      "style": {
        "fill": "#fff0be",
        "stroke": "#454545",
        "text": "#243b30",
        "dash": "dashed",
        "radius": 0,
        "fontFamily": "IBM Plex Sans"
      }
    }
  ],
  "edges": [{ "id": "request", "appearance": { "dash": "dotted", "arrowEnd": "open" } }]
}
```

## Transactional patches

`patch --patch changes.json` merges arrays by stable ID. Omitted fields survive; new objects need all required fields. Style/appearance properties merge individually. A `designSystem` patch replaces the complete system snapshot; null removes it. Layout fields merge. Top-level title, description, theme, nodes, edges, groups, overrides, and remove are supported.

```json
{
  "nodes": [{ "id": "api", "label": "Public API" }],
  "overrides": { "api": { "style": { "fill": "#eef4ff" }, "position": null } },
  "remove": { "nodes": ["obsolete"] }
}
```

Null removes an entire node override or an override's position, color, or style. To remove one optional element style property or semantic field, edit the native JSON and validate; omission in a patch means preserve. Removing a node removes incident edges and its overrides. Removing a group releases its children. Files are written atomically only after full validation. Serialization sorts object keys while preserving array order for useful Git diffs.

`layout --output scene.json` writes derived measured geometry and resolved styles. A scene is not a persistence format. Do not replace native documents with scene JSON or SVG; those omit editable intent. Both CLI and editor always recompute a scene from the native artifact.
