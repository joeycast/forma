---
name: forma-entities
description: Compose entity-relationship and logical data model diagrams with Forma.
---

# Forma entities

Use [the shared file and CLI workflow](../forma/SKILL.md). This skill supplies composition guidance, not a required diagram type.

Name entities with singular nouns. Decide whether this is a logical model or physical schema before adding attributes. For a physical schema, use descriptions with one attribute per line and explicit PK/FK prefixes; keep only attributes needed to explain the model.

Use rectangles of consistent width, arrowless connectors, and explicit cardinality labels such as `1 → 0..many`. Forma currently uses text cardinality rather than native crow's-foot markers: do not imply strict crow's-foot compliance. Edge labels read from source to target. Put the focal entity at the center of the narrative, with one emphasis role.

Use automatic RIGHT layout first. [The entity example](../../examples/gallery/entities.forma.json) shows keys, attributes, and cardinality. Check that each FK agrees with its relationship. For conventions see [ER notation](https://mermaid.js.org/syntax/entityRelationshipDiagram.html); use Forma JSON rather than Mermaid syntax.
