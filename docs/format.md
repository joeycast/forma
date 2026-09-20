# Native document and semantic patches

The canonical artifact is UTF-8 JSON, conventionally `name.forma.json`. `version: 1` is required. The parser validates references, globally unique IDs, group cycles, numeric bounds, and strict schema fields. IDs start with a letter and contain letters, digits, `_`, or `-` (maximum 80 characters).

```json
{
  "version": 1,
  "title": "Request path",
  "type": "architecture",
  "nodes": [
    { "id": "client", "label": "Customer portal", "kind": "client" },
    { "id": "api", "label": "API", "kind": "service", "emphasis": "primary" }
  ],
  "edges": [{ "id": "request", "source": "client", "target": "api", "label": "HTTPS" }],
  "groups": [],
  "layout": { "direction": "RIGHT", "spacing": "comfortable" },
  "presentation": { "theme": "paper", "nodes": {} }
}
```

## Semantic fields

`title` is required; `description` is optional. `type` is `architecture` or `flow` (default architecture). Nodes require `id` and `label`; optional fields include `description`, `group`, `kind`, and `emphasis`. Kinds: `service`, `database`, `queue`, `person`, `process`, `decision`, `client`. Emphasis: `normal`, `primary`, `muted`.

Edges require `id`, `source`, and `target`; `label` is optional and `style` is `solid` or `dashed`. Groups require `id` and `label`; optional `parent` creates nested hierarchy, `description` adds context, and `color` selects an accent. Empty groups are valid but not useful compositions.

Layout direction is `RIGHT` or `DOWN`; spacing is `comfortable` or `compact`. Themes are `paper` and `midnight`. Accent colors are `slate`, `blue`, `teal`, `amber`, and `violet`.

## Presentation ownership

```json
{
  "presentation": {
    "theme": "paper",
    "nodes": { "api": { "position": { "x": 480, "y": 220 }, "color": "blue" } }
  }
}
```

A position is an absolute pin in scene coordinates, recorded by a human drag or an explicit patch. A missing position delegates geometry to the engine. A missing color delegates color selection to the theme and semantic context. Semantic patches preserve presentation unless asked to change it. Keep node IDs stable across edits; deleting and recreating a node loses its identity and associated overrides.

Resolved scene JSON contains measured nodes, groups, edge routes, labels, bounds, and a document fingerprint. It is an intermediate inspection/export artifact, not a native document or stable persistence API. Do not replace native files with scene JSON. The MVP always computes layout from the native document; it does not load scene files or maintain a reusable geometry cache.

## Patch format

Patches are transactional semantic merges, not RFC 6902 JSON Patch. Arrays upsert by ID. Supplied fields replace existing fields; omitted fields survive. New objects must include all required fields. The complete result must validate before it is written.

```json
{
  "nodes": [{ "id": "api", "label": "Public API" }],
  "edges": [{ "id": "request", "label": "HTTPS / JSON" }],
  "layout": { "spacing": "comfortable" },
  "theme": "midnight",
  "overrides": { "api": { "color": "teal" } }
}
```

`title`, `description`, `nodes`, `edges`, `groups`, `layout`, `theme`, `overrides`, and `remove` are supported top-level patch fields. `remove` accepts arrays of IDs under `nodes`, `edges`, and `groups`. Removing a node removes its incident edges and overrides. Removing a group releases its direct children from that group. Set an entire node override to `null` to clear it, or set `position` or `color` to `null` to clear just that field:

```json
{ "overrides": { "api": { "position": null } }, "remove": { "nodes": ["obsolete"] } }
```

To remove optional semantic fields such as descriptions, edit the native JSON directly and validate it; omitted patch fields intentionally mean preserve. CLI writes use temporary files followed by rename. Serialization sorts object keys and preserves semantic array order for readable Git diffs. It is deterministic for the same parsed document.
