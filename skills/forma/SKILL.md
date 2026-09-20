---
name: forma
description: Create and improve professional architecture diagrams and process flows using Forma's native JSON, local CLI, and visual inspection.
---

# Forma

Use the repository's `node packages/cli/bin.mjs` command. No service, account, agent provider, or MCP server is required. Run `--help` for machine-readable usage.

1. Choose `architecture` or `flow`. Start with `create --template architecture --output diagram.forma.json`, or write a native document using [the format reference](../../docs/format.md).
2. Express components, relationships, meaningful groups, short labels, and one or two primary points of emphasis. Prefer semantic intent over coordinates.
3. Run `validate diagram.forma.json`, then `inspect diagram.forma.json`.
4. Run `render diagram.forma.json --output diagram.svg`. Open and inspect the actual output; inspection heuristics cannot judge the full composition.
5. Iterate using `patch diagram.forma.json --patch changes.json`. Preserve stable IDs and human overrides. Never rebuild an existing document from scratch just to change a label or add a component.
6. Export with `export diagram.forma.json --output diagram.png`, and deliver the native JSON alongside the export.

Humans can open, edit, and save the same native document in the web editor. Reload their saved file before editing again. Only clear pinned positions when explicitly appropriate; semantic patching preserves them automatically.

See [composition guidance](references/composition.md) for visual refinement. CLI stdout is JSON; errors go to stderr. Exit 1 means input/execution failure; inspect exits 2 for errors, and also for warnings under `--strict`. `layout --output scene.json` produces derived geometry, never the authoritative document.
