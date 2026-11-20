---
title: "authoring.primer"
description: "The structural contract every authoring skill assumes"
---

The shared context for writing a spec by hand: the two kinds of spec, the three concern files, the six pointer forms, the order they get authored in, and which source is authoritative for which question.

It is a prerequisite rather than a procedure. Every other authoring skill names it instead of carrying a copy, so an agent reads it once per session and the rest of the session is already taught.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.authoring.primer/`, then named as a prerequisite by the authoring skills.

## Prerequisites

[`specs-cli.primer`](/cli/commands/skills/) — what Specs is and the rules for reading its data. This primer adds what *writing* a spec requires.

## Outline

- The two kinds — `specs/components/<key>/` and `specs/compositions/<key>/` — how a folder key is spelled, and what a composition spec holds.
- The three concern files, what each holds, and the `metadata.concern` every one of them states.
- Anatomy element types, and the rule that `default.elements` describes every element while a variant describes only its delta.
- The six pointer forms — `instanceOf`, the in-spec `$ref`, `$binding`, `$slotContent`, `$token`, `$image` — and what each resolves against.
- The authoring order, and the three reading packs that stage it.
- The authority order: schema, then platform bindings, then rules and guidelines, then this site. Emitted output is never an authority.
- Where the shipped `rules/*.yaml` layer sits against a library's own ratified guidance.

## Rules and references are different layers

The primer ships two kinds of supporting file, and knowing which answers a question saves a round from reading both.

| | `rules/*.yaml` | `references/*.md` |
|---|---|---|
| Form | Structured, modality-keyed, ADR-cited | Prose |
| Answers | Which choice is right here | What exists to choose from, and how it connects |
| Keyed to | One schema node | A mechanism spanning several nodes or files |
| Example | "Use a token wherever the library has one; a literal there is a consistency defect" | The table of every style property and the value shape each takes |

The test for where a fact belongs: **a choice at a single node is a rule; a fact that spans more than one node or file is a reference.**

**Rules outrank references.** When both appear to say the same thing, the rules file governs and the reference is the stale copy — the fix is to delete the sentence from the reference, not to reconcile the two. Neither layer is an authority on what a spec *means*: that is the schema's, and both cite it rather than restating it.

## Reading packs

Context loads in three packs, one per concern file. A pack is named for the document it precedes and loads immediately before that document is authored. A pack is read once and never reopened.

| Pack | Loads before | Carries |
|------|--------------|---------|
| api | `api.yaml` | The primers, the `rules/` files for the concepts in play, `references/props.md`, `references/slots.md` and `references/subcomponents.md` as the request calls for them, the conventions, and the props and dependency reports |
| variants | `variants.yaml` | `references/layout.md`, `references/styles.md`, the foundations files for the token types needed, and the styling reports |
| examples | `examples.yaml` | `rules/examples.yaml`, `rules/primitives.yaml`, and the image cache when the component carries imagery |

Styling context read before the contract work sits idle through it, which is why the packs are staged rather than loaded at once. Later documents go on using what earlier packs loaded — slot content triplets carry styles, and the styles map is already in hand — which is why the examples pack is small.

## Files it ships with

| Path | Carries |
|------|---------|
| `rules/anatomy.yaml` | When each element type applies |
| `rules/props.yaml` | Prop modeling, including code-only props |
| `rules/slots.yaml` | Slot declaration, constraints, fills, and sizing |
| `rules/subcomponents.yaml` | Naming a part so it can be found again, and the slot that admits it |
| `rules/variants.yaml` | Variant layering and conditionals |
| `rules/styles.yaml` | Per style property, including tokens and image handling |
| `rules/layoutStyling.yaml` | Flow and positioning |
| `rules/examples.yaml` | What an instance example is for, and what the variants already cover |
| `rules/primitives.yaml` | Authoring the promotion table |
| `references/props.md` | The prop kinds, their required fields, where a prop is read and set |
| `references/slots.md` | A slot across the three files, default against named fills, the pointer forms |
| `references/subcomponents.md` | The four names a subcomponent has to keep in agreement, and where each lives |
| `references/layout.md` | Layout trees, flow against pinning, sizing, and arranging through instances and slots |
| `references/styles.md` | The style property map, structural properties, the token reference shape |

A rules file is keyed to mirror the schema node it governs, and each item may cite the ADR it projects. A newly learned rule lands as an entry in the matching file, never as skill prose and never as reference prose.

## Composition names a spec kind

`specs/compositions/<key>/` is a kind of spec — the same three concern files, holding mostly instances of real components arranged down from `root`.

Arranging and nesting elements is **layout**, covered by `references/layout.md`, and it works the same inside a single component. The two senses of the word are easy to conflate, and the conflation sends a round looking for a composition spec when it is authoring one component's tree.

## Related

- [Authoring a component](/guides/authoring-a-component/) — the round these rules govern
- [`component.author`](/cli/skills/component-author/) — the skill that consumes this primer
- [`guidelines.propose`](/cli/skills/guidelines-propose/) — the second rules layer, per system
- [Schema documents](/schema/documents/component-api/) — the contract itself
