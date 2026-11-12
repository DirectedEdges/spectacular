# ADR: Type–Schema Parity for Overlapping Prop Unions

**Branch**: `105-type-schema-parity`
**Created**: 2026-10-16
**Status**: ACCEPTED
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The first full-catalogue run of `specs validate` (project 039) surfaced two places where `schema/component.schema.json` rejects data its own TypeScript types declare legal. Both are parity breaks, not design disagreements — in each case the types are right and the JSON Schema compiled them incorrectly.

- `AnyProp` is a `oneOf` over the prop shapes, but the JSON Schema's `EnumProp` and `SlotProp` declare no `required` array even though the types make `type`/`default`/`enum` (EnumProp) and `type` (SlotProp) non-optional. With nothing required, a plain string prop such as `{type: string, nullable: true}` matches **both** `StringProp` and `EnumProp`, and `oneOf` — which demands exactly one match — fails it. Every plain string prop in a generated catalogue (~26 per library in the observed workspace, ~107 error lines) was schema-invalid.
- `PropConfigurationValue` is a `oneOf` whose branches include `PropBinding` and `ImageBinding`, but `types/Image.ts` declares `ImageBinding extends PropBinding` — a bare `{$binding: "#/props/x"}` is legally **both**. `oneOf` therefore rejects every prop-binding pass-through in `propConfigurations`, a shape the generator emits routinely (e.g. a subcomponent forwarding `name` into a nested icon instance).

The corrections are already implemented and test-verified on `feat/writing-specs`; this ADR records the decision and the principle so the next overlapping union does not repeat it.

One ADR, not two, deliberately: both defects are the same concept — the JSON Schema compilation of a prop union losing the types' discrimination semantics. Missing `required` arrays and a wrong union operator are the two ways that one parity can break; they live in the same file, were found by the same validation run, and resolve under the single principle stated in the Notes.

---

## Decision Drivers

- **Type–schema parity (constitution gate)**: the JSON Schema must accept exactly what the types declare — no drift in either direction.
- **No vocabulary change**: these are corrections; no field is added, removed, or renamed, and no consumer-facing shape changes.
- **Generated data is the regression bed**: a correct catalogue must validate; the eg workspace run is the evidence either way.
- **The fix must encode a principle, not an instance**: other unions in the schema could develop the same defect; the rule has to be statable.

---

## Options Considered

### Decision 1 — How string props and enum props discriminate

#### Option A: Add the types' `required` arrays to `EnumProp` and `SlotProp` *(Selected)*

`EnumProp` gains `required: [type, default, enum]`; `SlotProp` gains `required: [type]` — exactly what `types/Props.ts` already declares non-optional.

**Pros**:
- Restores parity mechanically from the types; nothing is designed, only transcribed.
- `enum` becomes the discriminator: present → `EnumProp` alone, absent → `StringProp` alone, so the existing `oneOf` becomes honest.

**Cons / Trade-offs**:
- Data that stated an `enum` without a `default` was previously (wrongly) tolerated by the lax branch and now fails — which is the types' declared contract.

#### Option B: Relax `AnyProp` from `oneOf` to `anyOf` *(Rejected)*

**Rejected because**: it hides the missing `required` arrays rather than fixing them — an enum prop with no `default` would validate against the types' contract, re-introducing drift in the other direction. The prop shapes do not overlap by extension; they were only ambiguous because requireds were missing.

### Decision 2 — How `PropConfigurationValue` treats overlapping branches

#### Option A: Change the union operator to `anyOf` *(Selected)*

**Pros**:
- Matches TypeScript semantics exactly: a TS union is satisfied by any member, and `ImageBinding extends PropBinding` makes overlap intentional.
- No shape changes anywhere; every currently-legal value stays legal and the wrongly-rejected values become accepted.

**Cons / Trade-offs**:
- Validators report less specific branch errors on genuinely invalid values (acceptable; the value shapes are scalars and two small objects).

#### Option B: Discriminate `ImageBinding` by requiring `examples` *(Rejected)*

**Rejected because**: `examples` is optional on `ImageBinding` by design (the binding is valid without authoring-default images), so requiring it changes the contract to rescue an operator choice. The types say the branches overlap; the schema should say the same.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| *(none)* | The types are already correct; this ADR changes only their JSON Schema compilation | — |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | `#/definitions/EnumProp` gains `required: ["type", "default", "enum"]` | PATCH |
| `component.schema.json` | `#/definitions/SlotProp` gains `required: ["type"]` | PATCH |
| `component.schema.json` | `#/definitions/PropConfigurationValue` changes `oneOf` → `anyOf` | PATCH |

**Example — discrimination after the fix** (`schema/component.schema.json`):
```yaml
# A plain string prop now matches StringProp alone (no enum present):
a11yLabel:
  type: string
  nullable: true

# An enum prop now matches EnumProp alone, and must carry its full contract:
appearance:
  type: string
  default: Filled
  enum: [Filled, Tonal, Outline]

# A prop-binding pass-through in propConfigurations is legal again:
propConfigurations:
  name:
    $binding: '#/props/icon'
```

### Notes

The statable principle, recorded for future schema authoring: **a TypeScript union whose members overlap by extension must compile to `anyOf`, never `oneOf`; a union whose members are disjoint must carry the `required` arrays that make them disjoint.** A parity test that derives each definition's `required` set from the types (or asserts the two against each other) would catch the next divergence in CI; that test is follow-up work, not part of this ADR.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — the schema moves *toward* the types; no type changes.
- **Parity check**: `EnumProp`/`SlotProp` required members now match `types/Props.ts`; `PropConfigurationValue`'s `anyOf` now matches the overlapping TS union in `types/PropConfigurations.ts` + `types/Image.ts`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | `specs validate` stops reporting false errors on plain string props and prop-binding pass-throughs | Recompile (resolves schema from the package) |
| `specs-from-figma` | None at runtime; generated output that omits `default` on an enum prop is now visibly non-conforming | Verify emitted enum props carry `default` |
| `specs-plugin-2` | None at runtime | Recompile |

---

## Semver Decision

**Target version**: `0.39.0` — the version of `release/next`, the branch this ADR merges into.

**Change class**: `PATCH` — corrections that make the schema accept what the types always declared; no vocabulary or contract change.

**Justification**: Type–schema parity restoration with no type changes is non-semantic for consumers of the declared contract; the types were always the statement of record.

---

## Consequences

- A generated or authored catalogue with legal plain string props validates; ~107 false errors disappear from the observed workspace.
- Prop-binding pass-throughs in `propConfigurations` validate, unblocking authored specs that forward props into nested instances.
- Enum props missing `default` now fail validation — a true positive the lax schema previously hid.
- The overlap principle (anyOf for extension-overlapping unions) is on record for every future union definition.
