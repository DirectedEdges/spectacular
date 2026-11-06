# ADR: Resolve `AnyProp` `oneOf` schema violation between `TextProp` and `IconProp`

**Branch**: `015-anyprop-oneOf-discrimination`
**Created**: 2026-03-09
**Status**: ACCEPTED
**Summary**: A single `StringProp` merges `TextProp` and `IconProp`, restoring valid `oneOf` discrimination in `AnyProp`.
**Decides**: props.boolean, props.string, props.enum, props.number, props.slot, props.image, props.object
**Deciders**: Nathan Curtis (author), *(collaborators TBD)*
**Supersedes**: ADR 017 (`017-icon-or-glyph-element-name`) — prop rename portion only. ADR 017 renamed `IconProp` → `GlyphProp`; this ADR merges both `TextProp` and `IconProp` into `StringProp`, making the intermediate `GlyphProp` rename moot. The element type rename (`icon` → `glyph`) and other non-prop changes from ADR 017 remain in effect.

---

## Context

`AnyProp` in `schema/component.schema.json` uses `oneOf` to discriminate between five prop types:

```yaml
AnyProp:
  oneOf:
    - $ref: BooleanProp    # type: "boolean"
    - $ref: TextProp       # type: "string"
    - $ref: IconProp       # type: "string"  <-- identical shape to TextProp
    - $ref: EnumProp       # type: "string" + required enum[]
    - $ref: SlotProp       # type: "slot"
```

`TextProp` and `IconProp` have **identical schemas**: same `const` value for `type` (`"string"`), same optional fields (`default`, `nullable`, `examples`), same `required` array (`["type"]`), and same `additionalProperties: false`. The TypeScript interfaces in `types/Props.ts` are likewise identical except for their names and JSDoc comments.

Under JSON Schema `oneOf` semantics, a value must match **exactly one** branch. Any valid `TextProp` instance also validates against `IconProp` (and vice versa), producing two matches. This causes `oneOf` to **reject** the value — making every text or icon prop invalid according to the schema.

This is a violation of **Constitution IV** (Schema Validity Must Be Mechanically Verifiable).

---

## Decision Drivers

- **Schema validity (Constitution IV)**: The JSON schema must be valid and mechanically verifiable. A `oneOf` with two indistinguishable branches is structurally broken.
- **Type-schema symmetry (Constitution I)**: Changes to the schema must be reflected in the TypeScript types and vice versa.
- **Stable public API (Constitution III)**: `TextProp` and `IconProp` are individually exported from `types/index.ts`. Removing either is a breaking change to the type surface.
- **No logic in this package (Constitution II)**: The fix must remain purely declarative — types and schema only.
- **Minimal change**: Prefer the smallest structural change that restores schema validity.
- **Future divergence potential**: Text and icon props may evolve differently. Text examples are plain strings; icon examples may reference named assets, icon sets, or component references. A solution that forecloses future structural divergence incurs design debt.

---

## Options Considered

### Option A: Merge `TextProp` and `IconProp` into a single `StringProp` *(Selected)*

Collapse both types into one `StringProp` since they are structurally identical. The `oneOf` would have four branches instead of five, each structurally distinct.

**Type changes**:
```yaml
# Before (types/Props.ts)
AnyProp: BooleanProp | TextProp | IconProp | EnumProp | SlotProp

TextProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]

IconProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]

# After
AnyProp: BooleanProp | StringProp | EnumProp | SlotProp

StringProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]
```

**Schema changes**: Replace `TextProp` and `IconProp` definitions with a single `StringProp`; update `AnyProp.oneOf` to reference it.

**Pros**:
- Eliminates the `oneOf` violation cleanly — four branches, all structurally unique
- Reflects truth: the output shape genuinely has no text-vs-icon distinction *today*
- Simplest structural change to the schema
- **Does not foreclose future re-separation**: If text and icon props later need distinct shapes, `StringProp` can be split back into two types at that point. A future discriminator (see Option B variants below) can be introduced alongside the structural divergence in a single MAJOR bump, rather than paying for the discriminator now when the shapes are identical.

**Cons / Trade-offs**:
- **Breaking change**: Removes two exported types (`TextProp`, `IconProp`) from the public API and replaces them with `StringProp` — requires a MAJOR bump
- Erases the semantic intent that text props and icon props are conceptually different prop categories
- All downstream consumers must update import references

---

### Option B: Add a discriminator property *(Rejected — deferred as future work)*

Add a discriminating field to each prop type, making them structurally distinguishable. Three sub-variants were considered for where to house the discriminator:

**B1 — Top-level `kind` field**

A required `kind` field with a `const` value on each prop type. Standard JSON Schema discrimination pattern.

```yaml
TextProp:
  kind: "text"        # const — new required field
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]

IconProp:
  kind: "icon"        # const — new required field
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]
```

Simple and idiomatic, but introduces a field whose sole purpose is schema discrimination — it carries no domain meaning beyond "this is a text prop" vs "this is an icon prop."

**B2 — `x-platform` metadata**

Use the `x-platform` pattern already established by `BooleanProp` to carry Figma-origin type information:

```yaml
TextProp:
  type: "string"
  x-platform:
    FIGMA:
      type: "TEXT"    # maps back to Figma's ComponentPropertyType

IconProp:
  type: "string"
  x-platform:
    FIGMA:
      type: "INSTANCE_SWAP"
```

Leverages an existing schema pattern and carries real provenance data. The discriminator would reflect the actual Figma property type that produced this prop. However, `x-platform` is currently optional on `BooleanProp` — making it required here to achieve `oneOf` discrimination would be inconsistent, and leaving it optional doesn't fix the `oneOf` problem.

**B3 — `$extensions` metadata**

Use the DTCG `$extensions` pattern already established by `TokenReference` (which uses `$extensions["com.figma"]` for platform provenance):

```yaml
TextProp:
  type: "string"
  $extensions:
    "com.figma":
      type: "TEXT"

IconProp:
  type: "string"
  $extensions:
    "com.figma":
      type: "INSTANCE_SWAP"
```

Aligns with the DTCG convention used elsewhere in the schema. Carries real Figma provenance. Same optional-vs-required tension as B2.

**Pros** (all B variants):
- Preserves the semantic distinction between text and icon props
- Both existing type names survive — no breaking rename
- Supports future divergence: once a discriminator is in place, `TextProp` and `IconProp` can evolve independently without another breaking change to the discrimination mechanism
- B2/B3 carry real platform provenance data, not just a synthetic tag

**Cons / Trade-offs** (all B variants):
- Adds a new field to the output — all producers must emit it, all consumers must handle it
- Breaking change if the discriminator field is required (existing valid output lacks it); optional doesn't fix `oneOf`
- **Premature when shapes are identical**: Adding a discriminator to distinguish two types that have no structural difference solves a schema-mechanics problem but doesn't reflect a genuine domain distinction in the output *today*. The discriminator becomes meaningful only when the shapes actually diverge.
- B2/B3 carry additional complexity (nested objects) compared to B1's flat `kind` field

**Compatibility with Option A**: All B variants are additive and can be introduced later on top of a merged `StringProp` (or a re-split `TextProp`/`IconProp`) when the shapes actually diverge. Selecting A now does not preclude B later.

---

### Option C: Replace `oneOf` with `anyOf` on `AnyProp` *(Rejected)*

Switch `AnyProp` from `oneOf` (exactly one match) to `anyOf` (at least one match). Multiple matching branches would no longer cause a validation failure.

**Schema changes**:
```yaml
# Before
AnyProp:
  oneOf: [BooleanProp, TextProp, IconProp, EnumProp, SlotProp]

# After
AnyProp:
  anyOf: [BooleanProp, TextProp, IconProp, EnumProp, SlotProp]
```

**Type changes**: None — TypeScript union semantics already behave like `anyOf`.

**Pros**:
- Zero-cost fix: one keyword change, no type changes, no downstream impact
- Preserves both type names and all existing shapes
- TypeScript union (`|`) already has `anyOf` semantics, so this aligns the schema with the type system
- **Keeps the door open**: If the shapes diverge later (e.g., icon examples become asset references), the types are already separate and the schema can be tightened back to `oneOf` once the shapes are naturally distinct — no breaking change needed at that point

**Cons / Trade-offs**:
- Weakens validation: `anyOf` permits ambiguous matches by design, which may mask future schema errors if other branches become overlapping
- Does not solve the underlying issue (identical shapes) — defers it
- Validators can no longer assert that exactly one prop type matched, reducing diagnostic precision
- **Bets on future divergence that may never happen**: If the shapes remain identical indefinitely, the two definitions stay redundant and the schema carries dead weight with no validation benefit

---

### Option D: Add an icon-specific structural property to `IconProp` *(Rejected)*

Introduce a property unique to `IconProp` (e.g., `iconSet`, `iconLibrary`, or `iconName`) that makes it structurally distinct from `TextProp`.

**Type changes**:
```yaml
# After
IconProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]
  iconSet?: string     # new optional field — icon library or collection name
```

**Schema changes**: Add the new property to `IconProp` definition only.

**Pros**:
- Preserves both type names and the semantic distinction
- Makes the shapes genuinely different, so `oneOf` works correctly
- Additive change — MINOR bump if the field is optional
- **Naturally accommodates divergence**: An icon-specific property like `iconSet` would carry real domain meaning. If icon `examples` later evolve to reference named assets, `iconSet` provides the namespace context those references need.

**Cons / Trade-offs**:
- Invents a property that no producer currently emits and no consumer currently reads — the field would be empty or absent in all current output
- Must justify that the new property represents a genuine shared concept (Constitution III) rather than a schema workaround
- **Does not actually fix `oneOf` if optional**: An always-absent optional field technically still allows both branches to match simultaneously. Only `required` + `const` fields reliably discriminate under `oneOf`. Making `iconSet` required would be a breaking change (MAJOR), defeating the MINOR advantage.
- If the divergence direction turns out to be something other than icon sets (e.g., icon examples become structured objects), this field may end up as dead weight alongside the actual differentiating property

---

## Decision

**Selected: Option A** — Merge `TextProp` and `IconProp` into a single `StringProp`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Remove `TextProp` and `IconProp` interfaces; add `StringProp` interface with identical shape | MAJOR |
| `Props.ts` | Update `AnyProp` union: `BooleanProp \| StringProp \| EnumProp \| SlotProp` | MAJOR |
| `index.ts` | Remove `TextProp`, `IconProp` exports; add `StringProp` export | MAJOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
AnyProp: BooleanProp | TextProp | IconProp | EnumProp | SlotProp

TextProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]

IconProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]

# After
AnyProp: BooleanProp | StringProp | EnumProp | SlotProp

StringProp:
  type: "string"
  default?: string
  nullable?: boolean
  examples?: string[]
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Remove `TextProp` and `IconProp` definitions; add `StringProp` definition with identical shape | MAJOR |
| `component.schema.json` | Update `AnyProp.oneOf`: replace `TextProp` and `IconProp` refs with single `StringProp` ref | MAJOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Before — AnyProp.oneOf
- $ref: "#/definitions/BooleanProp"
- $ref: "#/definitions/TextProp"
- $ref: "#/definitions/IconProp"
- $ref: "#/definitions/EnumProp"
- $ref: "#/definitions/SlotProp"

# After — AnyProp.oneOf
- $ref: "#/definitions/BooleanProp"
- $ref: "#/definitions/StringProp"
- $ref: "#/definitions/EnumProp"
- $ref: "#/definitions/SlotProp"
```

### Notes

**Deferred decision — discriminator property for future re-separation**: If `StringProp` is later split back into distinct text and icon types (e.g., because icon `examples` items evolve to structured asset references while text `examples` remain plain strings), the re-separated types will need a discriminator to satisfy `oneOf`. Three candidate patterns were evaluated in Option B:

- **`kind`**: Flat top-level const field (`kind: "text"` / `kind: "icon"`). Simplest, but purely synthetic.
- **`x-platform`**: Nested platform-origin metadata following the `BooleanProp` pattern (`x-platform.FIGMA.type: "TEXT"` / `"INSTANCE_SWAP"`). Carries real provenance.
- **`$extensions`**: DTCG-aligned metadata following the `TokenReference` pattern (`$extensions["com.figma"].type: "TEXT"` / `"INSTANCE_SWAP"`). Consistent with existing DTCG conventions in this schema.

The choice between these patterns is deferred until the shapes actually diverge and a discriminator is needed. At that point, the discriminator and structural divergence can be introduced together in a single MAJOR bump.

---

## Type <> Schema Impact

- **Symmetric**: Yes — both `types/Props.ts` and `schema/component.schema.json` replace the same two definitions with one
- **Parity check**: `StringProp` interface ↔ `#/definitions/StringProp` schema definition; `AnyProp` union ↔ `AnyProp.oneOf`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile — `TextProp` and `IconProp` imports no longer exist | Replace `TextProp` / `IconProp` imports with `StringProp` |

---

## Semver Decision

**Version bump**: Part of `0.13.0` (pre-1.0 — breaking changes are permitted within minor releases)

**Justification**: Removes two exported types (`TextProp`, `IconProp`) from the public API and replaces them with `StringProp`. This is a breaking change per Constitution III, but acceptable within a pre-1.0 minor release where the public API is not yet stabilized.

---

## Consequences

- `AnyProp` schema validation will no longer reject valid prop instances — Constitution IV compliance is restored
- Runtime validators consuming `component.schema.json` will produce correct results for string-typed props
- The semantic distinction between "text prop" and "icon prop" is no longer encoded in the type system or schema — consumers that need this distinction must derive it from context (e.g., element type, prop name)
- `TextProp` and `IconProp` are removed from the public API — all downstream consumers must update imports to `StringProp`
- Future re-separation into distinct text/icon types remains possible; the discriminator pattern (Option B) is documented and deferred until structural divergence justifies it
