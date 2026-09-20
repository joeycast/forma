---
name: forma-architecture
description: Compose software architecture, network boundaries, and data-flow diagrams with Forma.
---

# Forma architecture

Use [the shared file and CLI workflow](../forma/SKILL.md). This skill supplies composition guidance, not a required diagram type.

Choose one audience and abstraction level. A context or container view is often enough; do not mix individual functions with whole systems. Group by ownership or trust boundary, not merely proximity.

Use nodes for components, directed edges for interactions, and short edge labels for protocol or data. Use `kind` freely for domain meaning; it does not select a renderer. Prefer `layout.direction: RIGHT`, a shared design system, and `role: emphasis` on the primary boundary. Use cylinder geometry only where persistent storage matters. Separate async work with a labeled edge rather than color alone.

Start from [the architecture example](../../examples/gallery/architecture.forma.json) for conventions, replacing content and stable IDs deliberately. Avoid copying its positions; it is automatically laid out. Render, inspect, and verify arrow direction and trust boundaries. See [C4 levels](https://c4model.com/diagrams) for choosing scope.
