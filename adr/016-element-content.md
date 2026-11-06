# ADR: Element Content Identification

**Branch**: `016-element-content`
**Created**: 2026-03-10
**Status**: ACCEPTED
**Summary**: A `content` property replaces `text`, identifying literal or bound content on any element type.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Element` type currently includes a `text` property that captures the content of text-type anatomy elements:

```yaml
# types/Element.ts — current shape
Element:
  children?: Children
  parent?: string | null
  styles?: Styles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding
  text?: string | PropBinding          # text content only
```

This property serves text elements well — it captures literal string content or a prop binding reference for text that varies by variant. However, icon elements (element type `icon`) have an analogous concept: the **name** of the icon glyph being displayed (e.g., `caret-down`, `close`, `search`). Today there is no field on `Element` to capture this.

ADR `011-icon-glyph-as-content` added `iconNamePattern` config so the transformer can detect icon component assets. ADR `013-icon-fillColor` added a dedicated `fillColor` style for icon coloring. But the element definition still lacks a way to record *which* icon glyph an element displays.

The `text` property name is specific to one element type. Adding a parallel `iconName` (or similar) field creates a pattern where each content-bearing element type gets its own top-level field — an approach that does not scale and creates ambiguity about which field applies when.

---

## Decision Drivers

- **Additive-only for MINOR**: Avoid breaking changes to preserve a MINOR bump; existing `text` usage must remain valid during any transition
- **Type ↔ schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic**: Fields are pure data shapes only (Constitution II)
- **Semantic clarity**: A field's name should describe its role without requiring knowledge of which element type it belongs to
- **Scalability**: The solution should accommodate future content-bearing element types (e.g., media, embedded content) without proliferating top-level fields

---

## Options Considered

### Option A: Add a `content` field and remove `text` *(Selected)*

Add a new optional `content` field of type `string | PropBinding` that serves as the unified content identifier for any content-bearing element type. For `text` elements, `content` holds the text string or text prop binding. For `icon` elements, `content` holds the icon glyph name or an instance swap prop binding.

Remove `text` immediately — no deprecation period. Pre-1.0 semver permits breaking changes in MINOR releases, and `0.13.0` already includes other breaking changes.

```yaml
# Element — new shape
Element:
  children?: Children
  parent?: string | null
  styles?: Styles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding
  content?: string | PropBinding       # replaces text
```

**Pros**:
- Single field covers text content, icon glyph names, and future content types
- Scales to new element types without new fields
- Clean break — no dual-field ambiguity for consumers

**Cons / Trade-offs**:
- Breaking change for consumers currently reading `Element.text`

---

### Option B: Add a separate `name` field for icon elements

Add an optional `name` field to `Element` specifically for icon glyph identification.

```yaml
Element:
  name?: string | PropBinding          # icon glyph name
  text?: string | PropBinding          # text content (unchanged)
```

**Rejected because**: Creates a pattern of per-type content fields on `Element`. Each new content-bearing element type would require yet another top-level field. The field name `name` is also ambiguous — it could be confused with the element's own name (its key in the `Elements` record). Violates the scalability driver.

---

### Option C: Keep `text` and overload it for icon content

Reuse the existing `text` field for both text content and icon glyph names.

```yaml
# No schema change — text field used for both
Element:
  text?: string | PropBinding          # text content OR icon glyph name
```

**Rejected because**: The field name `text` strongly implies text-specific content. Overloading it for icon glyph names creates semantic confusion — consumers would need to cross-reference the anatomy element type to interpret the field correctly. The spec contract should be self-describing per the semantic clarity driver.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Element.ts` | Added optional field `content?: string \| PropBinding` | MINOR |
| `Element.ts` | Removed field `text` | MAJOR |
| `PropBinding.ts` | Changed `BindingKey` — `'text'` replaced by `'content'` | MAJOR |

**Example — new shape** (`types/Element.ts`):
```yaml
# Before
Element:
  children?: Children
  parent?: string | null
  styles?: Styles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding
  text?: string | PropBinding

# After
Element:
  children?: Children
  parent?: string | null
  styles?: Styles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding
  content?: string | PropBinding        # replaces text
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added optional property `content` to `Element` definition | MINOR |
| `component.schema.json` | Removed property `text` from `Element` definition | MAJOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/Element/properties
content:
  oneOf:
    - type: string
    - $ref: "#/definitions/PropBinding"
  description: "The content for content-bearing elements: text string for text elements, glyph name for icon elements, or a PropBinding reference"

# text property removed entirely
```

### Notes

- The `content` field is intentionally the same type as `text` (`string | PropBinding`) — it is a direct replacement, not a new shape.
- `text` is removed immediately with no deprecation period. Pre-1.0 semver permits breaking changes in MINOR releases.

---

## Type <> Schema Impact

- **Symmetric**: Yes — `content` is added to both `types/Element.ts` and `schema/component.schema.json#/definitions/Element/properties`
- **Parity check**: `Element.content` (type) maps to `Element.properties.content` (schema); both accept `string | PropBinding`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; update consumers to read `content` field | Adopt `content` for icon and text element output; continue supporting `text` until removal |

---

## Semver Decision

**Version bump**: `0.13.0` (`MINOR`)

**Justification**: `Element.text` is removed and replaced by `Element.content`; `BindingKey` changes from `'text'` to `'content'`. These are breaking changes, but pre-1.0 semver permits breaking changes in MINOR releases. The `0.13.0` release already includes other breaking changes.

---

## Consequences

- Consumers can now access icon glyph names via `Element.content` in the spec output
- Text element content moves from `Element.text` to `Element.content` — consumers must update reads
- Future content-bearing element types can use the same `content` field without adding new top-level properties
- `BindingKey` consumers must update `'text'` references to `'content'`
