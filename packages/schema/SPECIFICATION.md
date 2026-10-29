# Specs Specification

**Version 0.39.0 — Draft**

This document is the normative specification for the Specs document format. It defines what a Specs document is, what a producer must write, what a consumer may rely on, and what a validator must reject.

It is deliberately thin. Per-member reference material — every property, its type, and its examples — lives on the documentation site under `/schema`, and this document references it rather than restating it. Where the two disagree, this document governs for requirements and the JSON Schema governs for validation.

> **Draft status.** Sections 1 through 6 are written. Sections 7 and 8 are stubs: the rule catalogue has no identifiers assigned and no conformance suite exists. Every requirement below carries an enforcement note, and a requirement marked `unenforced` is a statement of intent that nothing currently checks. Those are the gaps to close, not claims to rely on.

---

## 1. Conventions

### 1.1 Requirement language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

A requirement applies to one of the conformance classes in §1.3. A requirement with no class named applies to documents.

### 1.2 Enforcement notation

Every normative requirement in this document carries a parenthetical note naming what enforces it:

| Note | Meaning |
|---|---|
| `schema: <file>` | A JSON Schema file rejects a document that violates it |
| `test: <file>` | A test in `packages/schema/tests/` fails |
| `rule: DSPEC-nn` | A semantic rule in the rule catalogue (§7) — **none assigned yet** |
| `consumer` | A consumer requirement; no artifact in this package checks it |
| `unenforced` | Nothing currently checks it |

A requirement that cannot be given an enforcement note does not belong in this document.

### 1.3 Conformance classes

**Document.** A YAML or JSON file claiming to be a Specs document.

**Producer.** Any tool that writes Specs documents. `specs generate` and the Figma plugin are producers.

**Consumer.** Any tool that reads Specs documents and acts on them. The platform transforms, the render path back to Figma, and the documentation generator are consumers.

**Validator.** Any tool that decides whether a document conforms. No reference validator is published; see §8.

### 1.4 Reference material

The per-member reference for every definition in this specification is published at `https://spectacular.systems/schema`. Architectural decisions are recorded as numbered ADRs at `https://spectacular.systems/adr`. An ADR records why a decision was made; it is not normative and a consumer MUST NOT treat one as a requirement source.

---

## 2. Documents

### 2.1 Document kinds

A Specs document is one of:

| Kind | Schema | Contents |
|---|---|---|
| Component | `component.schema.json#/definitions/Component` | A whole component — title, anatomy, props, default, variants |
| Component concern | `component-concern.schema.json` | One concern of a component: `api`, `variants`, or `examples` |
| Composition concern | `composition-concern.schema.json` | One concern of a composition |
| Conventions | `conventions.schema.json` | A library's naming and structural conventions |
| Settings | `settings.schema.json` | A workspace's run settings |

A component MAY be written as one whole-component document or split across concern documents. The two forms carry the same information (ADR-110).

### 2.2 Document identity

A document MUST validate against exactly one document kind (`schema: root.schema.json`).

A concern document MUST declare which concern it carries in `metadata.concern`. A whole-component document MUST NOT declare `metadata.concern` — that key is what distinguishes the two forms (`schema: component.schema.json`).

### 2.3 Required members

A component document MUST carry `title`, `anatomy`, and `default` (`schema: component.schema.json`).

A producer MUST write `metadata.source` on every document it generates. A document without it records no provenance and cannot be regenerated or diffed against its origin (`schema: metadata.schema.json`).

### 2.4 Closed property sets

Every definition in this specification declares `additionalProperties: false` unless it is an open map (§3.2). A document carrying an unrecognised key MUST be rejected (`schema: all files`).

This is deliberate and costly: it means every new member is a schema release. The alternative — silently ignoring unknown keys — makes a typo indistinguishable from a feature a consumer has not implemented.

---

## 3. Identifiers

### 3.1 Keys

Anatomy elements, props, variants, subcomponents, slot content entries and instance examples are addressed by key.

A key MUST NOT begin with `$`. The `$` prefix is reserved for the markers in §4 and §5 (`schema: component.schema.json`, via `propertyNames`).

The format of a key is governed by the workspace's `settings.spec.keys` and is not fixed by this specification. A producer MUST write all keys in one document under one setting (`unenforced`).

### 3.2 Open maps

The following are open, name-keyed maps rather than closed property sets: `anatomy`, `props`, `elements`, `variants`, `subcomponents`, `images`, `slotContentExamples`, `instanceExamples`, `compositions`.

A key in one of these maps MUST match `^[a-zA-Z0-9_-]+$` where the schema declares a pattern (`schema: component.schema.json`).

### 3.3 Safe key grammar

A producer that derives a key from an external name — a Figma layer name — MUST record the original name in `$extensions['com.figma'].name` whenever the key cannot reconstruct it (ADR-066, `schema: component.schema.json`).

The grammars under which a name round-trips are declared as `SafeKeySentence` and `SafeKeyTitle` (`schema: component.schema.json`). A consumer MUST NOT re-derive a name from a key when the original is recorded; the recorded name governs (`consumer`).

---

## 4. Pointers

### 4.1 Pointer forms

A pointer is a single-member object whose key is a reserved `$` marker:

| Marker | Definition | Points at |
|---|---|---|
| `$ref` | `SubcomponentRef`, `ElementTypeRef` | A subcomponent in the same document, or an external element type |
| `$binding` | `PropBinding` | A prop, for pass-through into a nested instance |
| `$slotContent` | `SlotContentRef` | A named slot-content entry |

### 4.2 Resolution

A `$slotContent` pointer MUST resolve to an entry in a `slotContentExamples` or `Composition.slotContent` map reachable from the document, or from the component set the document belongs to (`rule: DSPEC-nn`, **unassigned**).

A pointer that does not resolve MUST be rejected by a validator. The JSON Schema cannot check this — a pointer's payload is a string, and its target may be in another document — so this is a semantic rule, not a schema constraint (`unenforced`).

### 4.3 Nested paths

`propConfigurations.$nested` carries path-addressed configuration of descendant instances. A `path` is an ordered list of `instanceOf` element keys from the anchoring instance to the instance being configured (ADR-052).

A path MUST contain `instanceOf` keys only. A slot descent is not a path segment: a filled slot points at another slot-content entry, which recurses with its own `$nested` paths (`unenforced`).

---

## 5. Extensions

### 5.1 Namespacing

Platform-specific data lives under `$extensions`, keyed by reverse-DNS namespace. This specification defines one namespace: `com.figma`, which carries extraction provenance.

An `$extensions` map MUST NOT carry a namespace this specification does not define, because every `$extensions` object declares `additionalProperties: false` (`schema: component.schema.json`). A new namespace is a schema release.

### 5.2 Extensions are provenance, not contract

`$extensions['com.figma']` records how a document came to be, so a producer can render it back to its origin.

A consumer that emits platform code MUST NOT read `$extensions['com.figma']`. The spec contract is the whole input for emission; a spec that requires Figma decoding to emit correctly is a producer defect, not a consumer responsibility (`consumer`, `unenforced`).

---

## 6. Versions

### 6.1 Versioning

This specification and the `@directededges/specs-schema` package share a version. The current version is 0.39.0.

Pre-1.0, a minor release MAY make a breaking change. Every breaking change MUST be recorded under `### Breaking` in `CHANGELOG.md`, with a migration note under `### Migration` (`test:` **none — unenforced**).

### 6.2 Schema identity

Each schema file declares an `$id` of the form:

```
https://spectacular.systems/schema/<version>/<file>.schema.json
```

A released schema at a given `$id` MUST NOT change. A correction to a released schema is a new version at a new `$id`.

A producer SHOULD record the schema version a document was written against in `metadata` (`schema: metadata.schema.json`).

### 6.3 Draft

The schema files declare JSON Schema draft-07. Migration to 2020-12 would change the decomposition keyword from `definitions` to `$defs` and is not planned for 0.x.

### 6.4 Type and schema parity

The package publishes two artifacts that describe the same structure: TypeScript types in `types/` and JSON Schema in `schema/`. Every type MUST have a corresponding definition and every definition a corresponding type (`test:` **none — unenforced; see CONSTITUTION.md §I**).

The JSON Schema is authoritative for validating serialized documents. The TypeScript types are authoritative for compile-time consumption. Neither governs the other.

---

## 7. Rule catalogue

**Stub.** Semantic rules — the requirements a JSON Schema cannot express — are referenced above as `DSPEC-nn` with no identifiers assigned. The catalogue does not exist.

Rules identified so far and awaiting an identifier and a test:

| Rule | Stated in |
|---|---|
| A `$slotContent` pointer resolves to a reachable entry | §4.2 |
| A `$nested` path contains `instanceOf` keys only | §4.3 |
| At most one `SlotProp` per component carries `defaultSlot: true` | ADR-099 |
| A `contentStyles` key agrees with its slot's `anyOf` markers | ADR-102 |
| An owned element carries at most one `role`; only an `instance` may carry several | ADR-067 |
| All keys in a document use one `settings.spec.keys` format | §3.1 |
| Type and schema parity holds | §6.4 |

Each row is a requirement this specification states and nothing checks.

## 8. Validators

**Stub.** No reference validator is published, and no conformance suite exists.

What conformance requires, and does not yet have:

- A validator that checks a document against the schema for its kind, and against the rule catalogue in §7.
- A positive fixture set: documents that MUST validate.
- A negative fixture set: documents that MUST be rejected, each paired with the requirement it violates. A validator that rejects a negative fixture for the wrong reason does not conform.
- A test that validates every `examples` value in the schema files against its enclosing definition. 137 of 138 definitions currently carry no `examples`.

Until §7 and §8 exist, this document describes requirements rather than enforcing them, and a consumer cannot verify that a producer conformed.
