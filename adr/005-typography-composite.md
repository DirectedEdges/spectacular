# ADR: Replace Typography Flat Properties with `typography` — Add `Typography` Type

**Branch**: `005-typography-composite`
**Created**: 2026-02-26
**Status**: ACCEPTED
**Summary**: A composite `typography` property replaces fourteen flat text keys including `fontSize`, `lineHeight`, `letterSpacing` and `textStyleId`.
**Decides**: typography, typography.fontFamily, typography.fontSize, typography.fontStyle, typography.hangingList, typography.hangingPunctuation, typography.leadingTrim, typography.letterSpacing, typography.lineHeight, typography.listSpacing, typography.paragraphIndent, typography.paragraphSpacing, typography.textCase, typography.textDecoration
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`@directededges/anova` currently exposes typography-related style properties as individual flat keys within the `Styles` type: `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `paragraphIndent`, `paragraphSpacing`, `leadingTrim`, `listSpacing`, `hangingPunctuation`, and `hangingList`. These coexist with `textStyleId`, which references a named Figma text style.

Current `Styles` shape (typography subset):

```yaml
# types/Styles.ts
Styles:
  fontSize?: Style
  fontFamily?: Style
  fontStyle?: Style
  lineHeight?: Style
  letterSpacing?: Style
  textCase?: Style
  textDecoration?: Style
  paragraphIndent?: Style
  paragraphSpacing?: Style
  leadingTrim?: Style
  listSpacing?: Style
  hangingPunctuation?: Style
  hangingList?: Style
  textStyleId?: Style            # references a Figma text style
```

This flat structure creates three significant problems:

### 1. Interdependent resolution semantics

When a text node references a named text style (`textStyleId`), that style defines baseline values for all typography properties. Individual property overrides (e.g., `fontSize: 18`) are then layered on top. Figma resolves this via a shallow merge: inline values win, style-defined values fill gaps.

Variants compound this complexity. A component's default variant might specify `textStyleId: "heading"`, while a size variant might override only `fontSize: 24`. When both variants apply, consumers must:
1. Resolve the text style reference to get baseline typography values
2. Merge the default variant's textStyleId-derived values
3. Layer the size variant's inline fontSize override

No current consumer (`anova-transformer`, `anova-kit`) has a documented, tested resolution algorithm for this case. The interdependency between `textStyleId` and individual properties is implicit and fragile.

### 2. Mutual exclusion not enforced

The type system permits both `textStyleId` and inline typography properties to coexist on the same element in the same variant. There is no compile-time or schema-level constraint that enforces "either use a text style reference OR inline values, not both mixed arbitrarily." Downstream consumers cannot distinguish intentional overrides from malformed data.

### 3. Wide API surface for a single logical concept

Typography is a composite property grouping 13 individual keys. When only a text style reference is present, all 13 keys are absent from serialized output, replaced by a single `textStyleId`. This asymmetry makes it unclear whether:
- The node has no typography styling (keys absent, `textStyleId` absent)
- The node uses a text style (keys absent, `textStyleId` present)
- The node uses inline typography (keys present, `textStyleId` absent or coexisting)

The `effects` property (ADR 002) solved analogous problems by introducing `EffectsGroup`, which consolidates inline shadow/blur geometry under a single structured key and uses `FigmaStyle | EffectsGroup` to distinguish named-style-reference from inline-values. Typography should follow the same pattern.

---

## Decision Drivers

- **Type–schema sync**: Every type change must have a corresponding schema change in the same release. No drift between `types/` and `schema/` is permitted.
- **No runtime logic**: This package declares shapes only. No processing, evaluation, or conditional logic may be added.
- **Stable public API / MAJOR for breaking changes**: Removing 13 individual typography keys from `Styles`, `StyleKey`, and schema breaks any consumer reading those keys. A MAJOR version bump and migration note are required.
- **Platform-unbiased output**: The `typography` contract must not require consumers to understand Figma text-style resolution to extract values. Named style reference vs inline values must be unambiguous.
- **Minimal new surface**: New exports must serve a genuine consumer need. `Typography` is required so downstream consumers can type-check `typography` output values.
- **Follow established patterns**: ADR 002 established `EffectsGroup` for grouped inline values. Typography should use the same structure.

---

## Options Considered

### Option A: Typography composite object — `FigmaStyle | Typography` *(selected)*

Replace all individual typography keys with a single `typography` property that carries either a `FigmaStyle` reference (when a named text style is used) or a `Typography` object (when typography is defined inline).

```yaml
# Option A
Styles:
  typography?: FigmaStyle | Typography   # named style OR inline values

Typography:
  fontSize?: number | 'mixed' | VariableStyle          # mixableNumber primitive
  fontFamily?: string | number | 'mixed'               # font primitive
  fontStyle?: string | number | 'mixed'                # font primitive
  lineHeight?: string | number | VariableStyle         # lineHeight primitive — "150%", "auto", or px value
  letterSpacing?: number | 'mixed' | VariableStyle     # mixableNumber primitive
  textCase?: string | 'mixed' | VariableStyle          # mixableString primitive
  textDecoration?: string | 'mixed' | VariableStyle    # mixableString primitive
  paragraphIndent?: number | VariableStyle             # pureNumber primitive
  paragraphSpacing?: number | VariableStyle            # pureNumber primitive
  leadingTrim?: number | 'mixed' | VariableStyle       # mixableNumber primitive
  listSpacing?: number | VariableStyle                 # pureNumber primitive
  hangingPunctuation?: boolean | VariableStyle         # boolean primitive
  hangingList?: boolean | VariableStyle                # boolean primitive
```

#### Typography shape

| Spec property | Figma property | Figma type | Spec shape | Primitive | Default |
|---|---|---|---|---|---|
| `fontSize` | `fontSize` | `number` | `MixedNumberStyleValue` (number \| 'mixed' \| VariableStyle \| null) | mixableNumber | `16` |
| `fontFamily` | `fontName.family` | `string` | `FontStyleValue` (string \| number \| 'mixed' \| null) | font | `null` |
| `fontStyle` | `fontName.style` | `string` | `FontStyleValue` (string \| number \| 'mixed' \| null) | font | `null` |
| `lineHeight` | `lineHeight` | `{ value: number, unit: "PIXELS" \| "PERCENT" \| "AUTO" }` | `LineHeightStyleValue` (string \| number \| VariableStyle \| null) — "150%", "auto", or px | lineHeight | `"AUTO"` |
| `letterSpacing` | `letterSpacing` | `{ value: number, unit: "PIXELS" \| "PERCENT" }` | `MixedNumberStyleValue` (number \| 'mixed' \| VariableStyle \| null) | mixableNumber | `0` |
| `textCase` | `textCase` | `enum ("ORIGINAL" \| "UPPER" \| "LOWER" \| "TITLE" \| "SMALL_CAPS" \| "SMALL_CAPS_FORCED")` | `MixedStringStyleValue` (string \| VariableStyle \| null) | mixableString | `"ORIGINAL"` |
| `textDecoration` | `textDecoration` | `enum ("NONE" \| "UNDERLINE" \| "STRIKETHROUGH")` | `MixedStringStyleValue` (string \| VariableStyle \| null) | mixableString | `"NONE"` |
| `paragraphIndent` | `paragraphIndent` | `number` | `NumberStyleValue` (number \| VariableStyle \| null) | pureNumber | `0` |
| `paragraphSpacing` | `paragraphSpacing` | `number` | `NumberStyleValue` (number \| VariableStyle \| null) | pureNumber | `0` |
| `leadingTrim` | `leadingTrim` | `enum ("NONE" \| "CAP_HEIGHT")` | `MixedNumberStyleValue` (number \| 'mixed' \| VariableStyle \| null) | mixableNumber | `"NONE"` |
| `listSpacing` | `listSpacing` | `number` | `NumberStyleValue` (number \| VariableStyle \| null) | pureNumber | `0` |
| `hangingPunctuation` | `hangingPunctuation` | `boolean` | `BooleanStyleValue` (boolean \| VariableStyle \| null) | boolean | `false` |
| `hangingList` | `hangingList` | `boolean` | `BooleanStyleValue` (boolean \| VariableStyle \| null) | boolean | `false` |

**Pros:**
- Mutual exclusion enforced at the type level: either `FigmaStyle` (named style reference) or `Typography` (inline values), never both
- Single key to check (`styles.typography`) instead of 14 separate lookups
- Mirrors `effects: FigmaStyle | EffectsGroup` pattern from ADR 002 — consistent structure
- Downstream resolution becomes unambiguous: if `typography` is a `FigmaStyle`, resolve the style reference; if `Typography`, use inline values directly
- Variant layering is simplified: shallow merge of `Typography` objects rather than 13 independent keys
- Platform-unbiased: web, iOS, Android consumers read structured typography data without Figma-specific resolution logic

**Cons:**
- MAJOR breaking change: removes 14 keys (`textStyleId` + 13 individual properties) from `Styles` and `StyleKey`
- Downstream consumers must migrate from `styles.fontSize` to `styles.typography?.fontSize` (when inline)
- Larger schema diff than Option B or C

**Selected.** This shape eliminates interdependency, enforces mutual exclusion, and aligns with the `EffectsGroup` precedent.

---

### Option B: Retain interdependent properties — `textStyleId` + individual properties *(rejected)*

Keep the current flat structure. Document the resolution algorithm but make no structural changes.

```yaml
# Option B — no change
Styles:
  fontSize?: Style
  fontFamily?: Style
  fontStyle?: Style
  # ...all current keys remain...
  textStyleId?: Style
```

**Pros:**
- No breaking change — fully backward compatible
- No migration cost for downstream consumers

**Cons:**
- Does not solve the interdependency problem; resolution semantics remain implicit
- Mutual exclusion still unenforced — malformed data permitted by type system
- Wide API surface (14 keys) for a single logical concept
- Violates **platform-unbiased output** driver: consumers must implement Figma-specific shallow merge to read typography

**Rejected:** Preserves the problems described in Context rather than addressing them.

---

### Option C: Only inline properties — remove `textStyleId` *(rejected)*

Remove `textStyleId` but keep individual flat properties. All typography must be expressed as resolved inline values.

```yaml
# Option C
Styles:
  fontSize?: Style
  fontFamily?: Style
  fontStyle?: Style
  # ...all current individual keys...
  # textStyleId — REMOVED
```

**Pros:**
- Eliminates interdependency by removing the reference case entirely
- Simpler downstream consumption: all values are direct, no style lookup required

**Cons:**
- MAJOR breaking change (removes `textStyleId`)
- Loses semantic information: when a designer uses a named text style, that intent is erased in the output
- Downstream tooling (e.g., `anova-kit`'s audit commands) cannot detect text style references for governance checks
- Still exposes 13 individual keys for a single logical concept — does not address wide API surface
- Named text styles are a first-class Figma primitive; removing support diverges from Figma's model unnecessarily

**Rejected:** Solves interdependency at the cost of semantic fidelity and governance visibility.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Styles.ts` | Remove `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `paragraphIndent`, `paragraphSpacing`, `leadingTrim`, `listSpacing`, `hangingPunctuation`, `hangingList`, `textStyleId` (14 keys) | MAJOR (removal) |
| `types/Styles.ts` | Add `typography?: FigmaStyle \| Typography` to `Styles` | MAJOR (see above) |
| `types/Styles.ts` | Remove `'fontSize'`, `'fontFamily'`, `'fontStyle'`, `'lineHeight'`, `'letterSpacing'`, `'textCase'`, `'textDecoration'`, `'paragraphIndent'`, `'paragraphSpacing'`, `'leadingTrim'`, `'listSpacing'`, `'hangingPunctuation'`, `'hangingList'`, `'textStyleId'` from `StyleKey` union; add `'typography'` | MAJOR (removal) |
| `types/Styles.ts` | Add `Typography` interface (new export) | MINOR (additive) |
| `types/index.ts` | Export `Typography` from `'./Styles.js'` | MINOR (additive) |

**`Typography` interface** (`types/Styles.ts`):

```yaml
# New interface — inline typography properties grouped
Typography:
  fontSize?: number | 'mixed' | VariableStyle              # font size in pixels (mixableNumber primitive)
  fontFamily?: string | number | 'mixed'                   # font family name; 'mixed' when text has multiple families (font primitive)
  fontStyle?: string | number | 'mixed'                    # style name or numeric (e.g., 400, "Bold"); 'mixed' allowed (font primitive)
  lineHeight?: string | number | VariableStyle             # "150%", "auto", or pixel value (lineHeight primitive)
  letterSpacing?: number | 'mixed' | VariableStyle         # letter spacing in pixels; 'mixed' allowed (mixableNumber primitive)
  textCase?: string | 'mixed' | VariableStyle              # "UPPER", "LOWER", "TITLE", "ORIGINAL", or 'mixed' (mixableString primitive)
  textDecoration?: string | 'mixed' | VariableStyle        # "UNDERLINE", "STRIKETHROUGH", "NONE", or 'mixed' (mixableString primitive)
  paragraphIndent?: number | VariableStyle                 # paragraph indent in pixels (pureNumber primitive)
  paragraphSpacing?: number | VariableStyle                # spacing between paragraphs in pixels (pureNumber primitive)
  leadingTrim?: number | 'mixed' | VariableStyle           # leading trim value (mixableNumber primitive)
  listSpacing?: number | VariableStyle                     # spacing for list items in pixels (pureNumber primitive)
  hangingPunctuation?: boolean | VariableStyle             # whether hanging punctuation is enabled (boolean primitive)
  hangingList?: boolean | VariableStyle                    # whether hanging list is enabled (boolean primitive)
```

**`Styles` field change** (`types/Styles.ts`):

```yaml
# Before
Styles:
  fontSize?: Style
  fontFamily?: Style
  fontStyle?: Style
  lineHeight?: Style
  letterSpacing?: Style
  textCase?: Style
  textDecoration?: Style
  paragraphIndent?: Style
  paragraphSpacing?: Style
  leadingTrim?: Style
  listSpacing?: Style
  hangingPunctuation?: Style
  hangingList?: Style
  textStyleId?: Style

# After
Styles:
  typography?: FigmaStyle | Typography     # FigmaStyle when named style; Typography when inline
  # All 14 typography keys — REMOVED
```

**`StyleKey` change** (`types/Styles.ts`):

```yaml
# Before
StyleKey:
  | '...'
  | 'fontSize'
  | 'fontFamily'
  | 'fontStyle'
  | 'lineHeight'
  | 'letterSpacing'
  | 'textCase'
  | 'textDecoration'
  | 'paragraphIndent'
  | 'paragraphSpacing'
  | 'leadingTrim'
  | 'listSpacing'
  | 'hangingPunctuation'
  | 'hangingList'
  | 'textStyleId'
  | '...'

# After
StyleKey:
  | '...'
  | 'typography'
  | '...'
  # All 14 typography keys — REMOVED
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/styles.schema.json` | Remove `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `paragraphIndent`, `paragraphSpacing`, `leadingTrim`, `listSpacing`, `hangingPunctuation`, `hangingList`, `textStyleId` from `#/definitions/Styles/properties` | MAJOR (removal) |
| `schema/styles.schema.json` | Add `typography` property to `#/definitions/Styles/properties` | MAJOR (see above) |
| `schema/styles.schema.json` | Add `Typography` definition to `#/definitions` | MINOR (additive) |
| `schema/styles.schema.json` | Add `TypographyStyleValue` definition to `#/definitions` | MINOR (additive) |

**`Typography` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions — inline typography properties
Typography:
  type: object
  description: >
    Inline typography properties grouped into a composite object.
    All fields are optional; only properties set on the text node are present.
  properties:
    fontSize:
      oneOf:
        - { type: number }
        - { type: string, const: 'mixed' }
        - { $ref: '#/definitions/VariableStyle' }
      description: Font size in pixels; 'mixed' allowed (mixableNumber primitive)
    fontFamily:
      oneOf:
        - { type: string }
        - { type: number }
        - { type: string, const: 'mixed' }
      description: Font family name; number for weight, 'mixed' when varied (font primitive)
    fontStyle:
      oneOf:
        - { type: string }
        - { type: number }
        - { type: string, const: 'mixed' }
      description: Style name (e.g., "Bold") or numeric (e.g., 400); 'mixed' allowed
    lineHeight:
      oneOf:
        - { type: string, description: "Percentage (e.g., '150%') or 'auto'" }
        - { type: number, description: "Pixel value" }
        - { $ref: '#/definitions/VariableStyle' }
      description: Line height
    letterSpacing:
      oneOf:
        - { type: number }
        - { type: string, const: 'mixed' }
        - { $ref: '#/definitions/VariableStyle' }
      description: Letter spacing in pixels; 'mixed' allowed
    textCase:
      oneOf:
        - { type: string }
        - { $ref: '#/definitions/VariableStyle' }
      description: Text case ("UPPER", "LOWER", "TITLE", "ORIGINAL", or 'mixed')
    textDecoration:
      oneOf:
        - { type: string }
        - { $ref: '#/definitions/VariableStyle' }
      description: Text decoration ("UNDERLINE", "STRIKETHROUGH", "NONE", or 'mixed')
    paragraphIndent:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Paragraph indent in pixels
    paragraphSpacing:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Spacing between paragraphs in pixels
    leadingTrim:
      oneOf:
        - { type: number }
        - { type: string, const: 'mixed' }
        - { $ref: '#/definitions/VariableStyle' }
      description: Leading trim value
    listSpacing:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Spacing for list items in pixels
    hangingPunctuation:
      oneOf: [{ type: boolean }, { $ref: '#/definitions/VariableStyle' }]
      description: Whether hanging punctuation is enabled
    hangingList:
      oneOf: [{ type: boolean }, { $ref: '#/definitions/VariableStyle' }]
      description: Whether hanging list is enabled
  additionalProperties: false
```

**`TypographyStyleValue` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions — discriminated union for typography value
TypographyStyleValue:
  description: >
    Typography value. FigmaStyle when the text node references a named text style;
    Typography when typography is defined inline.
  oneOf:
    - { $ref: '#/definitions/FigmaStyle', description: "Named text style reference" }
    - { $ref: '#/definitions/Typography', description: "Inline typography properties" }
    - { type: 'null' }
```

**`Styles` schema change** (`schema/styles.schema.json`):

```yaml
# Before — #/definitions/Styles/properties
properties:
  fontSize: { $ref: '#/definitions/MixedNumberStyleValue', description: 'Font size in pixels' }
  fontFamily: { $ref: '#/definitions/FontStyleValue', description: 'Font family' }
  fontStyle: { $ref: '#/definitions/FontStyleValue', description: 'Font style' }
  lineHeight: { $ref: '#/definitions/LineHeightStyleValue', description: 'Line height' }
  letterSpacing: { $ref: '#/definitions/MixedNumberStyleValue', description: 'Letter spacing' }
  textCase: { $ref: '#/definitions/MixedStringStyleValue', description: 'Text case' }
  textDecoration: { $ref: '#/definitions/MixedStringStyleValue', description: 'Text decoration' }
  paragraphIndent: { $ref: '#/definitions/NumberStyleValue', description: 'Paragraph indent' }
  paragraphSpacing: { $ref: '#/definitions/NumberStyleValue', description: 'Paragraph spacing' }
  leadingTrim: { $ref: '#/definitions/MixedNumberStyleValue', description: 'Leading trim' }
  listSpacing: { $ref: '#/definitions/NumberStyleValue', description: 'List spacing' }
  hangingPunctuation: { $ref: '#/definitions/BooleanStyleValue', description: 'Hanging punctuation' }
  hangingList: { $ref: '#/definitions/BooleanStyleValue', description: 'Hanging list' }
  textStyleId: { $ref: '#/definitions/StyleIdValue', description: 'Text style reference' }
  # ...other properties...

# After — #/definitions/Styles/properties
properties:
  typography: { $ref: '#/definitions/TypographyStyleValue', description: 'Typography properties. FigmaStyle when a named text style is used; Typography when defined inline.' }
  # All 14 typography keys — REMOVED
  # ...other properties...
```

---

## Type ↔ Schema Impact

**Symmetric**: Yes. Every type change has a corresponding schema update:
- `types/Styles.ts` `Typography` interface → `schema/styles.schema.json` `#/definitions/Typography`
- `types/Styles.ts` `typography?: FigmaStyle | Typography` → `schema/styles.schema.json` `#/definitions/TypographyStyleValue` (oneOf union)
- Removal of 14 flat keys from `Styles` type → removal of 14 properties from `#/definitions/Styles/properties`
- Removal of 14 literals from `StyleKey` type → (no direct schema equivalent; `StyleKey` is not exported to schema)

**Parity check**:
- `Typography.fontSize` (`number | 'mixed' | VariableStyle`) → `#/definitions/Typography/properties/fontSize` (oneOf: number, 'mixed', VariableStyle)
- `Typography.fontFamily` (`string | number | 'mixed'`) → `#/definitions/Typography/properties/fontFamily` (oneOf: string, number, 'mixed')
- `Typography.fontStyle` (`string | number | 'mixed'`) → `#/definitions/Typography/properties/fontStyle` (oneOf: string, number, 'mixed')
- `Typography.lineHeight` (`string | number | VariableStyle`) → `#/definitions/Typography/properties/lineHeight` (oneOf: string, number, VariableStyle)
- All 13 fields follow the same primitive-aligned pattern.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | MAJOR — code accessing individual typography keys will break | Migrate reads from `styles.fontSize` to `styles.typography?.fontSize` (when inline) or resolve `styles.typography` when `FigmaStyle`. Update audit/governance logic to check `typography` key instead of `textStyleId`. |

**Note**: Per mode instructions, only `anova-kit` is listed. `anova-transformer` and `anova-plugin` manage their own ADR workflows.

---

## Semver Decision

**Version bump**: Incorporated into `0.11.0` (already bumped; not yet released)

**Justification**: This change is being merged into the existing `0.11.0` release. Removing 14 exported keys from the `Styles` type and `StyleKey` union is a breaking change per Constitution III ("Removing or renaming an exported type or a named field within a type is a breaking change"). Any consumer accessing `styles.fontSize`, `styles.textStyleId`, or any of the other 12 typography keys will experience a compile-time error after upgrading. 

This breaking change is consistent with the MAJOR nature of the `0.11.0` release, which already includes other breaking changes (e.g., ADR 002's replacement of `effectStyleId` with `effects`).

---

## Consequences

- Consumers can now represent typography as either a named text style reference OR inline values, with compile-time enforcement of mutual exclusion
- Variant layering is simplified: shallow merge of `Typography` objects instead of 13 independent key merges
- Downstream resolution becomes unambiguous: discriminate on `FigmaStyle` vs `Typography` type
- Any tool validating against `schema/styles.schema.json` must update to the new version (MAJOR bump enforces this)
- Governance tooling (e.g., `anova-kit` text style audits) gains a single stable key (`typography`) to check instead of dual-path logic across `textStyleId` + individual overrides
- The pattern established in ADR 002 (`EffectsGroup`) is extended to typography, creating consistency across composite style properties
- Old flat typography keys (`fontSize`, `fontFamily`, etc.) are removed — no deprecation shim; consumers must migrate in one step
