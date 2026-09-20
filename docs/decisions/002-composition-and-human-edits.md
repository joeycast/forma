# ADR 002: composition, routing and typography

Status: accepted · 2026-09-20

ELK provides hierarchical directed layout and orthogonal routes. Forma adds:

1. Text-aware node dimensions using bundled font advance widths, wrapping and an
   8px sizing rhythm. Both regular and semibold static fonts are embedded in exports.
2. Consistent group padding, type scale, muted secondary text, restrained semantic
   accents, emphasis and a title/footer frame.
3. Compression of empty bands between top-level containers. Compound layouts can
   otherwise reserve disproportionate whitespace; only wholly empty bands shrink.
4. Label candidates scored against components, headings and existing labels.
5. Human position reconciliation after automatic composition. Pins remain absolute;
   group bounds expand to contain the moved descendants.
6. Selective rerouting of edges touching moved nodes or crossing their new positions.
   Unaffected automatic routes and node geometry remain stable for position-only edits.

Pinned routes use an orthogonal visibility grid with bend penalties, respecting
component obstacles. Impossible overlapping pins are preserved and diagnosed,
not silently repositioned. The MVP does not guarantee crossing-free routing or
optimal placement under arbitrary constraints. Label placement and spacing checks
are deterministic geometric heuristics. Review rendered diagrams as well as reports.

## Corrections discovered during implementation

ELK can store an edge in the root array while identifying a nested coordinate
container. Resolve the reported container offset before using its sections.

ELK ignores plain compound width hints in some layouts. Use minimum-size
constraints to ensure group headings fit, including after human moves.

The initial variable font did not produce matching weights in resvg and browsers.
Use upstream static IBM Plex Sans Regular and SemiBold files in both adapters.

Keyboard moves and pointer drags both emit completed position changes through
React Flow. Persist those changes through the document patch API; never leave
keyboard edits solely in editor view state.

## Export and diagnostic boundary

A resolved scene contains native semantic objects, boxes, text lines and connector
points. Exporters can inspect these without parsing SVG. Derived geometry is not
written back into the canonical artifact. No persisted scene cache is implemented.

CLI PNG exports are 2x, capped at 32 million pixels. Browser exports clamp to an
8192px edge and 32 million pixels to respect canvas limits; SVG remains scalable.
