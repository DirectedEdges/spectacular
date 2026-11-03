# ADR: Classify Props by External vs Internal Ownership

**Branch**: `020-props-state-separation`
**Created**: 2026-03-11
**Status**: DRAFT
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Component.props` field is typed as `Props = Record<string, AnyProp>` — a flat map keyed by property name. Today this map conflates properties that live at very different points on an ownership spectrum:

- A `size` prop is always set by the consumer — it's pure public API.
- A `selected` prop on a `Tab` is set externally by a parent, but the component also manages it internally.
- A `focused` prop can be forced programmatically but is primarily driven by user interaction.
- A `hover` state is entirely transient and interaction-driven — no consumer ever sets it declaratively.

In Figma, all of these surface identically as component properties (variant axes or boolean/text properties), so the transformer treats them as a flat bag. But downstream consumers need to distinguish them: documentation tools list API props for developers while treating interaction states as visual variants illustrating behavior.

The current schema provides no metadata to express where a property falls on this spectrum. Consumers rely on naming conventions or hard-coded heuristics — fragile approaches that vary across design systems.

The distinction is not binary. A clean "public vs internal" split breaks down because many properties (`selected`, `focused`, `disabled`) are genuinely dual-purpose — externally settable *and* internally managed. The right model is a spectrum, not a bucket.

---

## Property Landscape

The table below surveys common component properties, characterizing how likely each is to be set externally (by the consumer) vs managed internally (by the component or interaction). This is reference material — not a fixed taxonomy.

| Property | Typical type | Set externally? | Set by interaction? | Rationale |
|----------|-------------|----------------|--------------------:|-----------|
| `size` | enum | Always | Never | Pure configuration — the consumer chooses a size and it doesn't change from interaction |
| `appearance` | enum | Always | Never | Visual variant — `primary`, `secondary`, `ghost` etc. are consumer decisions |
| `orientation` | enum | Always | Never | Layout direction — structural choice made at authoring time |
| `truncation` | boolean | Always | Never | Whether to truncate overflow — a layout/display decision |
| `label` | string | Always | Never | Content the component renders — always provided externally |
| `description` | string | Always | Never | Supporting text content — same as `label` |
| `icon` | glyph | Always | Never | Instance swap / asset reference — consumer-provided content |
| `disabled` | boolean | Usually | Rarely | Typically set by a parent, but can be inherited from a `fieldset` or form context |
| `readonly` | boolean | Usually | Rarely | Almost always an explicit consumer choice; occasionally derived from permissions context |
| `selected` | boolean | Often | Often | A `Tab` receives this from its parent; a `ListItem` may toggle it on user click |
| `checked` | boolean | Often | Often | Set externally on a `Checkbox`, but also toggled by the user clicking it |
| `expanded` | boolean | Often | Often | An `Accordion` item can be pre-expanded or toggled by user interaction |
| `open` | boolean | Sometimes | Often | A `Popover` can be opened programmatically, but is usually triggered by interaction |
| `value` | string | Sometimes | Often | Form controls accept initial values externally but update from user input |
| `indeterminate` | boolean | Sometimes | Rarely | A `Checkbox` state set when child checkboxes have mixed values — usually computed |
| `loading` | boolean | Sometimes | Rarely | Set when an async operation is in flight — driven by app logic, not direct user action |
| `error` | boolean | Sometimes | Rarely | Can be forced externally, but typically derived from validation logic |
| `focused` | boolean | Rarely | Usually | Follows browser focus; *can* be force-focused programmatically but rarely is |
| `focus-visible` | boolean | Never | Always | Keyboard focus ring — purely a browser/interaction concern |
| `hover` | boolean | Never | Always | Mouse-over state — entirely transient, no API surface |
| `active` | boolean | Never | Always | Mouse-down / touch state — transient interaction feedback |
| `pressed` | boolean | Never | Always | Sustained press state — same category as `active` |
| `dragging` | boolean | Never | Always | In-progress drag interaction — transient |

**Key observations**:
- The top of the table (always external, never interaction) is unambiguously "public API"
- The bottom (never external, always interaction) is unambiguously "internal state"
- The middle is genuinely dual-purpose — the same property name (`selected`, `checked`) can be more or less external depending on the component
- Any fixed set of category labels will draw arbitrary lines through this middle zone

---

## Decision Drivers

- **Additive-only change**: Avoid a MAJOR bump — any solution must be backward-compatible with existing output that uses a flat `props` map
- **Type ↔ schema symmetry**: Every type change must have a corresponding schema update (Constitution I)
- **No runtime logic**: The solution must be purely structural — types and schema only (Constitution II)
- **Shared concept, not implementation detail**: The classification must represent a genuine, universally meaningful distinction across all consumers — not a convenience for one downstream package (Constitution III)
- **Respect the spectrum**: The solution must not force a rigid taxonomy on properties that resist clean categorization

---

## Options Considered

### Option A: Add an `internal` flag to each prop *(Selected)*

Add an optional `internal?: boolean` field to each prop interface. When `true`, the property is primarily component-managed (interaction state, derived state). When `false` or omitted, the property is consumer-facing.

```yaml
Component:
  props:
    size:
      type: string
      default: medium
      enum: [small, medium, large]
    label:
      type: string
    selected:
      type: boolean
      default: false
    hover:
      type: boolean
      default: false
      internal: true
    state:
      type: string
      default: rest
      enum: [rest, hover, active, pressed]
      internal: true
```

This draws a single, deliberately conservative line: `internal: true` marks properties that are clearly not part of the public API (the bottom section of the landscape table). Everything else — including the ambiguous middle — defaults to consumer-facing by omission.

**Pros**:
- Simplest possible signal — one optional boolean, no taxonomy to argue over
- The middle zone stays unmarked rather than being forced into an artificial category
- Props remain in a single flat map — `Variant.configuration` is unaffected
- Optional field — existing output without `internal` is fully valid
- Consumers get the most common filtering need ("show me the API props" = exclude `internal: true`) without over-engineering

**Cons / Trade-offs**:
- Does not distinguish *within* the external props (configuration vs content) or *within* the internal props (interaction vs derived)
- The ambiguous middle (`selected`, `focused`, `disabled`) remains unlabeled — consumers who need finer distinctions must still apply their own heuristics for those
- Binary signal on a non-binary problem — but this is a feature: it avoids pretending the middle zone has clean boundaries

---

### Option B: Add a multi-value `purpose` tag *(Rejected)*

Add an optional `purpose` field with an enum like `'configurable' | 'content' | 'controlled' | 'derived' | 'interaction'`.

**Rejected because**: The category names are abstract and overlap. `controlled` vs `derived` is a framework-specific distinction that doesn't map cleanly to the design system domain. Properties like `disabled` and `selected` resist placement into any single bucket. A fixed taxonomy creates the illusion of precision where the underlying reality is fuzzy.

---

### Option C: Binary split into `props` and `state` *(Rejected)*

Add a separate `state?: Props` field on `Component`. Public API props stay in `props`; internal state moves to `state`.

**Rejected because**: The structural split forces every property into one bucket or the other. Dual-purpose properties (`selected`, `focused`, `disabled`) have no correct placement — `selected` is external for `Tab` but internal for `ListItem`. A tag on the property is more honest than a structural bucket.

---

### Option D: Status quo — rely on naming conventions *(Rejected)*

Make no schema change. Consumers infer property roles by recognizing well-known names.

**Rejected because**: Naming conventions are fragile, undocumented in the schema, and vary across design systems. The schema should be self-describing.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add optional `internal?: boolean` to `BooleanProp`, `TextProp`, `GlyphProp`, `EnumProp`, `SlotProp` | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# Before
BooleanProp:
  type: 'boolean'
  default: boolean

# After
BooleanProp:
  type: 'boolean'
  default: boolean
  internal?: boolean   # optional — MINOR

# Same pattern for TextProp, GlyphProp, EnumProp, SlotProp
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add optional `internal` boolean property to `BooleanProp`, `TextProp`, `GlyphProp`, `EnumProp`, `SlotProp` | MINOR |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# Addition to each prop definition (e.g., BooleanProp)
BooleanProp:
  properties:
    type: { type: string, const: boolean }
    default: { type: boolean }
    internal:
      type: boolean
      description: >
        When true, this property is primarily managed by the component
        itself (e.g., interaction states like hover, pressed) rather than
        set by the consumer. Omission or false indicates a consumer-facing
        property.
  # internal is NOT in required[] — optional field
```

### Notes

- `internal` is optional on every prop. Omission is equivalent to `false` (consumer-facing)
- The flag is intended for the clearly internal end of the spectrum — properties like `hover`, `active`, `pressed`, `dragging`, `focus-visible`, and composite interaction-state enums (e.g., `state: rest|hover|active|pressed`)
- Ambiguous properties (`selected`, `focused`, `disabled`, `loading`) should generally be left unmarked — they are not clearly internal, and marking them would assert a false precision
- The landscape table in this ADR serves as guidance for classification decisions but is not encoded in the schema
- Classification is the transformer's responsibility. The schema provides the field; the transformer applies it
- `Variant.configuration` (`PropConfigurations`) is unaffected — it remains a flat `Record<string, string | number | boolean>` referencing prop keys regardless of their `internal` flag

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `internal?: boolean` on each prop interface maps to an optional `internal` boolean property on each prop schema definition
  - Both are optional in type (via `?`) and schema (not in `required[]`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Additive — `internal` field available on all prop types | Optionally filter out `internal: true` props when displaying API surface; no breaking changes |

---

## Semver Decision

**Version bump**: `0.13.0` (`MINOR`)

**Justification**: All changes are additive optional fields. No existing fields are modified, removed, or renamed. `internal` is a new optional boolean on existing interfaces. This is MINOR per Constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

- Consumers can exclude clearly-internal props (interaction states) from API documentation with a simple filter on `internal: true`
- The ambiguous middle zone is left unmarked, which is an honest representation — these properties genuinely vary by component and usage context
- The landscape table in this ADR becomes a reference document for transformer classification decisions
- Existing output remains valid — omitting `internal` is equivalent to "consumer-facing"
- Future ADRs could introduce additional metadata (e.g., finer-grained categorization) if the need emerges, without conflicting with `internal`
