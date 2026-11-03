# ADR: Closed Style Value Sets

**Branch**: `115-closed-style-value-sets`
**Created**: 2026-11-01
**Status**: ACCEPTED
**Summary**: Five `Styles` keys that inherited an open string wrapper by accident become named closed value sets, each dropping three value forms nothing writes.
**Decides**: styles.layoutSizingHorizontal, styles.layoutSizingVertical, styles.primaryAxisSizingMode, styles.strokeAlign, styles.textAlignVertical
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Five `Styles` properties have a closed, known set of values and declare none of them. Each is typed `Style`, and each points at a generic string wrapper in the schema:

| Property | Values it accepts in practice | Typed as | Schema `$ref` |
|---|---|---|---|
| `strokeAlign` | `INSIDE`, `OUTSIDE`, `CENTER` | `Style` | `MixedStringStyleValue` |
| `layoutSizingHorizontal` | `FIXED`, `HUG`, `FILL` | `Style` | `StringStyleValue` |
| `layoutSizingVertical` | `FIXED`, `HUG`, `FILL` | `Style` | `StringStyleValue` |
| `textAlignVertical` | `TOP`, `CENTER`, `BOTTOM` | `Style` | `StringStyleValue` |
| `primaryAxisSizingMode` | `AUTO`, `FIXED` | `Style` | `StringStyleValue` |

Both wrappers are open, and `Style` is the widest value type the package has:

```yaml
# types/Styles.ts — current
Style: string | boolean | number | null | TokenReference | PropBinding | Conditional

# schema/styles.schema.json — current
StringStyleValue:
  oneOf: [ { type: string }, { $ref: TokenReference }, { type: null } ]
MixedStringStyleValue:
  oneOf: [ { type: string }, { $ref: TokenReference }, { type: null } ]
```

So each of the five admits any string whatsoever, plus a token reference — and in TypeScript, additionally a prop binding and a conditional.

Nothing decided that. The five inherited a convenience wrapper, and the constitution's typing rule says the opposite should hold: *"When a `Styles` property has a closed, known set of values and is **not token-bindable** … it MUST be typed as a named type rather than `Style`."* Eleven sibling properties already do — `Position`, `LayoutMode`, `MainAxisAlignment`, `CrossAxisAlignment`, `WrapAlignment`, `TextAlignHorizontal` and `TextOverflow` among them. These five are the remainder.

The cost falls on anyone implementing against the contract. **The admitted values for these five appear nowhere in this package** — not in `types/`, not in `schema/`. A reference page for `strokeAlign` can only say `string`, and a platform author has nothing to implement against.

The openness is also unused. Across every spec document available for inspection, 10,547 values are carried by these five properties, and every one is a plain string from the sets above or `null`. None is a token reference, prop binding or conditional.

---

## Decision Drivers

- **A platform must be able to read the admitted values from the contract.** This is the premise of the schema enrichment work; these five are the clearest remaining case where the contract withholds them.
- **The constitution already resolves the typing question.** A closed, non-token-bindable set is a named type (constitution, Additional Constraints). The five are an existing inconsistency rather than an open choice.
- **Type and schema must stay in sync.** Narrowing one without the other is drift, which constitution I forbids.
- **A contract that admits what nothing writes cannot reject what is wrong.** `strokeAlign: "INNER"` validates today.
- **Narrowing a published field type is breaking** and must be recorded as such (constitution III), whatever its practical reach.

---

## Options Considered

*(Pre-decided — no alternatives evaluated.)*

The author directed the narrowing and accepted the `MAJOR` change class when the openness was surfaced during the pattern and constraint work tracked in issue #819. This ADR records that decision; it does not re-open it.

---

## Decision

Declare each set, and drop the value forms nothing writes.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Add type `StrokeAlign` | MINOR |
| `Styles.ts` | Add type `LayoutSizing` | MINOR |
| `Styles.ts` | Add type `TextAlignVertical` | MINOR |
| `Styles.ts` | Add type `PrimaryAxisSizingMode` | MINOR |
| `Styles.ts` | Retype field `strokeAlign` from `Style` to `StrokeAlign \| null` | MAJOR |
| `Styles.ts` | Retype fields `layoutSizingHorizontal`, `layoutSizingVertical` from `Style` to `LayoutSizing \| null` | MAJOR |
| `Styles.ts` | Retype field `textAlignVertical` from `Style` to `TextAlignVertical \| null` | MAJOR |
| `Styles.ts` | Retype field `primaryAxisSizingMode` from `Style` to `PrimaryAxisSizingMode \| null` | MAJOR |
| `Styles.ts` | Retype field `TextContentStyles.textAlignVertical` from `Style` to `TextAlignVertical \| null` | MAJOR |
| `index.ts` | Export `StrokeAlign`, `LayoutSizing`, `TextAlignVertical`, `PrimaryAxisSizingMode` | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  strokeAlign: Style                 # string | boolean | number | null
                                     #   | TokenReference | PropBinding | Conditional
  layoutSizingHorizontal: Style
  primaryAxisSizingMode: Style

# After
StrokeAlign: "'INSIDE' | 'OUTSIDE' | 'CENTER'"
LayoutSizing: "'FIXED' | 'HUG' | 'FILL'"
PrimaryAxisSizingMode: "'AUTO' | 'FIXED'"

Styles:
  strokeAlign: StrokeAlign | null         # MAJOR — three value forms removed
  layoutSizingHorizontal: LayoutSizing | null
  primaryAxisSizingMode: PrimaryAxisSizingMode | null
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Add definition `StrokeAlignStyleValue` | MINOR |
| `styles.schema.json` | Add definition `LayoutSizingStyleValue` | MINOR |
| `styles.schema.json` | Add definition `TextAlignVerticalStyleValue` | MINOR |
| `styles.schema.json` | Add definition `PrimaryAxisSizingModeStyleValue` | MINOR |
| `styles.schema.json` | Repoint `Styles.strokeAlign` from `MixedStringStyleValue` to `StrokeAlignStyleValue` | MAJOR |
| `styles.schema.json` | Repoint `Styles.layoutSizingHorizontal`, `Styles.layoutSizingVertical` from `StringStyleValue` to `LayoutSizingStyleValue` | MAJOR |
| `styles.schema.json` | Repoint `Styles.textAlignVertical` and `TextContentStyles.textAlignVertical` from `StringStyleValue` to `TextAlignVerticalStyleValue` | MAJOR |
| `styles.schema.json` | Repoint `Styles.primaryAxisSizingMode` from `StringStyleValue` to `PrimaryAxisSizingModeStyleValue` | MAJOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# New definition under #/definitions
StrokeAlignStyleValue:
  description: "Stroke alignment value. Structural property — not token-bindable."
  oneOf:
    - const: INSIDE
      description: "The stroke is drawn within the element's bounds."
    - const: OUTSIDE
      description: "The stroke is drawn beyond the element's bounds."
    - const: CENTER
      description: "The stroke straddles the boundary."
    - type: "null"
      title: "No stroke"
      description: "The element has no visible stroke for an alignment to apply to."

# Styles.strokeAlign now references it
strokeAlign:
  $ref: "#/definitions/StrokeAlignStyleValue"
```

### Notes

Each set is declared as `oneOf` branches of `const` with a per-option description, per ADR-114, rather than a bare `enum`.

`layoutSizingHorizontal` and `layoutSizingVertical` share `LayoutSizingStyleValue`: the same set, named once.

`null` is retained on all five. It is in the current contract, it is the `null`-unset convention, and the inspected documents carry it 229 times across `strokeAlign` and the two sizing properties. Dropping it would be a second narrowing with nothing to justify it.

`TextContentStyles.textAlignVertical` moves with its `Styles` counterpart, because every content-styles member is typed identically to the `Styles` member it mirrors.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: each new string literal union has exactly one new schema definition, and each retyped field has exactly one repointed `$ref`.

| Type | Schema definition | Fields |
|---|---|---|
| `StrokeAlign` | `StrokeAlignStyleValue` | `Styles.strokeAlign` |
| `LayoutSizing` | `LayoutSizingStyleValue` | `Styles.layoutSizingHorizontal`, `Styles.layoutSizingVertical` |
| `TextAlignVertical` | `TextAlignVerticalStyleValue` | `Styles.textAlignVertical`, `TextContentStyles.textAlignVertical` |
| `PrimaryAxisSizingMode` | `PrimaryAxisSizingModeStyleValue` | `Styles.primaryAxisSizingMode` |

The four new definitions each carry a named type, satisfying constitution I in both directions.

---

## Downstream Impact

No consumer writes or reads a token reference, prop binding or conditional on any of the five properties, so none has usage to change. Each needs only to recompile against the narrowed types.

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-schema` | This ADR | Four types added, five fields narrowed |
| `specs-from-figma` | Recompile | Writes a plain string or `null` for each of the five; the narrowed types admit exactly that |
| `figma-from-specs` | Recompile | Reads the five as strings; the declared sets match the values it already handles |
| `from-specs` | Recompile | No usage of the removed value forms |
| `react-from-specs` | Recompile | No usage of the removed value forms |
| `webcomponents-from-specs` | Recompile | No usage of the removed value forms |
| `specs-cli` | Recompile | No usage of the removed value forms |
| `specs-plugin-2` | Recompile | Compiles the capture source, which writes a plain string or `null` |

A third party assigning a `TokenReference`, `PropBinding` or `Conditional` to one of the five would no longer compile. No such consumer exists in this workspace, and the CHANGELOG entry must say so rather than leaving a reader to judge whether their usage was real.

---

## Semver Decision

**Target version**: `0.40.0` — the version of the active release branch this ADR merges into.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: five exported fields narrow, each dropping three admitted value forms. Constitution III: *"Removing or renaming an exported type or a named field within a type is a breaking change and MUST follow semantic versioning."* The four added types and four added schema definitions are MINOR-class on their own; the field retyping governs.

---

## Consequences

- The admitted values for all five properties become readable from the types and the schema, instead of only from a transform's source.
- The constitution's structural-enum rule holds across every closed `Styles` value set, rather than eleven of sixteen.
- A wrong value is rejected: `strokeAlign: "INNER"` validates today and will not after this.
- Each reference page gains an option table in place of a bare `string`.
- Five published field types narrow. No consumer is affected, but the contract has changed and the CHANGELOG must record it under `### Breaking`.
- A future token-bound value on any of the five requires a schema change to re-admit. That capability was never intended, so closing it is deliberate — but it is no longer free.
