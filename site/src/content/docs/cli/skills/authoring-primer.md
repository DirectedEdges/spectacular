---
title: "authoring.primer"
description: "The structural contract every authoring skill assumes"
---

The shared context for writing a spec by hand: the two kinds of spec, the three concern files, the six kinds of reference, the order they get authored in, and which source is authoritative for which question.

It is a prerequisite rather than a procedure. Every other authoring skill names it instead of carrying a copy, so an agent reads it once per session and the rest of the session is already taught.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.authoring.primer/`, then named as a prerequisite by the authoring skills.

## Prerequisites

[`specs-cli.primer`](/cli/commands/skills/) — what Specs is and the rules for reading its data. This primer adds what *writing* a spec requires.

## Outline

- The two kinds — `specs/components/<key>/` and `specs/compositions/<key>/` — and how a folder key is spelled.
- The three concern files, what each holds, and the `metadata.concern` every one of them states.
- Anatomy element types, and the rule that `default.elements` describes every element while a variant describes only its delta.
- The six references — `instanceOf`, `$binding`, `$slotContent`, `$token`, `$image`, and the in-spec `$ref` form — and what each resolves against.
- The authoring order, and the two staged reading packs that precede it.
- The authority order: schema, then platform bindings, then rules and guidelines, then this site. Emitted output is never an authority.
- Where the shipped `rules/*.yaml` layer sits against a library's own ratified guidance.

## Files it ships with

| Path | Carries |
|------|---------|
| `rules/anatomy.yaml` | When each element type applies |
| `rules/styles.yaml` | Per style property, including image handling |
| `rules/layoutStyling.yaml` | Flow and positioning |
| `rules/props.yaml` | Prop modeling, including code-only props |
| `rules/slots.yaml` | Slot declaration and fills |
| `rules/variants.yaml` | Variant layering |
| `references/styles.md` | Style properties, token placement, Figma style relationships |
| `references/slots-layout.md` | Layout trees, auto against absolute positioning, slots across the three files |

A rules file is keyed to mirror the schema node it governs, and each item may cite the ADR it projects. A newly learned rule lands as an entry in the matching file, never as skill prose.

## Related

- [Authoring a component](/guides/authoring-a-component/) — the round these rules govern
- [`component.author`](/cli/skills/component-author/) — the skill that consumes this primer
- [`guidelines.propose`](/cli/skills/guidelines-propose/) — the second rules layer, per system
- [Schema documents](/schema/documents/component-api/) — the contract itself
