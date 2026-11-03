# ADR: Tighten `textAlignHorizontal` to a Logical-Direction String Enum

**Branch**: `064-text-align-horizontal`
**Created**: 2026-08-03
**Status**: ACCEPTED
**Summary**: A `TextAlignHorizontal` enum types `textAlignHorizontal` as `START`, `CENTER`, `END` or `JUSTIFY`.
**Decides**: textAlignHorizontal, textAlignVertical
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The Figma Plugin API exposes horizontal text alignment on text nodes as a closed set of physical-direction values:

```yaml
# Figma Plugin API
textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
```

The `Styles` type currently models this property as the wide-open `Style` union:

```yaml
# types/Styles.ts — current
Styles:
  textAlignHorizontal?: Style   # string | boolean | number | null | TokenReference | PropBinding | Conditional
```

```yaml
# schema/styles.schema.json — current
textAlignHorizontal:
  $ref: "#/definitions/StringStyleValue"
```

This is wrong on two axes:

- **Overly wide typing**: The value is a closed, known set and is **not token-bindable** — Figma does not support variable binding on text alignment. Per the constitution's structural-enum rule, such properties MUST be typed as a named string-literal union rather than `Style`. Established precedent: `LayoutMode` (ADR-038), `MainAxisAlignment`/`CrossAxisAlignment` (ADR-040), `WrapAlignment` (ADR-039), `Position` (ADR-041), `TextOverflow` (ADR-062).
- **Physical direction names**: Figma's `LEFT`/`RIGHT` values embed an LTR writing-direction assumption. ADR-010 established logical inline-axis terminology (`start`/`end`) for the spec contract; passing Figma's physical values through unmapped contradicts that model and forces every RTL-aware consumer to translate.

---

## Decision Drivers

- **Structural-enum constitution rule**: Closed, non-token-bindable value sets MUST be named string-literal unions typed as `TypeName | null`, not `Style` (Additional Constraints — "Typing — structural enums vs. `Style`")
- **Logical direction model**: ADR-010 selected `start`/`end` over `left`/`right` for the inline axis; new properties must not reintroduce physical directions
- **Naming governance (Constitution VI, rule 1)**: Favor code-platform consensus — CSS Logical Properties (`text-align: start | end | justify`), Android Compose (`TextAlign.Start/End/Justify`), and Flutter (`TextAlign.start/end/justify`) all agree on logical values for horizontal text alignment
- **Enum casing**: `Styles` enum values use `SCREAMING_CASE` (Additional Constraints — "Naming — enum casing in Styles")
- **Type–schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **Stable, intentional API**: Narrowing an exported field's type and renaming its observable values is a breaking change (Constitution III)

---

## Options Considered

### Option A: Named structural enum with logical direction values *(Selected)*

Define `TextAlignHorizontal` as a string-literal union using logical inline-axis terminology, typed `TextAlignHorizontal | null`, excluding `TokenReference`/`PropBinding`/`Conditional`:

```yaml
TextAlignHorizontal: 'START' | 'CENTER' | 'END' | 'JUSTIFY'
```

**Pros**:
- Satisfies the structural-enum constitution rule — mechanical validation of the closed value set in both type and schema
- Logical `START`/`END` aligns with ADR-010's inline-axis model and the existing `MainAxisAlignment`/`CrossAxisAlignment` value vocabulary
- `JUSTIFY` follows code-platform consensus (CSS `justify`, Compose `TextAlign.Justify`, Flutter `TextAlign.justify`) per Constitution VI rule 1 — Figma's `JUSTIFIED` is the outlier
- SwiftUI consumers map trivially (`START` → `.leading`, `END` → `.trailing`)

**Cons / Trade-offs**:
- Breaking — previously valid arbitrary strings (including Figma-raw `LEFT`/`RIGHT`/`JUSTIFIED`) become invalid against the schema
- Extraction requires a value mapping (`LEFT` → `START`, `RIGHT` → `END`, `JUSTIFIED` → `JUSTIFY`) — a transformer concern, consistent with ADR-010's conclusion that physical→logical mapping belongs at extraction time

---

### Option B: Keep `Style`, document the value set in descriptions only *(Rejected)*

Leave `textAlignHorizontal: Style` and enumerate the permitted values in the JSDoc comment and schema `description`.

**Rejected because**: Violates the structural-enum constitution rule outright — the property is a closed, non-token-bindable set and MUST be a named union. Documentation-only constraints are not mechanically verifiable (Constitution IV), so invalid values pass validation silently.

---

### Option C: Named enum with Figma's physical values *(Rejected)*

Define the union as Figma's raw value set:

```yaml
TextAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
```

**Rejected because**: Reintroduces the physical-direction model ADR-010 explicitly rejected for the spec contract. `LEFT`/`RIGHT` embed an LTR assumption that every RTL-aware consumer must undo, and the vocabulary diverges from the logical `START`/`END` already used by `MainAxisAlignment`, `CrossAxisAlignment`, `WrapAlignment`, and the `Sides` composite. Constitution VI rule 3 permits deferring to Figma's vocabulary only when no code platform expresses a strong opinion — here CSS, Compose, and Flutter all agree on the logical model.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Add `TextAlignHorizontal` string-literal union type | MINOR |
| `Styles.ts` | Change `textAlignHorizontal` from `Style` to `TextAlignHorizontal \| null` | MAJOR |

**New type** (`types/Styles.ts`):

```yaml
# Horizontal text alignment using logical inline-axis directions.
# Structural property — not token-bindable.
TextAlignHorizontal: 'START' | 'CENTER' | 'END' | 'JUSTIFY'
```

**`Styles` change** (`types/Styles.ts`):

```yaml
# Before
Styles:
  textAlignHorizontal?: Style

# After
Styles:
  textAlignHorizontal?: TextAlignHorizontal | null
```

`StyleKey` is unchanged — the key `textAlignHorizontal` remains in the union.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Add `TextAlignHorizontalStyleValue` definition | MINOR |
| `styles.schema.json` | Change `textAlignHorizontal` property `$ref` from `StringStyleValue` to `TextAlignHorizontalStyleValue` | MAJOR |

**New schema definition** (`schema/styles.schema.json`):

```yaml
TextAlignHorizontalStyleValue:
  description: "Horizontal text alignment value using logical inline-axis directions. Structural property — not token-bindable."
  oneOf:
    - type: string
      enum: [START, CENTER, END, JUSTIFY]
    - type: "null"
```

**Property change** (`schema/styles.schema.json`):

```yaml
# Before
textAlignHorizontal:
  $ref: "#/definitions/StringStyleValue"

# After
textAlignHorizontal:
  $ref: "#/definitions/TextAlignHorizontalStyleValue"
```

### Notes

- **Value mapping** (extraction-time concern, recorded for reference): Figma `LEFT` → `START`, `CENTER` → `CENTER`, `RIGHT` → `END`, `JUSTIFIED` → `JUSTIFY`. In LTR contexts `START` renders as left-aligned and `END` as right-aligned; in RTL contexts the resolution flips without any change to the spec output.
- **`JUSTIFY` over `JUSTIFIED`**: Constitution VI rule 1 — CSS (`text-align: justify`), Android Compose (`TextAlign.Justify`), and Flutter (`TextAlign.justify`) agree on the term "justify"; Figma's past-tense `JUSTIFIED` is the single outlier and the transformer owns the rename.
- **No `'mixed'` arm**: `textAlignHorizontal` is a node-level property in Figma — it cannot vary across character ranges within one text node, so no `'mixed'` value is needed.
- **`textAlignVertical` is out of scope**: It remains `Style` for now. It is a candidate for the same structural-enum treatment in a follow-up ADR, but its block-axis values (`TOP`/`CENTER`/`BOTTOM`) do not flip with writing direction, so it carries no logical-direction urgency and no rename question.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `TextAlignHorizontal` union ↔ `#/definitions/TextAlignHorizontalStyleValue` enum values
  - `textAlignHorizontal?: TextAlignHorizontal | null` on `Styles` ↔ `#/properties/textAlignHorizontal` referencing `TextAlignHorizontalStyleValue`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Breaking — emitted values must change from Figma-raw `LEFT`/`RIGHT`/`JUSTIFIED` to `START`/`END`/`JUSTIFY` | Map Figma values to the logical enum at extraction; recompile against the narrowed type |
| `specs-cli` | Breaking — output validated against the schema must carry the new values | Recompile; any value formatting or docs generation that reads `textAlignHorizontal` handles the closed enum |
| `specs-plugin-2` | Breaking — same value mapping as `specs-from-figma` (shared engine) | Recompile against the narrowed type |

Existing serialized specs containing `LEFT`/`RIGHT`/`JUSTIFIED` (or any other string) for `textAlignHorizontal` become invalid against the new schema and must be regenerated.

---

## Semver Decision

**Version bump**: ships in the in-flight `0.29.0` release (`0.28.0 → 0.29.0`)

**Justification**: Narrowing `textAlignHorizontal` from `Style` to a closed enum and renaming its observable values is a breaking change per Constitution III (MAJOR-class). Per the package's pre-1.0 convention — established by the equivalent narrowings in ADR-038 (`layoutMode`, 0.18.0) and ADR-041 (`position`, 0.19.0) — breaking changes ride 0.x MINOR releases. The CHANGELOG entry for `0.29.0` must flag the breaking value rename.

---

## Consequences

- `textAlignHorizontal` is mechanically validated against a closed value set in both the type system and the JSON schema — arbitrary strings no longer pass
- Spec output uses writing-direction-neutral alignment values, consistent with `MainAxisAlignment`, `CrossAxisAlignment`, `WrapAlignment`, and the `Sides`/`Corners` logical model from ADR-010
- The transformer owns the Figma physical→logical value mapping; every downstream consumer reads one vocabulary
- Previously serialized output with Figma-raw alignment values becomes invalid against the new schema
- `textAlignVertical` remains the last text-alignment property typed as `Style` — a follow-up ADR can apply the same structural-enum treatment
