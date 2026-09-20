# Refine the composition

Begin with the sentence the diagram should explain. Keep one dominant reading direction or one explicit center. Groups should express ownership, trust, or a conceptual boundary; avoid a container around every object.

Use automatic layout for relationships, a grid when relative rows/columns communicate meaning, and explicit human pins for exceptions. Prefer a shared design system and a few semantic roles over repeated element styling. A familiar diagram skill can accelerate this; an unfamiliar explanation can use the same primitives directly.

Before delivery, view the render at a useful reading size. Check title hierarchy, label legibility, balanced whitespace, group headings, connector attachment, and the distinction between primary and secondary information. Check fixed-color overrides under every intended identity; changing a background may require an explicit foreground too. Machine inspection reports symptoms, not aesthetic approval. Do not delete meaningful edges to silence warnings.

Preserve human pins while improving surrounding spacing or structure. Clear only a deliberate position with `{"overrides":{"nodeId":{"position":null}}}` when returning that node to automatic layout is appropriate. Do not clear all overrides as a routine fix.

Favor focused views over tiny text. Use SVG for scalable graphics and PNG for destinations that need raster output. Always retain the native document for future human and agent edits.
