# ADR: Object-Typed Props

**Branch**: `111-object-props`
**Created**: 2026-10-22
**Status**: ACCEPTED
**Summary**: An `ObjectProp` with named scalar `members` joins the prop union, folded from separator-named Figma properties via `objectProps`.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

### Figma props

Figma's component property model is flat. A property is a boolean, a text string, a number, an instance swap, or a variant option — one name, one value. There is no property whose value is a structured object, and the Specs schema mirrors that limit today: the `AnyProp` union in `types/Props.ts` admits six shapes (`BooleanProp`, `StringProp`, `EnumProp`, `NumberProp`, `SlotProp`, `ImageProp`), each carrying a single value.

### Object props

Technical solutions have long permitted unflattened props, and design intent has outgrown that flatness. One case is responsive behavior: a designer thinks of one concept — a component's margin, varied across size contexts — not two unrelated settings. A flat property model forces the concept apart. 

### Figma workarounds

A team could encode it as flattened props (`marginCompact`, `marginExpanded`), multiplied variants, or as per-breakpoint component forks, and nothing in the file records that these are members of one idea. The grouping survives as naming convention and design consumer — a developer, a documentation pipeline, a code generator, an agent — using an extension built by that convention. The same pressure shows up anywhere a single design decision has several coordinated parts: density modes, per-side spacing, device-class typography.

### Downstream pipeline and source(s)-of-truth

Code left this problem behind long ago:

- React props take an object literal
- SwiftUI views take a struct
- Compose components take a data class. 

When a designer hands off a "responsive margin," the engineer's API is already one `margin` with named members — it is the design tooling side of the handoff that arrives flattened, and extractions, specs, engineers and agents re-group it.

Specs serve as a source of truth for multi-platform development and should carry designed intent, not the authoring tool's encoding of it:

```yaml
# The concept as designed and as coded — not expressible in the schema today
margin:
  type: object
  members:
    compact:
      type: string
      enum: [none, small, large]
      default: none
    expanded:
      type: string
      enum: [none, small, large]
      default: none
```

## Figma convention

Because Figma cannot author this natively, the proposal pairs the schema shape with an authoring [Figma convention](https://spectacular.systems/settings/) teams can opt into using a setting like [infer number props](https://spectacular.systems/settings/infer-number-props/): dot-separated property names (`margin.compact`, `margin.expanded`) fold into one object prop. 

If Figma's property model later gains structured values natively, specs authored this way are already in the destination format, and the fold becomes translation that is no longer needed rather than a migration.

## Potential impacts to Spectacular Schema

An object prop's value must also travel everywhere a prop value travels today:

- `Props` in the API concern — the prop definition itself.
- `PropConfigurations` in the variance concern — a variant setting `margin` must carry a member-keyed value.
- Nested instance configurations (`NestedPropConfiguration`) reuse `PropConfigurationValue`, so one widening covers variant configurations, instance settings in the variance file, and slot fills.
- `InstanceExample.propConfigurations` carries its own narrower union (no `PropBinding`), so the examples file takes the same member-keyed value as a parallel widening of that union.

---

## Decision Drivers

- **Constitution I — type ↔ schema parity**: every type change pairs with a change in `component.schema.json` (and `conventions.schema.json` for convention fields).
- **Constitution III — minimal, stable API**: new shapes must represent a genuine shared concept, not a workaround for one authoring surface; changes should be additive (MINOR-class) where possible.
- **Constitution VI — code platforms first (rule 1)**: React and SwiftUI both model grouped prop values as objects/structs; the schema should present the code-platform shape, leaving Figma's flat encoding to the transformer boundary.
- **Authoring surface is Figma-constrained**: Figma component properties are flat strings; whatever grouping exists must be encoded in names and declared, not inferred.
- **Opt-in, not inferred**: a dot in a Figma property name is legal and common; folding must never trigger without an explicit convention.
- **One value vocabulary**: `PropConfigurationValue` is the single currency for variant configurations, nested instance settings, instance examples, and slot-fill configurations. Object values must flow through it, not around it.
- **Determinism**: the same flat Figma input must fold to the same object shape on every run.

---

## Options Considered

### Decision 1 — Should the schema have an object prop type?

#### Option A: Add `ObjectProp` to the `AnyProp` union *(Selected)*

A new prop shape, `type: 'object'`, with a `members` map whose entries are themselves prop definitions.

**Pros**:
- Presents the code-platform shape directly (driver: Constitution VI rule 1 — React object props, SwiftUI structs agree).
- The grouping is a contract fact, not a naming heuristic — consumers read declared structure (driver: minimal stable API; genuine shared concept).
- Additive to the union — MINOR-class.

**Cons / Trade-offs**:
- Every consumer that switches exhaustively over `AnyProp.type` must handle the new case before it can process specs that use it.
- Figma cannot represent it natively, so a fold/unfold convention becomes part of the contract's conventions surface.

#### Option B: Keep flat props; rely on naming (`marginCompact`, `marginExpanded`) *(Rejected)*

**Rejected because**: the grouping exists only as a heuristic in consumers' heads, violating the schema's role as the shared language — and "never infer from names" is an established principle of this contract. Each consumer reinvents (and disagrees on) the fold.

#### Option C: Flat props plus a grouping annotation (e.g. a `group` field or `$extensions` marker) *(Rejected)*

**Rejected because**: it splits one concept across two places — the props stay flat while a side annotation asserts structure — so parity between the annotation and the member props is unverifiable by the schema. It also leaks the Figma encoding into the API surface rather than translating at the transformer boundary (Constitution VI rationale).

---

### Decision 2 — What shape may members take?

#### Option A: One level deep; members are scalar prop definitions *(Selected)*

`members` is a map from member name to a **scalar** prop definition — `BooleanProp`, `StringProp`, `EnumProp`, or `NumberProp`. No `SlotProp`, `ImageProp`, or nested `ObjectProp` members.

**Pros**:
- Covers the motivating case (enumerated members per breakpoint) and every near-term variant of it with the smallest new surface (driver: minimal API).
- Reuses the existing prop definitions verbatim — member typing, `default`, `enum`, `nullable`, and `examples` semantics come for free, and the schema reuses the existing `#/definitions` entries.
- The non-recursive shape keeps the schema definition, the configuration value union, and validation flat — no self-referencing definitions.

**Cons / Trade-offs**:
- Deeper hierarchies (`margin.horizontal.compact`) are out of scope; a future ADR must lift the restriction if a genuine case appears. Deepening later is additive (MINOR); contracting depth would be breaking — which is the argument for starting shallow.

#### Option B: Recursive — members may themselves be `ObjectProp` *(Rejected)*

**Rejected because**: no motivating case requires it. Folding by separator is deterministic at any depth (`a.b.c` always folds to `a: { b: { c } }` — each segment is one level), so the cost is not ambiguity but surface: a recursive schema definition, a recursive configuration-value union in every surface that carries prop values, and arbitrary-depth traversal in every consumer, all for speculative benefit. Expanding later is additive; contracting is breaking.

#### Option C: Members as free-form JSON Schema fragments *(Rejected)*

**Rejected because**: it abandons the closed prop vocabulary — consumers could no longer rely on the `AnyProp` member shapes, and type ↔ schema parity for arbitrary fragments is unverifiable (Constitution I, V).

---

### Decision 3 — How does Figma author an object prop?

#### Option A: Opt-in fold convention declared in the Figma platform conventions *(Selected)*

A new optional field on the Figma platform conventions in `types/Conventions.ts` (alongside `inferNumberProps`, `slotConstraints`) declaring that separator-delimited property names fold into object props:

```yaml
platforms:
  figma:
    objectProps:
      separator: "."   # optional; defaults to "."
```

Absent means no folding — a property named `margin.compact` stays a flat prop, exactly as today.

**Pros**:
- Opt-in by declaration, matching how every other Figma encoding fact is handled (`codeOnlyProps`, `inferNumberProps`) — a wrong value produces incorrect output, so it belongs in `Conventions`, not `Settings`.
- Deterministic: same names + same declared separator → same fold.
- Zero impact on libraries that do not opt in — MINOR-class.

**Cons / Trade-offs**:
- Libraries must adopt a naming discipline in Figma; a stray separator in an unrelated property name folds unintentionally once opted in.

#### Option B: Always-on inference from dots in property names *(Rejected)*

**Rejected because**: dots occur legitimately in existing Figma property names; silent folding changes the output of every library that happens to use them — a non-opt-in behavioral change, and an inference from names rather than a declaration.

#### Option C: Author object props in the code-only props container *(Rejected)*

**Rejected because**: object members like responsive margins are variant-visible design properties, not non-visual code-only metadata; routing them through the code-only container misuses that convention and hides the members from Figma's own property UI.

---

### Decision 4 — How do object values convey through configurations and examples?

#### Option A: Widen `PropConfigurationValue` with a member-keyed object value *(Selected)*

`PropConfigurationValue` in `types/PropConfigurations.ts` gains one additional arm: a one-level object mapping member names to scalar values (or `null` for an unset member):

```yaml
# Variance file — a variant configuring the object prop
configuration:
  margin:
    compact: none
    expanded: large

# Nested instance configuration — same value vocabulary
$nested:
  - path: [header]
    margin:
      compact: small
```

Because `Variant.configuration`, `NestedPropConfiguration`, and `Element.propConfigurations` all share `PropConfigurationValue`, one widening carries object values into the variance file, nested instance settings, and slot fills; `InstanceExample.propConfigurations` keeps its own narrower union (no `PropBinding`) and takes the same `ObjectPropValue` arm as a parallel widening. Partial objects follow the existing layering rule: an absent member key inherits; a `null` member value unsets (ADR-080 semantics, per member).

**Pros**:
- One change point; every configuration surface stays consistent by construction (driver: one value vocabulary).
- The configured shape mirrors the declared shape — readers of a spec see the object, not an encoding.

**Cons / Trade-offs**:
- The object arm is structurally distinguishable from `PropBinding`/`SlotContentRef` only by the absence of their `$`-prefixed discriminator keys; member names therefore must not begin with `$` (schema-enforced via `propertyNames`).

#### Option B: Dotted keys inside configurations (`margin.compact: none`) *(Rejected)*

**Rejected because**: it reproduces the Figma authoring encoding inside the spec, so the API declares an object while every configuration addresses it flat — the translation every consumer was supposed to be spared (Constitution VI rationale), and a parity hazard between the declared members and the dotted keys.

#### Option C: Both forms accepted *(Rejected)*

**Rejected because**: two spellings of one value breaks deterministic output and forces every consumer to normalize.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add `ObjectProp` interface (`type: 'object'`, required `members`); add scalar-member union (named, e.g. `ObjectPropMember` = `BooleanProp \| StringProp \| EnumProp \| NumberProp`); add `ObjectProp` to `AnyProp` | MINOR |
| `PropConfigurations.ts` | Widen `PropConfigurationValue` with a member-keyed object arm (named `ObjectPropValue`: member name → `string \| number \| boolean \| null`) | MINOR |
| `InstanceExample.ts` | Widen `propConfigurations` values with the same `ObjectPropValue` arm (its union is narrower than `PropConfigurationValue` — no `PropBinding`) | MINOR |
| `Conventions.ts` | Add optional `objectProps` field (with optional `separator`, default `"."`) to the Figma platform conventions and its required-form counterpart | MINOR |
| `index.ts` | Export the new named types | MINOR |

**Example — new prop shape** (`types/Props.ts`):

```yaml
ObjectProp:
  type: 'object'
  members:            # required; at least one member
    <memberName>: BooleanProp | StringProp | EnumProp | NumberProp
  $extensions?: PropExtensions
```

Member names must not begin with `$` and must not contain the declared separator. `SlotProp`, `ImageProp`, and nested `ObjectProp` are not valid members.

The folded Figma property names are provenance: each member's `$extensions['com.figma'].name` records the flat source name (`margin.compact`) under the existing ADR-066 field, so unfolding is reversal, not re-derivation.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `ObjectProp` definition under `#/definitions` (members reference the existing scalar prop definitions; `propertyNames` excludes `$`-prefixed member names); add it to the `AnyProp` union; widen the prop-configuration value union with the member-keyed object form | MINOR |
| `conventions.schema.json` | Add optional `objectProps` object (optional `separator` string, default `"."`) to the Figma platform conventions | MINOR |

**Example — new definition** (`schema/component.schema.json`):

```yaml
# Under #/definitions
ObjectProp:
  type: object
  required: [type, members]
  properties:
    type: { const: object }
    members:
      type: object
      minProperties: 1
      propertyNames: { pattern: "^[^$]" }
      additionalProperties:
        anyOf:
          - $ref: "#/definitions/BooleanProp"
          - $ref: "#/definitions/StringProp"
          - $ref: "#/definitions/EnumProp"
          - $ref: "#/definitions/NumberProp"
```

### Notes

- Naming: `members` over `properties` — avoids collision with Figma's "component properties" vocabulary and with JSON Schema's own `properties` keyword; `object` follows the code-platform term (Constitution VI rule 1: React/TypeScript object types, SwiftUI structs).
- `ObjectProp` carries no top-level `default` or `nullable`: defaults live per member, and an object prop's value always exists as the composition of its members' states.
- The fold convention is Conventions, not Settings: whether a library names props this way is a fact about the library — a wrong declaration produces incorrect output (ADR-071 split).
- Member-level layering reuses existing semantics: absent member key inherits, `null` unsets (ADR-080), evaluated per member rather than per prop.
- Member names are opaque to the schema. Breakpoint vocabularies differ by platform (`compact`/`expanded` echoes iOS size classes and Android window size classes; web thinks in media queries) — the contract declares the members a library chose and attaches no semantics to them.
- A reference to one member crosses the document's `members` level as a true JSON Pointer — a `$binding` to a folded member reads `#/props/margin/members/compact`. Every reference the schema carries resolves against the document (`PropBinding`'s `#/props/label`, `$slotContent`'s component paths), and member references keep that property: any JSON Pointer resolver lands on the member definition, validators can check it, and no consumer gains a bespoke parse rule. A dotted spelling (`#/props/margin.compact`) was considered and rejected as the schema's first non-resolving reference (resolved 2026-10-26).
- Code-platform fit (Constitution VI rule 1): React object literals, SwiftUI structs, and Compose data classes all model one-level member maps directly. Web Components are the known friction — HTML attributes are strings, so an object value is either a JS-set property or unfolded to flat attributes by the emitter. That is an emitter representation decision outside this contract; the schema presents the object.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `ObjectProp` ↔ `component.schema.json#/definitions/ObjectProp`; the `AnyProp` union ↔ the schema's prop-value `anyOf`; the widened `PropConfigurationValue` ↔ the widened configuration-value union in `component.schema.json`; `Conventions` `objectProps` ↔ `conventions.schema.json` Figma platform properties.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-from-figma` | New fold behavior when `objectProps` is declared | Folds separator-named Figma properties into one `ObjectProp` with member-keyed configuration values; records each member's flat source name in `$extensions` |
| `figma-from-specs` | Object values must reach a flat surface | Unfolds members back to separator-named Figma properties via the recorded source names; member-keyed configurations set per-member values |
| `react-from-specs` | New prop shape in emitted contracts | Object props in generated interfaces, object-literal values in composed instances, per-member story controls |
| `webcomponents-from-specs` | New prop shape in emitted contracts | Binds object props as JS properties rather than string attributes; per-member story controls |
| `from-specs` (shared core) | New prop shape in shared contract typing and story planning | One shared fix typing and planning the object shape covers both emitters |
| `specs-cli` | Resolves and forwards the new convention — the feature's on-switch | `objectProps` in a workspace's conventions reaches the engine and the bridge; analyzers, visual testing, and version grading read members |
| `spectacular-plugin` | Same contract via the plugin runtime, plus a settings surface | Settings checkbox enabling the convention, revealing a separator textbox defaulting to `.`; each enum member gets its own Props output section |

Specs containing no `ObjectProp` are byte-identical before and after — the change is inert until a library opts in.

Per-package adoption analysis: `specs-local-workspace/adr/111/plan.md` (maintained outside this repo).

---

## Semver Decision

**Target version**: `0.39.0` — the version of `@directededges/specs-schema` on `release/next`.

**Change class**: `MINOR` — all changes are additive: a new member of the `AnyProp` union, a new arm of the `PropConfigurationValue` union, a new optional `Conventions` field, and new schema definitions. No existing type, field, or schema property is removed, renamed, or narrowed (Constitution: "MINOR for additive types or new optional fields").

---

## Consequences

- A spec can declare a prop whose value is an object of named, individually typed scalar members — responsive props like per-breakpoint margins become first-class.
- Libraries opting in via `platforms.figma.objectProps` author members as separator-named Figma properties; libraries that do not opt in see no change.
- Variant configurations, nested instance settings, slot-fill configurations, and instance examples all carry object values in one member-keyed form, by shared use of `PropConfigurationValue`.
- Consumers that switch exhaustively over `AnyProp.type` must handle `'object'` before processing specs from opted-in libraries.
- Member names beginning with `$`, or containing the declared separator, are invalid — the former schema-enforced, the latter a generator invariant.
- Nesting deeper than one level remains unsupported; lifting that restriction requires a future ADR.
