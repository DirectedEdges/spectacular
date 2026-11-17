---
title: "Conformance"
description: "What it means for a document to conform, and the reference validator that decides it — @directededges/specs-schema-core"
---

A Specs document conforms when it passes two layers: the JSON Schema for its [document kind](/schema/specification/#2-documents), and the [specification's](/schema/specification/) semantic rule catalogue (§9) — the requirements JSON Schema cannot express, like pointer resolution, slot acceptance, and cross-document agreement.

The reference validator, **`@directededges/specs-schema-core`**, is the normative answer to "does this document conform". It runs both layers and reports every failure by rule identifier:

- `DSPEC-nn` — a catalogue rule, citable against the specification's §9 table
- `schema` — a JSON Schema failure

The identifier is the contract. The [conformance suite](/schema/conformance/fixtures/) pairs each rejected fixture with the one rule it violates, so a validator that rejects a document for the wrong reason does not conform — a stricter bar than rejecting it at all.

## Why a second package

`@directededges/specs-schema` publishes the contract — TypeScript types and JSON Schema — and is constitutionally limited to zero runtime dependencies. A validator needs `ajv` and `ajv-formats`, so it lives in its own package, which depends on the schema package for the files it validates against. This is also what makes the schema's `format` constraints (`uri`, `uri-reference`, `date-time`) checked rather than correct by inspection: plain ajv silently ignores them without `ajv-formats`.

## What each kind validates against

The schema a document validates against depends on its kind, and picking the wrong target silently narrows the check:

| Kind | Target |
|------|--------|
| Component | the `Component` definition in `component.schema.json` |
| Component concern | `component-concern.schema.json` — the file's root, which carries the choice over its three document kinds |
| Composition concern | `composition-concern.schema.json` — likewise its root |
| Components index | `components.schema.json` |
| Conventions | the `Conventions` definition — the file declares no root schema |
| Settings | the `Settings` definition — likewise |
| Supplemental | `supplemental.schema.json` |
| Guidelines | `guidelines.schema.json` |

Validating a concern document against one definition *inside* its file would check only that kind's branch and pass documents the top-level choice rejects. The validator encodes these targets so a consumer never has to.

## Scope: one document, or a concern set

The validator checks what a document states about itself, and it merges a [split spec](/schema/component/#concern-documents) into the whole document the catalogue evaluates — see [the validator API](/schema/conformance/validator/). What it deliberately does not do is resolve a workspace: a pointer rooted outside the document (`#/components/…`, `<file>#/…`) needs the rest of the catalogue, and [`specs validate`](/cli/commands/validate/) checks those across files in its reference layer, using this package as its engine.

Two catalogue rules are uncheckable from documents alone and are declared as such in the package's `UNCHECKED_RULES`, each with its reason: DSPEC-33, because what must stay constant across variants is producer behaviour across generation runs; and DSPEC-63, whose structural half the guidelines schema enforces and whose prose half no validator can judge.

## See Also

- [The validator API](/schema/conformance/validator/) — `validateDocument`, `validateConcernSet`, and the layers exposed separately
- [The conformance suite](/schema/conformance/fixtures/) — the fixture corpus and its completeness guarantees
- [Specification §9–§10](/schema/specification/) — the rule catalogue and the conformance requirements this package implements
- [`specs validate`](/cli/commands/validate/) — the same engine run over a whole workspace
