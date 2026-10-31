# Specs Specification

**Version 0.39.0 — Draft**

This document is the normative specification for the Specs document format: what a Specs document is, what a producer must write, what a consumer may rely on, and what a validator must reject.

It is the normative root of the schema documentation. The per-member reference — every property, its type, its examples — is published at [`spectacular.systems/schema`](https://spectacular.systems/schema) and this document references it rather than restating it. Where prose here and a reference page disagree, this document governs for requirements; the JSON Schema governs for validation.

The audience is engineers and automated agents equally. Section numbers and rule identifiers (`DSPEC-nn`) are stable citation targets: cite a requirement by its rule ID where it has one, and by section otherwise.

> **Draft status.** The requirements and the rule catalogue (§9) are written. No conformance suite or reference validator exists yet (§10). A requirement marked `unenforced` is a statement of intent that nothing currently checks — a gap to close, not a claim to rely on.

---

## 1. Conventions

### 1.1 Requirement words

MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT and MAY mean what RFC 2119 says, and only when written in capitals.

### 1.2 Enforcement notation

Every requirement ends with a parenthetical note naming what enforces it:

| Note | Meaning |
|---|---|
| `(schema: <file>)` | The named JSON Schema file rejects a violating document |
| `(test: <file>)` | A test in `packages/schema/tests/` fails |
| `(DSPEC-nn)` | A semantic rule in the catalogue (§9) — a requirement JSON Schema cannot express |
| `(producer)` | Binds producers; visible only in their output |
| `(consumer)` | Binds consumers; visible only in their behaviour |
| `(unenforced)` | Nothing currently checks it |

A rule ID in the note means a validator implementing §9 checks it; until a validator exists, every `DSPEC-nn` is also effectively unenforced. A requirement that cannot be given an enforcement note does not belong in this document.

### 1.3 Terminology

- A **document** is one YAML or JSON file claiming a Specs document kind (§2.1).
- A **component** is the documented thing: `title`, `anatomy`, `props`, `default`, `variants`, and its example registries.
- A **composition** is an assembly of component instances: `anatomy`, `elements`, `layout`, without props or variants of its own.
- An **element** is one member of `anatomy` (structural) or `elements` (presentational); the two are keyed by the same names.
- A **key** is the name under which an element, prop, variant, subcomponent, or registry entry is stored (§3).
- A **pointer** is a single-member object whose key is a reserved `$` marker and whose value addresses something else (§5).
- A **slot** is a prop of `type: slot`, filled with structural content rather than a scalar.
- A **concern document** is one of the split files (`api`, `variants`, `examples`) carrying one concern of a component or composition.

### 1.4 Conformance classes

| Class | Definition | Known members |
|---|---|---|
| **Document** | A file conforming to §2–§8 | Generated and authored specs |
| **Producer** | A tool that writes Specs documents | `specs generate`, the Figma plugin, hand authoring |
| **Consumer** | A tool that reads Specs documents and acts on them | Platform transforms, the Figma render path, the docs generator |
| **Validator** | A tool that decides conformance: schema plus §9 | None published — see §10 |

### 1.5 Scope and depth

Normativity is strongest at the top of a document and thins deliberately with depth:

- **Fully specified here**: document kinds and identity (§2), identifiers (§3), configuration values and layering (§4), pointers (§5), slots, roles and composition (§6), extensions (§7), versioning (§8). These are the structures every producer and consumer must agree on.
- **Schema-and-reference governed**: the leaf style vocabularies — `styles`, `effects`, `typography`, gradients, corners, sides. Their value grammars are enforced by `styles.schema.json` and documented per-member on the reference site; this document adds no prose requirements for them. A leaf vocabulary earns a section here only when it acquires a cross-member rule the schema cannot express.

### 1.6 Relationship to ADRs

Architectural decisions are recorded as numbered ADRs at [`spectacular.systems/adr`](https://spectacular.systems/adr). An ADR explains *why* a requirement exists; this document states the requirement. ADRs are not normative: a consumer MUST NOT treat an ADR as a requirement source — a rule an ADR describes binds only once stated here or in the schema (`consumer`). The `Source` column in §9 cites ADRs as provenance, not as authority.

---

## 2. Documents

### 2.1 Document kinds

A Specs document is exactly one of:

| Kind | Validates against | Carries |
|---|---|---|
| Component | `component.schema.json#/definitions/Component` | A whole component |
| Component concern | `component-concern.schema.json` | One concern of one component |
| Composition concern | `composition-concern.schema.json` | One concern of one composition |
| Components index | `components.schema.json` | A catalog of components |
| Conventions | `conventions.schema.json` | A library's naming and structural conventions |
| Settings | `settings.schema.json` | A workspace's run settings |

A component MAY be written whole or split into concern documents; the two forms carry the same information (ADR-091, ADR-110).

### 2.2 Document identity

A whole-component document MUST NOT carry `metadata.concern` (schema: `component.schema.json`).

A concern document MUST carry `metadata.concern`, valued `api`, `variants` or `examples`, and MUST carry exactly the members its concern declares and nothing else — a concern document "requires what it carries and permits nothing else" (schema: `component-concern.schema.json`, `composition-concern.schema.json`; ADR-091, ADR-109).

The members per concern:

| Concern | Component document | Composition document |
|---|---|---|
| `api` | `title`, `anatomy`, `props`, `invalidPropCombinations?`, `subcomponents?` | `title?`, `description?`, `anatomy` |
| `variants` | `default`, `variants?`, `subcomponents?` | `elements`, `layout` |
| `examples` | `slotContentExamples?`, `instanceExamples?`, `images?`, `subcomponents?` | `slotContent?`, `images?` |

`invalidPropCombinations` belongs to the `api` concern, because a constraint on legal usage is contract, not manifestation (ADR-092).

### 2.3 Required members

A component document MUST carry `title`, `anatomy` and `default` (schema: `component.schema.json`).

Every document MUST carry `metadata.source` — the Figma page, node and node type it was generated from (schema: `metadata.schema.json`). A document without provenance cannot be regenerated or diffed against its origin.

### 2.4 Run metadata

Facts about a run — `author`, `lastUpdated`, `generator`, `schema`, `conventions`, `settings` — describe the run, not any one component, and are optional on `Metadata` (ADR-089).

A document carrying only `metadata.source` MUST be independently valid, with no producer flag or out-of-band agreement needed to interpret it (schema: `metadata.schema.json`).

A producer that records run facts SHOULD record them once per run rather than identically on every document (`producer`, `unenforced`).

### 2.5 Closed property sets

Every definition declares `additionalProperties: false` unless it is an open map (§3.2). A document carrying an unrecognised key MUST be rejected (schema: all files).

This is deliberate and costly: every new member is a schema release. The alternative — ignoring unknown keys — makes a typo indistinguishable from a feature a consumer has not implemented.

### 2.6 Determinism

The same input under the same settings and conventions MUST produce an identical document (`producer`, `unenforced`). No field's value may depend on run ordering, clock, or environment except the declared run metadata (§2.4).

---

## 3. Identifiers

### 3.1 Keys and the reserved prefix

Elements, props, variants, subcomponents, images, slot-content entries, instance examples and compositions are addressed by key.

A key MUST NOT begin with `$` (schema: `component.schema.json`, via `propertyNames`). The `$` prefix is reserved for pointer markers (§5.1), primitive-content markers (§6.3), and the `$nested` key (§5.4). A document key can never shadow a marker: the safe key grammar (§3.3) admits no leading `$` either, so the two namespaces cannot collide (ADR-066, ADR-102).

### 3.2 Open maps

`anatomy`, `props`, `elements`, `variants`, `subcomponents`, `images`, `slotContentExamples`, `instanceExamples` and `compositions` are open, name-keyed maps.

Where the schema declares a key pattern it is `^[a-zA-Z0-9_-]+$` (schema: `component.schema.json`). The spelling of keys within that grammar is governed by the workspace's `settings.spec.keys`, not by this specification.

All keys in one document MUST be written under one `settings.spec.keys` value (DSPEC-17).

### 3.3 Safe key grammar and name preservation

A producer deriving keys from Figma names operates under the declared source convention `format.figmaKeys`: `NONE` (default), `SENTENCE`, or `TITLE` (ADR-066).

Under `SENTENCE` or `TITLE`, a name is **round-trip safe** when it satisfies the character rules — ASCII letters and digits, single spaces, each word all-letters or all-digits, never beginning with a digit — and the casing pattern for the declared convention. The grammars are declared as `SafeKeySentence` and `SafeKeyTitle` (schema: `component.schema.json`).

A producer MUST record the original name in `$extensions['com.figma'].name` whenever the key cannot reconstruct it (DSPEC-18). A well-formed catalog that follows the safe grammar emits no such extensions at all.

Under `NONE`, no grammar is evaluated and reversal is undefined: a consumer rendering back to the source MUST use `$extensions['com.figma'].name` where present and the formatted key otherwise (DSPEC-19).

A consumer MUST NOT re-derive a name from a key when the original is recorded; the recorded name governs (`consumer`).

### 3.4 Object prop member names

An `ObjectProp` member name MUST NOT begin with `$` (schema: `component.schema.json`) and MUST NOT contain the platform's declared `objectProps.separator` (DSPEC-13; ADR-111). The first rule is what keeps a member-keyed object value distinguishable from every pointer form; the second is what keeps folding reversible.

---

## 4. Values and layering

### 4.1 Scalars

A scalar is a string, number or boolean — the `Scalar` definition. It deliberately excludes `null`, whose meaning is defined per site (§4.2).

### 4.1a An absent style key resolves to its declared default

Every property of `Styles` declares a `default` in `styles.schema.json`. A style key absent from an element resolves to that default, and a consumer MUST use it rather than substituting a platform convention of its own (DSPEC-44; ADR-113).

The declaration is by **key presence**, not truthiness: 19 of the 46 properties declare `default: null`, meaning *apply nothing*. That is a decision, and it is distinct from a property carrying no `default` keyword at all, which would mean nobody has decided.

A declared default is always a literal — never a `TokenReference`, `PropBinding` or `Conditional`, even where the property's value union admits them (DSPEC-45). A default is what a reader assumes in the absence of any authored value, so it cannot itself require resolution.

**A default answers only one of three reasons a key can be absent.** A key may also be absent because a variant inherits it under layering (§4.4), or because its element type cannot carry it. Nothing in a document marks which applies, and the three are not distinguishable by a consumer reading one document. This specification does not yet resolve that; see `mappings/DEFAULTS.md`.

### 4.2 `null` means unset

In a prop configuration, `null` under a prop key means the prop is **unset** in that configuration. It is a value, not an absence: an absent key inherits from the layer beneath; a `null` key overrides an inherited value with "no value" (ADR-080; schema: `component.schema.json`).

`null` is meaningful only under a nullable prop (DSPEC-12).

A configuration key MUST name a prop declared in the component's `props` (DSPEC-11). Nothing outside the value may need to be consulted to interpret it — in particular, a consumer MUST NOT resolve a configuration by reading `$extensions` (`consumer`; ADR-080).

### 4.3 Configuration value forms

The value of one prop configuration entry (`PropConfigurationValue`) is one of: a scalar; `null`; a `PropBinding` (§5.1); a `SlotContentRef` under a slot-prop key (§5.1); an `ImageBinding` under an image-prop key; or a member-keyed `ObjectPropValue` under an object-prop key (schema: `component.schema.json`; ADR-049, ADR-063, ADR-080, ADR-111).

An `InstanceExample` configuration value is the deliberate subset without `PropBinding` and `ImageBinding`: an instance example is a documented configuration, not a live data flow (schema: `component.schema.json`; ADR-048).

### 4.4 Variant layering

`default` is the base variant; each entry in `variants` layers over it. A variant's `elements` override the default's per element and per style key; absent means inherited (schema: `component.schema.json`). The `null`-unset rule (§4.2) is what makes an explicit removal expressible under layering.

---

## 5. Pointers

### 5.1 Pointer forms

A pointer is a single-member object discriminated by its reserved key:

| Marker | Definition | Addresses | Shape |
|---|---|---|---|
| `$ref` | `SubcomponentRef` | A subcomponent in the same document | `#/subcomponents/<key>` |
| `$ref` | `ElementTypeRef` | An external element type | URI reference |
| `$binding` | `PropBinding` | A prop of the declaring component | `#/props/<key>` |
| `$slotContent` | `SlotContentRef` | A slot-content entry (§6.4) | JSON Pointer |
| `$image` | `ImageValue` | An entry in the `images` registry | registry key |
| `$token` | `TokenReference` | A design token | token path |

The branches of every pointer-bearing union are structurally unambiguous: each form is discriminated by its marker, and scalars by JSON primitive type (ADR-049).

### 5.2 Resolution

A `SubcomponentRef` MUST match `#/subcomponents/<key>` (schema: `component.schema.json`, via `pattern`) and that key MUST exist in the document's `subcomponents` (DSPEC-03).

A `PropBinding` MUST point at a prop key declared by the component whose document carries it (DSPEC-02).

A `$slotContent` pointer MUST resolve to something carrying `anatomy + elements + layout` — a `SlotContent` entry or a `Composition` — reachable at its JSON Pointer path (DSPEC-01; ADR-046). The pointer names the act of filling a slot, not the target's type.

An `$image` reference MUST resolve to an entry in the carrying document's `images` registry, including before the entry's bytes are resolved — an unresolved registry entry is valid; a dangling reference is not (DSPEC-14; ADR-063).

A validator MUST reject a document with an unresolvable pointer. JSON Schema cannot check this — a pointer's payload is a string and its target may be in another document — so these are catalogue rules, not schema constraints.

The exception is `ElementTypeRef`: its `$ref` targets an arbitrary external URI, and resolution is entirely a consumer concern. A validator is not expected to fetch or verify it (ADR-012).

### 5.3 The reference graph

Composed content forms a graph: each filled slot points at another `slotContentExamples` or `Composition.slotContent` entry, which recurses with its own fills. Structure is shared by reference, never duplicated inline (ADR-052; `producer`).

Following `$slotContent` references MUST NOT lead back to where it started (DSPEC-20).

### 5.4 Nested paths

`propConfigurations.$nested` carries path-addressed configuration of nested descendant instances. A `path` is an ordered list of `instanceOf` element keys, descending instance to instance; the final key is the configured instance, located by direct element-key lookup — never container or layout layers (DSPEC-04; ADR-052).

A path MUST NOT descend through a slot fill: a filled slot is a reference, handled by recursion into the target entry's own `$nested` paths. Every segment is therefore an `instanceOf` key, and each path spans only the hops to the next composed slot (DSPEC-05; ADR-052).

`InstanceExample.propConfigurations` does not accept `$nested`: deep configuration lives in `slotContentExamples` (schema: `component.schema.json`).

---

## 6. Slots, roles and composition

### 6.1 Slot acceptance — `anyOf`

A `SlotProp.anyOf` is the one list of a slot's accepted content: component names from the library's own namespace, and reserved primitive markers (§6.3). Absence means unconstrained — any component, no primitive (ADR-102).

A primitive marker joins an `anyOf` that already names at least one component; it never constitutes one. `anyOf: [$text]` says *only* text may fill the slot — narrower than an absent `anyOf` — so a producer MUST NOT emit a marker-only `anyOf` for a slot whose design stated no constraint (DSPEC-08; ADR-102).

### 6.2 Default slot

`SlotProp.defaultSlot: true` marks the component's designated default slot, resolved from the library's `specs.slots.default.match` convention at generation time. At most one `SlotProp` per component MAY be `true` (DSPEC-06; ADR-099).

When true, an authored example may nest a filling instance as a plain child element instead of an explicit `SlotContentRef` (ADR-099).

### 6.3 Primitive content and `contentStyles`

The reserved markers `$text` and `$glyph` name the primitive kinds a slot accepts. The names are `ElementType`'s: `type: text` on an anatomy item and `$text` in `anyOf` are the same concept (ADR-102).

Formatting for primitive fills lives under the matching key of the slot element's `contentStyles`. `contentStyles` is meaningful only on a slot element, and its keys SHOULD agree with that slot's `anyOf` markers (DSPEC-07; ADR-102).

A component fill is formatted by the component it instantiates: a consumer rendering one applies the instance's `styles` and MUST discard the slot's `contentStyles` rather than cascading it (`consumer`; ADR-102).

### 6.4 Content registries

`Component.slotContentExamples` and `Composition.slotContent` hold named `SlotContent` entries — the anonymous `anatomy + elements + layout` triplet. Entries are slot-agnostic: binding to a slot happens at the reference site, not the entry (ADR-047).

A producer MUST deduplicate registry entries by structural equality, storing each distinct fill once (DSPEC-15; ADR-047). The same rule applies to the `images` registry: each distinct image is stored once and referenced many times (DSPEC-16; ADR-063).

Registry entries and `SlotBinding.examples` are examples, not contracts: they carry no implementation obligation for code consumers (`consumer`; ADR-047).

### 6.5 Roles and actions

`role` names what an element *is*; `actions` name what activating it *does* (ADR-067, ADR-087). Both vocabularies are open strings published on the docs site; a consumer MUST ignore values it does not recognize — an unknown role or action is inert (`consumer`).

On an element the component owns, more than one `role` is an error; the array form is meaningful only on an element of `type: instance`, where each concept routes to whichever element of the composed component ascribes it (DSPEC-09; ADR-067).

`$extensions['com.figma'].childRole` records a role annotated on a layer that wrapper collapse folded into this element. It is deliberately not merged into `role`: the pair is what lets a renderer put each annotation back on the layer that carried it (ADR-104).

---

## 7. Extensions

### 7.1 Namespacing

Platform-specific data lives under `$extensions`, keyed by reverse-DNS namespace (ADR-026). This specification defines one namespace: `com.figma`, carrying extraction provenance.

Openness differs by site, and both readings are deliberate:

- **Prop extensions are open**: `PropExtensions` accepts unknown reverse-DNS keys, and unknown fields within a known platform's extension object. A consumer or validator MUST accept them rather than reject (DSPEC-31; ADR-026). A new platform's data MUST be added as a new reverse-DNS-keyed member, never as a top-level property on the prop type (DSPEC-30; ADR-026).
- **Element and anatomy extensions are closed**: their `$extensions` declarations reject undefined namespaces (schema: `component.schema.json`). A new namespace there is a schema release.

### 7.2 Extensions are provenance, not contract

`$extensions['com.figma']` records how a document came to be, so a producer can render it back to its origin: preserved names (§3.3), folded flat prop names (ADR-111), promotion residue (ADR-074, ADR-084), collapsed-layer roles (§6.5).

A consumer that emits platform code MUST NOT read `$extensions['com.figma']`: the spec contract is the whole input for emission, and a spec that requires Figma decoding to emit correctly is a producer defect (DSPEC-21; `consumer`).

---

## 8. Versions

### 8.1 Versioning

This specification and the `@directededges/specs-schema` package share a version; the current version is 0.39.0. Pre-1.0, a minor release MAY break. Every breaking change MUST be recorded under `### Breaking` in `CHANGELOG.md` with a migration note (`test:` none — `unenforced`).

### 8.2 Schema identity

Each schema file declares an `$id` of the form `https://spectacular.systems/schema/<version>/<file>` (schema: all files). The `$id` is an identifier, not a fetchable URL: the schema files are distributed in the `@directededges/specs-schema` npm package, and nothing is served at these URLs today. Resolve them locally from the package.

A released schema at a given `$id` MUST NOT change; a correction is a new version at a new `$id` (`unenforced`).

A producer records the schema version a document was written against in run metadata (`metadata.schema`; schema: `metadata.schema.json`).

### 8.3 Draft

The schema files declare JSON Schema draft-07; the decomposition keyword is `definitions`, not `$defs`. Migration to 2020-12 is not planned for 0.x.

### 8.4 Type and schema parity

The package publishes TypeScript types in `types/` and JSON Schema in `schema/` describing the same structure. Every type MUST have a corresponding schema definition and every definition a corresponding type (DSPEC-22; CONSTITUTION §I — `test:` none, `unenforced`).

The JSON Schema is authoritative for validating serialized documents; the TypeScript types are authoritative for compile-time consumption. Neither governs the other.

---

## 9. Rule catalogue

Semantic rules — requirements JSON Schema cannot express. Each rule binds the class named; a conforming validator checks every rule marked **validator**.

| ID | Rule | Class | Source |
|---|---|---|---|
| DSPEC-01 | A `$slotContent` pointer resolves to a reachable `anatomy + elements + layout` target | validator | §5.2, ADR-046 |
| DSPEC-02 | A `$binding` points at a prop key the declaring component's `props` carries | validator | §5.2, ADR-008/049 |
| DSPEC-03 | A `SubcomponentRef`'s key exists in the document's `subcomponents` | validator | §5.2, ADR-030 |
| DSPEC-04 | Every `$nested` path segment is an `instanceOf` element key, resolved by direct lookup | validator | §5.4, ADR-052 |
| DSPEC-05 | A `$nested` path never descends through a slot fill | validator | §5.4, ADR-052 |
| DSPEC-06 | At most one `SlotProp` per component carries `defaultSlot: true` | validator | §6.2, ADR-099 |
| DSPEC-07 | `contentStyles` appears only on slot elements, keyed consistently with the slot's markers | validator | §6.3, ADR-102 |
| DSPEC-08 | A primitive marker never appears in a marker-only `anyOf` | producer | §6.1, ADR-102 |
| DSPEC-09 | An owned element carries at most one role; the array form appears only on instances | validator | §6.5, ADR-067 |
| DSPEC-11 | A configuration key names a prop declared in `props` | validator | §4.2, ADR-080 |
| DSPEC-12 | `null` appears only under a nullable prop | validator | §4.2, ADR-080 |
| DSPEC-13 | An `ObjectProp` member name does not contain the declared `objectProps.separator` | producer | §3.4, ADR-111 |
| DSPEC-14 | Every `$image` reference resolves to an `images` registry entry | validator | §5.2, ADR-063 |
| DSPEC-15 | `slotContentExamples` entries are deduplicated by structural equality | producer | §6.4, ADR-047 |
| DSPEC-16 | `images` registry entries are deduplicated; one entry per distinct image | producer | §6.4, ADR-063 |
| DSPEC-17 | All keys in one document follow one `settings.spec.keys` format | producer | §3.2, ADR-066 |
| DSPEC-18 | `$extensions['com.figma'].name` is recorded whenever the key cannot reconstruct the name | producer | §3.3, ADR-066 |
| DSPEC-19 | Reversal under `NONE` uses the recorded name where present, the key otherwise | consumer | §3.3, ADR-066 |
| DSPEC-20 | Following `$slotContent` references never returns to the starting entry | validator | §5.3, ADR-052 |
| DSPEC-21 | A code emitter reads no `$extensions['com.figma']` member | consumer | §7.2 |
| DSPEC-22 | Every TypeScript type has a schema definition and every definition a type | package | §8.4, CONSTITUTION §I |
| DSPEC-23 | A `$token` path uses `.` as its segment separator; the source's own separator survives only in `$extensions['com.figma'].name` | producer | §5.1, ADR-006 |
| DSPEC-24 | `$type: "effects"` on a token reference is a non-DTCG extension; a consumer treats it as non-portable | consumer | §5.1, ADR-006 |
| DSPEC-25 | A token reference's origin is read from `$extensions['com.figma'].collectionName`: present means variable, absent means named style | consumer | §5.1, ADR-006 |
| DSPEC-26 | An omitted `settings.spec.tokens` behaves identically to `TOKEN`; omitted default-bearing settings generally behave as their scaffolded defaults, and only feature-toggle members mean "off" when absent | consumer | §2.1, ADR-007/035/112 |
| DSPEC-27 | `fillColor` appears only on glyph elements; `textColor` only on text elements | validator | §6.3, ADR-013 |
| DSPEC-28 | A `ConditionExpression.operation` is an open vocabulary; a consumer tolerates unrecognized operations | consumer | styles reference, ADR-018 |
| DSPEC-29 | `compareTo` is present for binary operations (`equals`, `notEquals`) and absent for unary ones (`isNull`, `isNotNull`) | validator | styles reference, ADR-018 |
| DSPEC-30 | A new platform's extension data is added as a reverse-DNS key on `PropExtensions`, never as a top-level prop member | producer | §7.1, ADR-026 |
| DSPEC-31 | Unknown platform keys on `PropExtensions`, and unknown fields within a known platform's prop extension, are accepted, not rejected | consumer | §7.1, ADR-026 |
| DSPEC-32 | A Figma TEXT code-only property is emitted as `type: "string"`; numeric-looking content alone never infers a number — only the `inferNumberProps` convention, whose test every `default` and example must pass, may emit `NumberProp` | producer | §2.6, ADR-027/029 |
| DSPEC-33 | The code-only prop hierarchy is constant across all variants of a component | validator | §4.4, ADR-027 |
| DSPEC-34 | Content filling a slot with `anyOf` present is an instance of a named entry (or a permitted primitive, §6.1) | validator | §6.1, ADR-028/102 |
| DSPEC-35 | The number of items filling a slot falls within its declared `minChildren`/`maxChildren` | validator | §6.1, ADR-028 (fields renamed by ADR-056) |
| DSPEC-36 | A subcomponent candidate matching both a `match` and an `exclude` pattern is excluded, regardless of discovery source | producer | conventions reference, ADR-031 |
| DSPEC-37 | An empty variant is one whose layered diff from `default` contains no elements; `settings.include.emptyVariants` filters by exactly that definition | producer | §4.4, ADR-034 |
| DSPEC-38 | `metadata.schema.url` resolves to the exact schema version named by `metadata.schema.version` | producer | §8.2, ADR-023 |
| DSPEC-39 | When `settings.spec.color` is not `OBJECT`, every color-bearing value in the document is a string in that notation | validator | §2.6, ADR-043 |
| DSPEC-40 | The length and order of a `ColorObject`'s `components` correspond to the channels of its `colorSpace` | validator | styles reference, ADR-009 |
| DSPEC-41 | A platform binding declares a disposition for every property of `Styles` | binding | §11.1 |
| DSPEC-42 | A platform binding declares its handling of each of the four style value forms | binding | §11.1 |
| DSPEC-43 | A degradation applies the spec's own recorded fallback or applies nothing and warns; it never invents data the document does not carry | binding | §11.2 |
| DSPEC-44 | Every property of `Styles` declares a `default`, and its value validates against that property's own schema | package | §4.1a, ADR-113 |
| DSPEC-45 | A declared `default` is a literal, never a `TokenReference`, `PropBinding` or `Conditional` | package | §4.1a, ADR-113 |
| DSPEC-46 | A platform binding does not redeclare a style default; it cites the schema's | binding | §11.1, ADR-113 |
| DSPEC-47 | Jointly resolved keys are stated as an ordered case table over a declared operand set, not as prose | binding | §11.1 |

Until a validator implements this catalogue, each **validator** row is a documented requirement nothing checks.

Rules DSPEC-23 through 40 were harvested from ADRs 001–045 in a systematic second pass; candidates citing fields that no longer exist (`internal`, `iconNamePattern`) or binding pipeline internals invisible in any document were excluded, and renamed fields are stated under their current names with the renaming ADR cited.

## 10. Validators and consumers

**Stub — no reference validator or conformance suite is published.** Conformance requires, and does not yet have:

- A validator that checks a document against the schema for its kind (§2.1) and the rule catalogue (§9), reporting each failure by rule ID.
- A positive fixture set: documents that MUST validate.
- A negative fixture set: documents that MUST be rejected, each paired with the rule it violates. A validator that rejects a negative fixture for the wrong reason does not conform.
- A test validating every `examples` value in the schema files against its enclosing definition (137 of 138 definitions currently carry no `examples` — issue 785 Step 2).

Consumer requirements stated above (DSPEC-19, DSPEC-21, §1.5, §4.2, §6.3, §6.4, §6.5) bind any tool reading Specs documents, whether or not a validator exists.

## 11. Platform bindings

§§2–8 say what a Specs document *is*. They do not say what any platform must do with one. A **platform binding** closes that gap: one document per platform, stating how that platform realises the schema.

Bindings live in `mappings/` beside this document — `mappings/FIGMA.md`, `mappings/REACT.md` — and are generated from the declarations in `mappings/bindings/<platform>.json`.

### 11.1 What a binding declares

A binding MUST declare, for every property of `Styles`, one of four dispositions (DSPEC-41):

| Disposition | Meaning |
|---|---|
| `bound` | Realised, and confirmed against an implementation |
| `approximated` | Realised with loss, and the loss is stated |
| `unsupported` | Declared as not realised, with the resulting behaviour stated |
| `unverified` | Coverage detected, mapping not confirmed by a human |

A reader MAY rely on `bound`, `approximated` and `unsupported`. An `unverified` row asserts nothing — it records outstanding work, and a binding that is wholly `unverified` is a stub, not a specification.

Where several keys resolve **jointly** — no one key determining any one output — a binding MUST state the mapping as an ordered case table over a declared, finite operand set, not as prose. A sentence describing a decision procedure cannot be checked, and reads as determinism without being it. Each case carries a predicate and the exact outputs it emits; an empty output list is a claim, a missing one is an omission (DSPEC-47).

The predicate grammar reuses this specification's `ConditionExpression` vocabulary — an `operation` with `args` — because `operation` is a deliberately open string (DSPEC-28). The operand space differs and the difference is declared, not glossed: a spec `Conditional` tests a `PropBinding` into `#/props/*`, while a binding case tests a style fact on `self`, `parent`, a named derived predicate, or the emitting context.

A binding MUST NOT redeclare a style default. What an absent key means is a property of the document, declared once in the schema (§4.1a), and a binding that restates it creates a second source free to disagree. A binding states what a platform does with a *value*; the value an absent key carries is not the platform's choice (DSPEC-46).

A binding MUST also declare what it does with each of the four value forms a style may take — a literal, a `TokenReference`, a `PropBinding`, a `Conditional` (DSPEC-42). A disposition for `padding` means nothing without saying whether a `Conditional` padding is realised, approximated, or dropped.

A binding SHOULD declare dispositions for props, anatomy and elements, and layout. Where it does not, it MUST name the concept as undeclared so the absence is visible rather than implied.

### 11.2 Degradation

An `approximated` or `unsupported` disposition MUST state the resulting behaviour. "Not supported" alone is not a binding: a consumer needs to know whether the value is dropped silently, warned about, or substituted.

A binding MUST NOT describe a degradation that invents data the document does not carry. Where a platform cannot realise a value, the permitted behaviours are to apply the spec's own recorded fallback, or to apply nothing and warn (DSPEC-43).

### 11.3 Direction

A binding MUST declare its direction. Figma is bidirectional — a document renders onto the canvas and is generated back from it — so its binding carries fidelity obligations both ways. The code platforms are emit-only, and a binding that does not say so implies a round trip that does not exist.

### 11.4 Bindings are not the implementation

A binding is a specification, not a description of one codebase. It is seeded from an implementation and continuously checked against it, but the declaration is authoritative: where they disagree, one of them is a defect, and the binding says which behaviour was intended.

This separation is what lets the binding be published from this repository while an implementation lives elsewhere, and what lets a second implementation of the same platform be judged conforming or not.
