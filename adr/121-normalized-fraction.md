# ADR: A normalized fraction style type for `opacity` and `cornerSmoothing`

**Branch**: `121-normalized-fraction`
**Created**: 2026-11-12
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Two `Styles` properties carry a number that is only meaningful between 0 and 1, and neither says so.

In `types/Styles.ts` both are typed as the fully generic union:

```yaml
# Current
opacity: Style            # string | boolean | number | null | TokenReference | PropBinding | Conditional
cornerSmoothing: Style    # same
```

In `schema/styles.schema.json` both `$ref` `NumberStyleValue`, which is narrower but unbounded:

```yaml
NumberStyleValue:
  oneOf:
    - type: number        # no minimum, no maximum
    - $ref: TokenReference
    - type: "null"
```

Two problems follow.

**The range is undeclared, so an out-of-range literal validates clean and fails later.** An authoring round wrote `opacity: 76`, intending 76 percent. `specs validate` reported zero errors; the write failed eleven seconds into a canvas render with `Property "opacity" failed validation: Too big: expected number to be <=1`. The validator already resolves and prints these numbers — its own output shows a token resolving to `56` — so it holds the value at the exact moment it could compare it against a declared bound. It has no bound to compare against.

**The type and the schema disagree about what is even permitted.** The TS type admits a string, a boolean, a `PropBinding` and a `Conditional`; the JSON Schema admits none of them. A consumer compiling against `types/` sees a wider contract than the one specs are validated against.

The range itself is already established vocabulary in this schema — gradient centre axes, gradient stop positions, and colour alpha all declare `minimum: 0, maximum: 1` with "normalised 0–1" descriptions. What is missing is a *style* type carrying that bound, usable by a token-bindable property.

One constraint shapes the solution. These properties are token-bindable, and in this library the opacity tokens resolve on a 0–100 scale: `{$token: Constants/Opacity/72}` is correct and renders correctly, while the literal `72` does not. So the bound belongs on the literal branch only. A bound applied across the whole union would reject the form that works.

---

## Decision Drivers

- **Constitution §Typing** — a property whose value may be token-bound MUST use `Style` *or a domain-specific type like `ColorStyle`*. A named narrow type is the sanctioned route; a bare structural enum is not available here.
- **Type ↔ schema symmetry** — no drift permitted. This change must close the existing asymmetry rather than add to it.
- **The declared contract is the only authority** — the bound must live in `schema/`, so validation enforces it by reading the contract and not from a range table maintained in validator code.
- **Token references must keep resolving on their own scale** — the bound cannot apply to the `TokenReference` branch.
- **Reuse over per-property special-casing** — one type, adopted by both properties and available to the next property that needs it.

---

## Options Considered

### Decision 1 — Where the range constraint lives

#### Option A: A domain-specific style type carrying the bound *(Selected)*

Define `NormalizedStyle` in `types/` and `NormalizedStyleValue` in `schema/`, mirroring the `ColorStyle` ↔ `ColorStyleValue` pair. The numeric branch declares `minimum: 0` and `maximum: 1`; the `TokenReference` and `null` branches are unconstrained.

**Pros**:
- Satisfies the constitution's typing rule by the route it names explicitly — a domain-specific type, as `ColorStyle` already is for the four colour properties.
- Puts the bound in the contract, so validation enforces it with no validator-side range logic.
- Closes the type ↔ schema asymmetry in the same change, because the new TS type matches the new schema definition exactly.
- Reusable: any future property whose literal is a 0–1 fraction adopts it rather than restating the bound.

**Cons / Trade-offs**:
- Narrowing the TS type is a breaking type-signature change for a consumer that assigned a string, a boolean, a `PropBinding`, or a `Conditional` to either property — even though the JSON Schema never permitted those.

---

#### Option B: Bound `NumberStyleValue` itself *(Rejected)*

Add `minimum`/`maximum` to the existing shared number definition.

**Rejected because**: `NumberStyleValue` is the type for every pure number in `Styles` — `strokeWeight`, `itemSpacing`, `width`, `cornerRadius`. Bounding it to 0–1 would reject every dimension in every spec. The definition is shared precisely because most numbers are unbounded.

---

#### Option C: Range-check in the validator *(Rejected)*

Leave both declarations alone and have `specs validate` check style literals against a per-property range table.

**Rejected because**: it puts the contract in validation code rather than in the schema, which is the authority consumers read. A second tool validating against `schema/*` would still accept `opacity: 76`, and the table is a copy of the contract that drifts from it.

---

### Decision 2 — Naming

#### Option A: `NormalizedStyle` / `NormalizedStyleValue` *(Selected)*

**Pros**:
- "Normalised 0–1" is the phrasing this schema already uses for gradient axes, stop positions and colour alpha, so the term carries its meaning without a gloss.
- Follows the established `<Domain>Style` ↔ `<Domain>StyleValue` pair naming.
- Names the value's shape rather than its two current consumers, so a third property adopting it does not make the name wrong.

**Cons / Trade-offs**:
- "Normalized" says the range but not the unit, so the description must state that a token resolves on the token's own scale.

---

#### Option B: `FractionStyle` / `OpacityStyle` *(Rejected)*

**Rejected because**: `OpacityStyle` is wrong for `cornerSmoothing` the moment it is adopted by both, and `FractionStyle` introduces a word this schema does not use anywhere, where "normalised" is already in service.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Added exported type `NormalizedStyle` | MINOR |
| `Styles.ts` | Narrowed field `opacity` from `Style` to `NormalizedStyle` | MAJOR |
| `Styles.ts` | Narrowed field `cornerSmoothing` from `Style` to `NormalizedStyle` | MAJOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
opacity: Style
cornerSmoothing: Style

# After
NormalizedStyle: number | TokenReference | null   # new exported type
opacity: NormalizedStyle
cornerSmoothing: NormalizedStyle
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added definition `NormalizedStyleValue` | MINOR |
| `styles.schema.json` | Repointed `opacity` from `NumberStyleValue` to `NormalizedStyleValue` | MAJOR |
| `styles.schema.json` | Repointed `cornerSmoothing` from `NumberStyleValue` to `NormalizedStyleValue` | MAJOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# New definition
NormalizedStyleValue:
  description: >-
    A number normalised to 0–1, a token reference, or null. The range applies to a
    literal only — a token reference resolves on the token's own scale, which in a
    given library may be 0–100.
  examples: [0.5, 0]
  oneOf:
    - type: number
      minimum: 0
      maximum: 1
    - $ref: "#/definitions/TokenReference"
    - type: "null"
```

### Notes

`NumberStyleValue` is left exactly as it is — it remains the type for every unbounded number in `Styles`, and nothing else is repointed by this ADR.

The `StyleKey` property-name union is untouched: this change alters what values those two keys accept, not which keys exist.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — and it removes an existing asymmetry rather than adding one.
- **Parity check**: `NormalizedStyle` in `types/Styles.ts` mirrors `NormalizedStyleValue` in `schema/styles.schema.json`, branch for branch — `number`, `TokenReference`, `null`. Before this ADR the type admitted `string`, `boolean`, `PropBinding` and `Conditional` that the schema rejected; after it, the two agree. The numeric bound is expressible in JSON Schema and not in TypeScript, which is the one intentional asymmetry: the type states the shape, the schema states the range.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile; validation output changes | An out-of-range literal now fails validation instead of reaching the canvas. Nine source files reference these properties |
| `specs-from-figma` | Recompile; confirm emitted values | Capture writes these properties from Figma, where both are already 0–1 — expected to be conformant, to be confirmed. Nine source files reference them |
| `figma-from-specs` | Recompile; confirm value handling | Renders these properties onto the canvas and is where the out-of-range failure surfaced. Seven source files reference them |
| `react-from-specs` | Recompile | Two source files reference them |
| `webcomponents-from-specs` | Recompile | Two source files reference them |
| `from-specs` | None | No reference to either property |
| `specs-plugin-2` | Recompile; confirm value handling | Twenty-six source files reference these properties; the plugin runtime is the other writer of canvas values |

Per-package depth is out of scope here and belongs to `/specs.adr.analyze`.

---

## Semver Decision

**Target version**: `0.40.0` — the version of `packages/schema` on the branch this ADR merges into.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: Constitution §Versioning sets `MAJOR` for any breaking change to a type signature or schema structure. Two things qualify. Narrowing `opacity` and `cornerSmoothing` from `Style` to `NormalizedStyle` removes assignability a TS consumer may have relied on. And a spec carrying `opacity: 76` validates today and will not after this change — a previously accepted document becomes invalid, which is breaking regardless of the document being wrong on its face. The new type and definition are themselves additive and MINOR-class; the repointing is what sets the class for the ADR.

---

## Consequences

- An out-of-range fraction fails at `specs validate` rather than eleven seconds into a canvas write, and fails for every tool validating against the published schema rather than only inside the CLI.
- The declared contract states the range, so no range table has to be maintained in validator code and none can drift from the schema.
- The two properties' TS types stop over-promising: a string, a boolean, a prop binding or a conditional no longer typecheck where the schema would have rejected them anyway.
- A future property whose literal is a 0–1 fraction adopts `NormalizedStyle` instead of restating the bound.
- Any spec in any workspace carrying an out-of-range literal on these two properties will start failing validation and must be corrected to either a 0–1 literal or a token reference. Those specs were already failing at render, so this surfaces an existing defect rather than creating one.
- `NumberStyleValue` remains unbounded and shared, so every dimension property is unaffected.
