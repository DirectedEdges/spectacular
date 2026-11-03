# ADR: Rename `icon` Element Type to `glyph`

**Branch**: `017-icon-or-glyph-element-name`
**Created**: 2026-03-10
**Status**: ACCEPTED
**Summary**: A `glyph` element type, `GlyphProp` and `glyphNamePattern` emit icons as first-class by applying Figma conventions.
**Decides**: fillColor
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The Anova schema defines an `ElementType` union that includes the literal `'icon'` to classify elements that represent standalone visual symbols — typically small vector assets sourced from a design system's icon library. These elements are raw graphic shapes that can be directly styled (fill color, size) and are represented in Figma as component instances matching a naming pattern (e.g. `"DS Icon Glyph /"`).

However, many design systems also ship a higher-level **"Icon" component** — a wrapper that composes the raw glyph with props like `size`, `color`, `variant`, and accessibility attributes. This creates naming ambiguity: when a spec references an element of type `icon`, it is unclear whether it means the raw vector asset or the composed component.

At least one team already uses the term "glyph" to distinguish the raw asset from the component wrapper. The question is whether `glyph` (or another term) is sufficiently clear, specific, and widely understood to replace `icon` as the element type name across the schema.

Beyond the current `icon` type, design systems commonly include other visual asset element types that the schema may need to represent in the future:
- **Marks / product logos** — brand symbols with fixed appearance; rarely restyled beyond size
- **Images** — raster content (photos, screenshots); no fill color styling
- **Illustrations** — complex vector artwork; minimal per-element styling

The chosen name for the current `icon` element type must sit coherently alongside these potential future peers in the `ElementType` union. A name that is too broad risks collision; a name that is too narrow may not generalize.

**Current surface area of `icon` in the package:**
- `types/Element.ts`: `ElementType` union literal `'icon'`
- `types/Props.ts`: `IconProp` interface (icon/instance swap property)
- `types/Config.ts`: `iconNamePattern` field on `Config.processing`
- `types/Styles.ts`: `fillColor` JSDoc — "Icon fill color. Present on ICON element type only."
- `types/Anatomy.ts`: Documentation examples referencing `"icon"`
- `types/index.ts`: Re-export of `IconProp`
- `schema/component.schema.json`: `ElementType` enum value `"icon"`, `IconProp` definition, `iconNamePattern` property, content description
- `schema/styles.schema.json`: `fillColor` description

---

## Decision Drivers

- **Naming clarity**: The element type name must unambiguously refer to the raw visual symbol, not to a composed component that wraps it
- **Taxonomy coherence**: The name must work as a peer alongside potential future `ElementType` values (`mark`, `image`, `illustration`) — specific enough to distinguish from them, not so broad that it subsumes them
- **Collective understanding**: The term must be reasonably intuitive to designers and engineers across teams without requiring explanation
- **Additive-only preference**: The constitution prefers MINOR (additive) changes; renaming is inherently MAJOR (breaking) and requires strong justification
- **Type ↔ schema symmetry**: Any rename must be applied consistently across all types and schema files (Constitution I)
- **No logic changes**: The rename must be purely a naming/type change with no runtime behavior modifications (Constitution II)

---

## Options Considered

### Option A: Rename to `glyph` *(Selected)*

Replace `'icon'` with `'glyph'` across the `ElementType` union, prop type name, config field, and all schema definitions.

**Pros**:
- Eliminates the ambiguity between "icon element" and "Icon component"
- Already in use by at least one team as their element type term
- Etymologically specific: a glyph is a distinct visual symbol or character — fits the concept of a single graphic asset
- **Taxonomy fit**: Sits naturally alongside future peers — `glyph`, `mark`, `image`, `illustration` are all distinct, non-overlapping visual forms at the same level of specificity

**Cons / Trade-offs**:
- **Breaking change**: Renaming an `ElementType` literal is MAJOR per the constitution
- **Narrow recognition**: In typography, "glyph" refers to a rendered character form; some engineers may find the term unfamiliar or overly academic outside that context
- **Not self-documenting**: A new user seeing `type: "glyph"` in output may not immediately understand it means "a small vector icon asset"

---

### Option B: Rename to `pictogram` *(Rejected)*

Replace `'icon'` with `'pictogram'` across all touchpoints.

**Pros**:
- Precise definition: a pictorial symbol representing a concept — exactly what icon assets are
- Unambiguous: no collision with component names, JS primitives, or other technical terms
- **Taxonomy fit**: `pictogram`, `mark`, `image`, `illustration` read as a clean, differentiated set of visual content types

**Cons / Trade-offs**:
- **Breaking change**: Same MAJOR cost as Option A
- **Verbose**: At 9 characters, it's the longest `ElementType` value; ripple names like `PictogramProp` and `pictogramNamePattern` are heavy
- **Formality**: Feels academic — designers and engineers rarely say "pictogram" in daily conversation; "icon" and "glyph" are more natural

---

### Option C: Rename to `asset` *(Rejected)*

Replace `'icon'` with `'asset'` across all touchpoints.

**Rejected because**:
- **Taxonomy collision**: If the schema later adds element types for marks/logos, images, and illustrations, those are all "assets" too. Using `asset` for the current icon-like type would either force awkward disambiguation (`asset` vs `imageAsset`?) or block the term from serving as a future category name.
- **Too broad**: "Asset" describes a role (something reusable) rather than a visual form. It doesn't convey that these elements are small, styleable vector graphics with `fillColor` support — a characteristic that distinguishes them from images and illustrations, which have little or no per-element styling.
- **Loses specificity**: The current `icon` name, despite its ambiguity, at least signals "small pictographic element." `asset` signals nothing about visual form.

---

### Option D: Keep `icon` (status quo) *(Rejected)*

Make no change. Document the distinction between `icon` element type and "Icon" component in usage guides.

**Rejected because**:
- The naming ambiguity between `type: "icon"` (raw asset) and an "Icon" component (wrapper with props) is a real source of confusion, not merely a documentation gap. Teams already work around it by adopting their own terminology.
- The `iconNamePattern` config field further entrenches the conflation — it describes a detection pattern for the raw asset but uses the component-level term.
- Documentation can explain the distinction, but it cannot prevent the confusion from recurring every time a new team member reads `type: "icon"` in spec output and assumes it refers to the composed component.

---

### Option E: Rename to `symbol` *(Rejected)*

Replace `'icon'` with `'symbol'` across all touchpoints.

**Rejected because**:
- **Overloaded term**: JavaScript `Symbol` primitive, React symbols, and `<symbol>` in SVG create technical ambiguity that would confuse engineers reading the schema
- **Sketch-era connotation**: "Symbol" in Sketch referred to what Figma calls "components," reintroducing the very confusion this ADR aims to resolve
- **Taxonomy overlap**: `symbol` is broad enough to encompass marks and logos, creating the same category-vs-instance problem as `asset`

---

### Option F: Rename to `iconGlyph` *(Rejected)*

Replace `'icon'` with `'iconGlyph'` (compound name) across all touchpoints.

**Rejected because**:
- **Breaks naming pattern**: Every current `ElementType` value is a single word (`text`, `vector`, `container`, `slot`, `instance`, `line`, `ellipse`, `rectangle`, `polygon`, `star`). A compound name is inconsistent with the established convention.
- **Verbose ripple effect**: Derived names become unwieldy — `IconGlyphProp`, `iconGlyphNamePattern` — over-qualifying a concept that should be expressed in one word.
- **Over-signals the distinction**: The compound name implies the icon-vs-glyph difference is so important it must be encoded in every reference. In practice, the element type exists in a structural context (Anatomy, Elements) where the distinction is already clear from position.

---

## Decision

**Selected: `glyph`** (Option A).

`glyph` best balances specificity, familiarity, and coherence within the future `ElementType` taxonomy (`glyph`, `mark`, `image`, `illustration`). It is already in use by at least one team, eliminates the "Icon" component ambiguity, and follows the single-word naming convention. No deprecated aliases for `icon` will be retained.

The following changes apply:

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Element.ts` | Rename `ElementType` literal `'icon'` → `'glyph'` | MAJOR |
| `Props.ts` | Rename interface `IconProp` → `GlyphProp` | MAJOR |
| `Props.ts` | Update `AnyProp` union member reference | MAJOR |
| `Config.ts` | Rename field `iconNamePattern` → `glyphNamePattern` | MAJOR |
| `Styles.ts` | Update `fillColor` JSDoc: "Icon fill color" → "Glyph fill color" | PATCH |
| `Anatomy.ts` | Update doc examples: `"icon"` → `"glyph"` | PATCH |
| `index.ts` | Update re-export: `IconProp` → `GlyphProp` | MAJOR |

**Example — `ElementType` rename** (`types/Element.ts`):
```yaml
# Before
ElementType:
  - 'text'
  - 'icon'
  - 'vector'
  # ...

# After
ElementType:
  - 'text'
  - 'glyph'
  - 'vector'
  # ...
```

**Example — prop type rename** (`types/Props.ts`):
```yaml
# Before
IconProp:
  type: 'string'
  default?: string
  nullable?: boolean
  examples?: string[]

# After
GlyphProp:
  type: 'string'
  default?: string
  nullable?: boolean
  examples?: string[]
```

**Example — config field rename** (`types/Config.ts`):
```yaml
# Before
processing:
  iconNamePattern?: string

# After
processing:
  glyphNamePattern?: string
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Rename `ElementType` enum value `"icon"` → `"glyph"` | MAJOR |
| `component.schema.json` | Rename definition `IconProp` → `GlyphProp` | MAJOR |
| `component.schema.json` | Update `$ref` to `GlyphProp` in `AnyProp` | MAJOR |
| `component.schema.json` | Rename config property `iconNamePattern` → `glyphNamePattern` | MAJOR |
| `component.schema.json` | Update content description: "glyph name for icon elements" → "glyph name for glyph elements" | PATCH |
| `styles.schema.json` | Update `fillColor` description | PATCH |

**Example — schema enum rename** (`schema/component.schema.json`):
```yaml
# Before
ElementType:
  enum: ["text", "icon", "vector", "container", "slot", "instance", ...]

# After
ElementType:
  enum: ["text", "glyph", "vector", "container", "slot", "instance", ...]
```

### Notes

- Downstream packages must update all references to the old `'icon'` literal, type name, and config field in a single coordinated release.
- No deprecated aliases or re-exports for the old `icon` names will be retained.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — every type rename has a direct schema counterpart
- **Parity check**:
  - `ElementType` literal ↔ `component.schema.json` `ElementType.enum`
  - `IconProp` interface ↔ `component.schema.json` `#/definitions/IconProp`
  - `Config.processing.iconNamePattern` ↔ `component.schema.json` `#/.../iconNamePattern`
  - JSDoc/description updates ↔ schema `description` fields

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | MAJOR — recompile required; any code referencing `'icon'` element type, `IconProp`, or `iconNamePattern` will fail to compile | Update all references to renamed type, literal, and config field |

---

## Semver Decision

**Version bump**: `0.13.0` (no bump — pre-1.0 breaking changes are absorbed into the current minor release)

**Justification**: Per semver, pre-1.0 versions make no stability guarantees. Breaking changes to `ElementType`, `IconProp`, and `iconNamePattern` are part of the `0.13.0` release cycle. No deprecated aliases for the old `icon` names will be retained.

---

## Consequences

- All consumers must update references to the old `'icon'` literal, `IconProp` type, and `iconNamePattern` config field
- The ambiguity between "icon element type" and "Icon component" is resolved at the schema level
- Generated spec output will use the new term (e.g. `type: "glyph"`), affecting any downstream tooling that parses element types
- The `iconNamePattern` config field name changes, requiring configuration migration for existing users
- CHANGELOG must document the breaking rename with migration guidance
- The `ElementType` union establishes a naming precedent for future visual asset types (`mark`, `image`, `illustration`) — each should follow the same pattern of a single, specific noun describing the visual form
