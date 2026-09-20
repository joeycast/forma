# Composing diagrams

Architecture diagrams should tell one story: a request path, a deployment boundary, or a data flow. Use groups for actual conceptual boundaries. Start with left-to-right flow, comfortable spacing, short noun labels, and descriptions that clarify responsibilities. Emphasize the component central to the story. Use dashed edges for asynchronous or secondary paths and label protocols only where they help.

Process diagrams should show the normal path clearly. Use verb phrases, decision nodes for branching, and concise edge labels that identify outcomes. A return edge is useful when it communicates an actual feedback loop; many backward edges usually mean the story should be split into smaller diagrams.

Before delivery, inspect the SVG at a useful display size. Check title hierarchy, legibility, group boundaries, whitespace, edge-label separation, and visual balance. Machine inspection reports geometric symptoms, not artistic approval. Warnings are leads to investigate, not instructions to delete meaningful connections.

If a human pin creates a collision after adding content, first preserve that pin and improve the surrounding structure or spacing. A deliberate position can be cleared with `{"overrides":{"nodeId":{"position":null}}}` when returning that node to automatic layout is appropriate. Do not clear all overrides as a routine fix.

Prefer fewer nodes and a focused narrative over tiny text or a dense tangle. The MVP supports architecture and process flows, not arbitrary illustration. Export SVG for scalable graphics; PNG for destinations that cannot display SVG. Always retain the native document for future edits.
