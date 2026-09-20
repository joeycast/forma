---
name: forma-flow
description: Compose process flows and decision trees with Forma, including readable exception and retry paths.
---

# Forma flow

Use [the shared file and CLI workflow](../forma/SKILL.md). This skill supplies composition guidance, not a required diagram type.

Use verbs for actions and questions for decisions. Label each decision branch explicitly; keep the normal path visually direct. Use pill shapes for entry/exit, rectangles for work, and diamonds for decisions only when they help comprehension.

Start with automatic DOWN layout. For a carefully aligned primary path, use grid placement with its steps in one column and exceptions beside it. `appearance.sourcePort` and `targetPort` can select top/right/bottom/left so retry loops enter from the side instead of crossing the normal path. Dashed lines can distinguish feedback, but label them too.

Use a shared design system and roles before specifying colors. Read [the flow example](../../examples/gallery/decision.forma.json) for a complete retry composition. Inspect branch labels and actual rendered routes; do not silently remove an edge to improve the picture.
