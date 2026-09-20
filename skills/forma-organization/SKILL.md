---
name: forma-organization
description: Compose readable reporting and ownership hierarchies with Forma.
---

# Forma organization

Use [the shared file and CLI workflow](../forma/SKILL.md). This skill supplies composition guidance, not a required diagram type.

Put roles or teams in node labels, responsibilities in descriptions. Use DOWN layout and arrowless connectors (`designSystem.edge.arrowEnd: none`) for reporting. Reserve emphasis for the focal leadership role; keep peers equal in size and tone.

Distinguish reporting from collaboration with explicit labels and dashed connectors if both are necessary. Avoid decorative containers around every team. A small hierarchy works automatically; use grid rows for levels and balanced columns for peers when presentation matters more than compactness.

[The organization example](../../examples/gallery/organization.forma.json) demonstrates a small hierarchy with only one size override and semantic roles. Validate that every line represents an actual relationship; whitespace should clarify authority, not imply an extra rank.
