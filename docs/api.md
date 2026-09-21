# Programmatic core

The source API is TypeScript/ESM. This repository is not yet published as a registry package. Use a TypeScript-aware runtime such as `tsx` or a bundler.

```ts
import {
  parseDocument,
  patchDocument,
  serializeDocument,
  layoutDiagram,
  inspectScene,
  renderSvg,
} from './packages/core/src/index.ts';

const document = parseDocument(JSON.parse(nativeFileContents));
const updated = patchDocument(document, {
  nodes: [{ id: 'api', label: 'Public API' }],
});
const scene = await layoutDiagram(updated);
const report = inspectScene(scene);
const svg = renderSvg(scene);
const nativeJSON = serializeDocument(updated);
```

`parseDocument(unknown)` validates and applies defaults, returning a `Diagram`. `patchDocument(diagram, unknown)` returns a validated new document without mutating the input. `serializeDocument(diagram)` returns stable, indented JSON with a trailing newline.

`layoutDiagram(diagram)` asynchronously returns a `Scene`. Layout is implemented using ELK and a composition layer. `inspectScene(scene)` returns machine-readable `issues` with `code`, `severity`, `message`, and affected `ids`, plus a `summary` with error and warning counts. Pinned nodes that sit within 8px of a shared row or column produce `near-alignment` warnings with a `fix` edge and target. `alignNodes`, `distributeNodes`, and `mergeAlignmentPins` produce position pins for `patchDocument`. Inspect after human positioning as well as semantic changes.

`renderSvg(scene, { fontDataUri?, boldFontDataUri? })` returns SVG text. Supply regular and semibold font data URIs for a portable, embedded-font SVG. The CLI embeds the bundled static IBM Plex Sans Regular and SemiBold fonts and registers both with resvg to generate PNG at 2× scale. PNG output above 32 million pixels is rejected before rasterization; use SVG or reduce diagram spread and pinned positions for larger diagrams.

## Adapter boundary

Adapters should read native documents, invoke the core, then write documents or derived exports. They should not store editor-specific state as the canonical format. The browser editor may keep transient viewport/selection state separately; only meaningful document edits belong in version control.

Future exporters should accept `Scene` plus its embedded semantic document. Geometry is available without scraping SVG. This is the intended path for editable draw.io, VSDX, and PowerPoint shapes and connectors. Version those exporters independently of the native schema. External tool protocols, including MCP, can wrap this API or the CLI without affecting the core.

## General composition and design systems

`migrateDocument(unknown)` validates and losslessly upgrades a v1 document to v2. `designSystemSchema.parse(unknown)` validates standalone visual identities; `atelier` and `signal` are bundled examples. Apply one with `patchDocument(doc, {designSystem: system})`. The style cascade is resolved into each scene element's `style`, so adapters can consume editable geometry and resolved appearance directly.

Set `layout.mode: 'grid'` and node `placement: {column,row}` for intentional relative composition. Otherwise ELK infers layered positions. Both paths respect human pins and use the same typography, group bounds, routing, label placement, inspector, and renderer. See [the native format](format.md) for the style vocabulary and context-specific property behavior.
