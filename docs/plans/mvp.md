# Forma MVP implementation plan

Goal: prove semantic creation → professional composition → human edit → agent
patch preserving edits → local SVG/PNG export.

Architecture: shared TypeScript engine; ELK layout; React Flow editor; Node CLI.
File format: versioned JSON with stable IDs and separate presentation overrides.

- [x] Implement document schema, validation, deterministic serialization and
      transactional ID-based patches in packages/core/src/document.ts. Test duplicate
      IDs, invalid endpoints, hierarchy cycles, unrecognized versions and pin survival.
- [x] Implement text measurement, themes, hierarchical ELK layout, human override
      reconciliation, routing and scene diagnostics. Test both examples plus branch,
      cycle, long-label, negative-pin and overlap fixtures.
- [x] Implement shared SVG node/edge/group rendering and exporter interface.
      Package a local font; verify XML escaping and no remote assets.
- [x] Implement create/validate/patch/layout/render/inspect/export CLI commands,
      machine-readable results and nonzero error exits. Exercise actual files.
- [x] Build static editor with outline, inspector, pan/zoom, dragging, creating and
      deleting nodes/edges, undo/redo, themes, layout, JSON import/save and SVG/PNG.
- [x] Run software, visually inspect diagrams and editor, exercise human edits,
      download the artifact, agent-patch it and inspect/export the result.
- [x] Document API, format, architecture, CLI and known limits; add concise agent
      skill and contributor instructions. Run full build/tests and static preview.
