# ADR: Style defaults belong to the schema

**Status**: DRAFT

**Summary**: Every `Styles` property declares a `default`, making what an absent style key means a fact of the contract rather than of one transform.

## Context

A document omits a style key constantly. `specs generate` drops any style whose value equals its default, so a plain container emits no `layoutMode` at all. Reading a document therefore requires knowing what each absent key means.

The schema does not say. `styles.schema.json` contains **zero** `default` keywords — the string does not appear in the file. Nor do the types: `Styles.ts` states a default inline for exactly one member, `wrap`.

The only exhaustive table is `STYLE_DEFAULTS` in `specs-from-figma/src/Component/Styles/defaults.ts` — 46 entries, one per style key, referenced **nowhere** in this repository. The documentation site covers 44 of 46 informally in per-property `#### Default` sections; `effects` and `typography` have no page at all.

So the authoritative answer to "what does an absent `strokeAlign` mean?" lives inside a transform. Three consequences:

- A consumer that is not that transform cannot interpret a document correctly. A second platform binding — iOS, Android, or a third party's — has nothing to read.
- Two consumers may answer differently, and both can claim conformance, because nothing normative contradicts either.
- The platform mapping specifications now being published must cite an implementation as their source of truth, which inverts the relationship: a specification citing code is a description, not a contract.

Absence is also ambiguous in a second way this ADR does **not** resolve: a key may be absent because its value equalled the default, because a variant inherits it under layering, or because the element type cannot carry it. Nothing in a document marks which. Declaring defaults is a precondition for addressing that, not a substitute — see Consequences.

## Decision Drivers

- **The contract must be readable without reading an implementation.** A consumer compiles against the types and validates against the schema; anything it must know to interpret a document belongs in one of those two.
- **Type ↔ schema parity** (Constitution §I). A default stated in one artefact and not the other is drift by construction.
- **Mechanically verifiable** (Constitution §IV). A declared default that is invalid against the property it defaults is worse than none — it would be a published lie, and nothing currently could catch it.
- **No logic in this package** (Constitution §II). The schema may state what an absent key means; it may not decide when a producer omits one.
- **Additive.** `default` is an annotation in JSON Schema. Declaring it changes no document's validity.

## Options Considered

### Decision 1 — Which artefact declares a style default

| Option | For | Against |
|---|---|---|
| **A. The schema, as `default` keywords** | The artefact every consumer already validates against; standard keyword, read by generators and tooling with no convention to learn | 46 additions, and each must be kept true |
| B. The documentation site only | Already covers 44 of 46 | Prose is not machine-readable, is not versioned with the package, and a consumer cannot bind to it. Already demonstrably incomplete |
| C. A new exported constant in this package | One place, programmatically readable | Constitution §II forbids runtime exports beyond the two defaults constants; and a consumer validating JSON would still find the schema silent |
| D. Leave it in `specs-from-figma` | No work | The stated problem. A specification cannot cite an implementation as its authority |

**A.** The schema is where a consumer already looks, `default` is the keyword the format already defines for this, and it travels with the version.

### Decision 2 — How a `null` default is expressed

19 of the 46 defaults are "no value" — `backgroundColor`, `effects`, `typography`, `maxWidth`, the four insets, and others. JSON Schema's `default: null` is indistinguishable from an absent `default` if the test is a truthiness check.

| Option | For | Against |
|---|---|---|
| **A. Declare `"default": null` on all 19, and define the test as key presence** | All 46 keys answer the question; the absence of a `default` keyword then unambiguously means "nobody has decided" | Requires consumers to test `'default' in schema`, not `schema.default != null` |
| B. Omit `default` where it would be null, and define absence as "apply nothing" | Fewer keywords | Conflates "the default is no value" with "undeclared", which is exactly the ambiguity this ADR exists to remove |

**A.** The distinction between *declared as nothing* and *not declared* is the whole point. A later key that nobody has reasoned about must be visibly undeclared.

### Decision 3 — Where the keyword attaches

| Option | For | Against |
|---|---|---|
| **A. On each property of `Styles`** | Two properties sharing a value definition have different defaults — `opacity` is `1`, `rotation` is `0`, `width` is `0`, all `NumberStyleValue` | 46 sites |
| B. On the shared `*StyleValue` definitions | Fewer sites | Cannot express the above. Wrong by construction |

**A.** The default is a fact about the property, not about its value shape.

## Decision

Every property of `Styles` declares a `default`. The declared value is always a **literal** — never a `TokenReference`, `PropBinding`, or `Conditional`, even though the property's value union admits all three. A default is what a reader assumes in the absence of any authored value, so it cannot itself be a reference requiring resolution.

Defaults by type, over the 46 keys:

| Type of declared default | Count | Examples |
|---|---|---|
| `null` — apply nothing | 19 | `backgroundColor`, `effects`, `typography`, `maxWidth`, `top`, `bottom`, `start`, `end` |
| number | 11 | `opacity` → `1`, `rotation` → `0`, `width` → `0`, `cornerRadius` → `0`, `padding` → `0` |
| string | 11 | `position` → `AUTO`, `layoutMode` → `NONE`, `strokeAlign` → `INSIDE`, `textAlignHorizontal` → `START` |
| boolean | 5 | `visible` → `true`, `locked` → `false`, `wrap` → `false`, `clipsContent` → `false` |

### Schema changes (`schema/`)

Each property of `#/definitions/Styles` gains a `default`:

```yaml
# Before
opacity:
  $ref: "#/definitions/NumberStyleValue"
  description: "Opacity …"

# After
opacity:
  $ref: "#/definitions/NumberStyleValue"
  description: "Opacity …"
  default: 1
```

`default` sits as a sibling of `$ref`, which is how every property in this file already carries `description`. Draft-07 ignores siblings of `$ref` when *validating*, and that is harmless here: `default` is an annotation and affects no document's validity. Tooling reading the schema object — a doc generator, or the test below — sees it regardless.

No property becomes an `allOf` wrapper. Restructuring 46 properties to satisfy a strict reading of `$ref` would be a validation-shaped change in service of an annotation, and would diverge from how `description` is already carried.

### Type changes (`types/`)

No type changes. A TypeScript type cannot express "the value when this member is absent" — `?:` already means optional, and a default is not a type-level fact. Parity (Constitution §I) is satisfied because no named type is added or altered; the schema gains annotations only.

This is the documented exception the parity gate allows, and it is stated here rather than left for a reviewer to infer.

### Specification changes

`SPECIFICATION.md` §4 gains a statement that an absent style key resolves to its schema-declared default, and §11 states that a platform binding MUST NOT redeclare a default — a binding describes what a platform *does* with a value, and the value an absent key carries is not a platform's choice.

The rule catalogue gains:

| ID | Rule | Class |
|---|---|---|
| DSPEC-44 | Every property of `Styles` declares a `default`, and its value validates against that property's own schema | package |
| DSPEC-45 | A declared `default` is a literal, never a `TokenReference`, `PropBinding` or `Conditional` | package |
| DSPEC-46 | A platform binding does not redeclare a style default; it cites the schema's | binding |

### Tests

A test walks every property of `Styles`, asserts a `default` keyword is present, and validates the declared value against that property's own schema. This is the gate that makes Decision 1 safe: a default that does not satisfy its property would otherwise be a published falsehood with nothing to catch it.

## Type ↔ Schema Impact

Annotation only. No type is added, removed, or changed; no document's validity changes. The parity exception is stated under *Type changes* above.

## Downstream Impact

| Package | Impact |
|---|---|
| `specs-from-figma` | `STYLE_DEFAULTS` becomes redundant as an authority. It should be derived from, or asserted against, the schema rather than standing as its own source. Not changed by this ADR |
| `figma-from-specs` | No change. Already reads values from documents, not defaults |
| The CSS transform | No change. It currently imputes nothing for an absent key, relying on CSS's own initial values — which may or may not agree with the schema's declared default. Divergences become visible once the defaults are declared, and each is then a decision rather than an accident |
| Platform mapping specifications | `mappings/bindings/_defaults.json` currently records `declaredBy` as the `specs-from-figma` constant. Those citations move to the schema |
| Documentation site | The 44 per-property `#### Default` sections become generated from the schema rather than hand-maintained, and `effects` and `typography` stop being gaps |

## Semver Decision

Target version: **0.40.0**, the version the release branch carries. Change class: **MINOR** — additive annotations, no validation or type change.

## Consequences

The contract can be read without reading a transform, and a second platform binding has something normative to bind to.

Three things this does not do, stated so they are not assumed:

- It does not resolve the **three-way ambiguity of absence**. A key absent because it equalled a default, absent because a variant inherits it, and absent because the element type cannot carry it remain indistinguishable in a document. Declaring defaults answers the first case only. The remaining two need either an in-document marker or a published per-element-type key table, and that is its own decision.
- It does not make the CSS transform's behaviour agree with the declared defaults. It makes disagreement *visible*.
- It does not remove `STYLE_DEFAULTS`. Deleting or deriving it is work in another repository.

The cost is 46 annotations that must stay true, which the test in *Tests* converts from a maintenance burden into a build failure.
