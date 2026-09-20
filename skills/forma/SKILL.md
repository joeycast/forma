---
name: forma
description: Create, modify, inspect, and export professional diagrams using Forma's local files, CLI, and shared graphical editor.
---

# Forma

Use `node packages/cli/bin.mjs` from this repository; `--help` returns JSON. No account, service, MCP server, or particular agent harness is needed.

Write a version 2 native document with stable node/edge/group IDs, short labels, relationships, and meaningful roles. No diagram type is required. `create --output diagram.forma.json` produces a blank document. The [format reference](../../docs/format.md) explains primitives, composition, style precedence, and patching.

Prefer semantic relationships and automatic layout. Use a composition grid when relative rows and columns carry meaning. Use human position overrides for deliberate exceptions. Adopt an organizational identity with `style diagram.forma.json --system examples/design-systems/atelier.json`; per-element styles remain intact.

Run `validate`, `inspect`, and `render --output diagram.png` on the artifact. **View the actual render** and refine its hierarchy, spacing, routing, and readability. Zero diagnostic warnings is useful evidence, not proof of good design. Deliver the native file and export together.

For edits, reload the human's latest saved file and use `patch --patch changes.json`. Preserve IDs and presentation overrides. Never reconstruct a diagram merely to add a node or change a label. `layout --output scene.json` is derived geometry, never the source artifact. CLI exit 1 means invalid input/execution; inspect exits 2 for errors (also warnings with `--strict`).

Use a specialist only if it helps: [architecture](../forma-architecture/SKILL.md), [decisions and flows](../forma-flow/SKILL.md), [organization](../forma-organization/SKILL.md), [entities](../forma-entities/SKILL.md), [timelines](../forma-timeline/SKILL.md), [mind maps](../forma-mindmap/SKILL.md). For an unfamiliar explanation, combine primitives directly; skills are accelerators, not boundaries. See [composition](references/composition.md) when refining.
