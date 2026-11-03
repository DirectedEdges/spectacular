# ADR: `conventions.primitives` — a Declared Table from Styles to a Component's Props

**Branch**: `adr/spec-time-promotion`
**Created**: 2026-08-30
**Status**: ACCEPTED
**Summary**: A `conventions.primitives` table maps a captured layer's styles onto the props of the component it promotes to.
**Decides**: styles.fillColor, styles.height, styles.textColor, styles.typography, styles.typography.fontFamily, styles.typography.fontSize, styles.typography.fontStyle, styles.width
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

ADR-074 establishes that a primitive layer in composed content becomes an instance of a
design system's component. Naming the component is the easy half. The hard half is what
happens to what the layer carries:

```yaml
label:
  styles:
    textColor:  { $token: Color/On surface, $type: color }
    typography: { $token: Typography/font__200__medium, $type: typography }
    maxWidth:   { $token: Constants/Sizing/48x, $type: dimension }
    layoutSizingHorizontal: HUG
  content: Label
```

Two of those are what a text component's props exist for. The rest is styling the component
does not model. Something has to say which is which, and what value each becomes.

Two real design systems show why that cannot be derived.

**System A** ships three text components — a general text, a heading, a body — each taking a
named style through an `appearance` prop, plus `color` and `text`. Its icon takes `size`,
`name` and `color`.

**System B** ships one text component taking `size` and `weight` as separate axes, plus
`color`. Its icon takes `size`, `name`, and an `appearance` that is not a colour at all: an
intent enum of `error`, `warning`, `success`, driven by the glyph's fill.

Three things follow:

- **A token name cannot yield a prop value.** In System B a glyph filled with
  `Color/Critical` becomes `appearance: error`. The token and the value share no segment,
  stem, or casing. Any rule that read part of the token name would produce a plausible wrong
  value rather than failing
- **One source may reach several props.** System B maps one typography token to `size` *and*
  `weight`. System A maps the same kind of token to a single `appearance`. Neither shape is
  more correct
- **The same source means different things.** `fillColor` feeds `color` in A and an intent in
  B. No default prop name serves both, and no cross-platform naming survey would produce one,
  because the disagreement is between two libraries rather than two platforms

A prior draft mapped *concepts* to prop **names** — `color`, `typography`, `content` — and
deliberately left values alone, on the grounds that a conventions file should not enumerate a
design system's accepted values. Systems A and B are both unserviceable under that rule: it
cannot express B's intent enum, B's two-props-from-one-token, or the choice between A's three
text components.

---

## Decision Drivers

- **Declared, not derived.** A prop name and an accepted prop value are both facts about a
  library. Inferring either produces output that does not compile or does not render
- **The vocabulary must not privilege one library's shape.** Named-style and axis-decomposed
  type treatments are both common; a model naming those shapes needs a new name for the third
- **Fidelity loss must be impossible.** Anything unmapped reaches output as it does today
- **No logic in configuration** (Constitution II) — declarations only, no expressions
- **A closed vocabulary where it is a contract; an open one where it is a library's own**
- **Absence means one thing (ADR-071)**
- **The schema's validation surface should not track another type's key set**, so that
  renaming a `Styles` member does not churn this contract

---

## Options Considered

### Option A: A table of rules per component, keyed on source, producing props *(Selected)*

`conventions.primitives` holds one entry per component. Each declares the `elementType` it
can be promoted from, and a `map` of rules. A rule names a `source` and either sends its value to a
`prop` as-is, or looks it up in a `values` table whose right-hand side is a partial props
object.

```yaml
conventions:
  primitives:
    dsHeading:                          # System A — named style
      elementType: text
      map:
        - source: typography
          values:
            Typography theme/Headline/M:  { appearance: Headline M }
            Typography theme/Headline/XL: { appearance: Headline XL }
        - source: textColor
          values:
            Color/On surface: { color: On surface }
        - source: content
          prop: text

    dsIcon:                             # System B — colour in, intent out
      elementType: glyph
      map:
        - source: fillColor
          values:
            Color/Critical: { appearance: error }
            Color/Warning:  { appearance: warning }
        - source: width
          values:
            Constants/Sizing/4x: { size: XS }
            Constants/Sizing/6x: { size: M }
        - source: height                # the same axis, reached by a raw value
          values:
            16: { size: XS }
            24: { size: M }
        - source: content
          prop: name
```

**Pros**:

- A props-object right-hand side expresses one-to-one, one-to-many, and meaning-changing
  mappings with one construct, so no shape has to be named or anticipated
- `values` keys are literal — a full token path or a raw scalar — so a layer styled with a
  token and one styled with a bare number reach the same prop through the same mechanism
- Nothing is derived, so nothing fails silently: a source with no matching row does not
  resolve, and stays styling
- Entries are keyed by the component, so a design system with three text components is three
  entries rather than a special case
- Purely declarative — a lookup table, with nothing to evaluate

**Cons / Trade-offs**:

- The file is long, and grows with the design system. It is intended to be generated from
  each component's own `variants.yaml` and reviewed, rather than hand-written
- A table can go stale when a token is renamed. It degrades to unmapped styling rather than
  to a wrong value, and the ADR-084 residue means nothing is lost

---

### Option B: Map concepts to prop names, leaving values to the generator *(Rejected)*

The prior draft: `props: { color: color, typography: appearance }`, with values passed
through.

**Rejected because**: it cannot express System B's intent enum, where the value is not the
token's and not derivable from it; it cannot express one source reaching two props; and it
gives no way to choose between System A's three text components, since they differ by which
values they accept rather than by which concepts they take.

---

### Option C: Named shapes — a `namedStyle` mode and a `sizeAndWeight` mode *(Rejected)*

**Rejected because**: it enumerates the two shapes seen so far and needs a schema change for
the third. A props-object right-hand side already expresses both, and the ones not yet seen.

---

### Option D: Derive prop values from token names *(Rejected)*

Take a token's last path segment as the prop value — `Color/On surface` → `On surface`.

**Rejected because**: it holds for System A's colours by coincidence and fails for System B's
intent enum, where there is no segment to take. Its failure mode is the bad one: it emits a
plausible value the component rejects, rather than declining to map.

---

### Option E: Keyed on prop rather than source *(Rejected)*

**Rejected because**: it inverts the direction promotion runs. A promotion walks what the
element carries and asks what each thing becomes; keying on the prop means searching every
rule for each source, and permits two rules to claim one source with no rule for which wins.

---

## Decision

Two decisions: the table's shape, and how a promotion selects among candidates.

### Decision 1 — the table

`Conventions.primitives`, a component-keyed map, platform-neutral. A design system's props
are the same whichever platform renders them, so this does not sit under
`conventions.platforms.<id>`.

### Decision 2 — selection

A promotion may have several candidates: two components sharing an `elementType`. Selection is by
**score** — how many of an entry's rules resolve against this element.

- **No candidate resolves any rule** → no promotion. The element stays as it is
- **Otherwise** → promote to the highest scorer; ties break by declaration order. When more
  than one entry resolved, the promoted element records `multipleMatches` (ADR-084) so the
  ambiguity is durable rather than a warning that scrolls past

At least one rule must resolve. `elementType` alone never promotes, so a layer is only
this component if something about it says so. Scoring rather than first-match lets tables overlap
honestly: two components may legitimately accept one typography token, and the one that also
matches the element's colour or content is the better answer without the author ordering the
file to compensate.

Within one entry, two rules may write the same prop — `dsIcon` reaches `size` from both
`width` and `height`. The first matching rule in `map` order wins, so declaration order is the
author's control.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Added `Conventions.primitives?: Record<string, PrimitiveEntry>` | MINOR |
| `Conventions.ts` | Added `PrimitiveEntry` — `elementType: PrimitiveKind`, `map: PrimitiveRule[]` | MINOR |
| `Conventions.ts` | Added `PrimitiveRule` — `source: string`, and either `prop?: string` or `values?: Record<string, PropConfigurations>` | MINOR |
| `Conventions.ts` | Added `ResolvedConventions.primitives` mirroring the above | MINOR |

**Example — new shape** (`types/Conventions.ts`):

```yaml
Conventions:
  platforms?: Record<string, PlatformConventions>
  primitives?: Record<string, PrimitiveEntry>    # component name → entry

PrimitiveEntry:
  elementType: PrimitiveKind   # the anatomy element type that promotes to this component
  map: PrimitiveRule[]

PrimitiveRule:
  source: string               # a Styles member, a dotted path into typography, or 'content'
  prop?: string                # the source's value goes to this prop as-is
  values?:                     # or: a literal key → the props it writes
    <token path | raw scalar>: PropConfigurations
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Added `primitives` property at the root of `Conventions` | MINOR |
| `conventions.schema.json` | Added `#/definitions/PrimitiveEntry` and `#/definitions/PrimitiveRule` | MINOR |

```yaml
PrimitiveRule:
  type: object
  properties:
    source: { type: string }
    prop:   { type: string }
    values:
      type: object
      additionalProperties: { $ref: "#/definitions/PropConfigurations" }
  required: [source]
  oneOf:
    - required: [prop]
    - required: [values]
  additionalProperties: false
```

### Notes

**`elementType`, not `kind`.** The member holds a value from `PrimitiveKind`, which is
itself a strict subset of `ElementType` — the vocabulary a reader already knows from
`anatomy`. Naming it for that superset means an entry reads as "this component is promoted
from a text element", using the word the spec uses, rather than introducing a second term
for the same idea. It reaches across two levels — an anatomy item's element type — and that
is the point: it names where the value comes from.

**`source` is a plain string, not an enum.** The set an implementation honours is closed and
documented — for `text`: `typography`, `typography.fontSize`, `typography.fontFamily`,
`typography.fontStyle`, `textColor`, `content`; for `glyph`: `width`, `height`, `fillColor`,
`content`; for `container`: `layoutMode` (ADR-076). Keeping it out of the schema means the
validation surface does not track the `Styles` key set, so renaming a `Styles` member does not
churn this contract. A source outside the honoured set simply never resolves.

**The dotted typography sources are alternatives, not additions.** `Styles.typography` is
`TokenReference | Typography`: a layer wearing a text style carries the token and nothing
else, a layer styled ad hoc carries the composite and no token. Listing both forms is how one
entry serves both authoring styles — they can never both resolve.

**`fontStyle`, not `fontWeight`.** `Typography` has no weight member; `fontStyle` is
documented as a style name (`"Bold"`), which is what a `weight` enum maps from.

**Authored at `config/conventions/primitives.yaml`**, a reserved basename in the
per-platform conventions directory. The table is not a platform, so it does not take a
platform id, and no platform may take `primitives` (ADR-078 Decision 5).

**`values` reuses `PropConfigurations`** rather than a new map type. Its right-hand side is
exactly a set of prop values for the promoted instance, which is what that type already is.

**Unmatched sources fall back.** A source with no matching row stays in `styles` and reaches
output as it does today. A component's narrower enum therefore constrains without a separate
mechanism: a heading coloured outside `dsHeading`'s accepted set still promotes on its
typography rule and keeps its colour as styling.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Conventions.primitives` ↔ `#/definitions/Conventions/properties/primitives`;
  `PrimitiveEntry` ↔ `#/definitions/PrimitiveEntry`, whose `elementType` `$ref`s the
  `PrimitiveKind` enum ADR-074 retains; `PrimitiveRule.values` ↔ an object whose additional properties `$ref`
  `PropConfigurations`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Loads the new neutral section and applies it during capture | Read `primitives`; implement scoring and rule precedence |
| `specs-from-figma` | Same, in the shared processing path | Implement the table's application |
| `specs-plugin-2` | Same capture path via the plugin runtime | Recompile |
| `figma-from-specs` | None — it reads the promotion's result, not the table | Recompile |

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**

**Justification**: additive optional members and new definitions. The concept-keyed `props`
map this replaces was added in the same unreleased version and has never been published, so
its removal breaks no consumer contract.

---

## Consequences

- A design system states, once and literally, what each of its components accepts and what a
  captured layer becomes
- Named-style and axis-decomposed type treatments are expressible in the same construct, as
  is a source whose meaning changes on the way to a prop
- A design system with several components per primitive kind is expressible, and selection
  among them is decided by evidence rather than by authoring order
- Sizing is mappable, because the target component's own accepted values are declared
- Nothing is derived from a name, so a stale table degrades to styling rather than to a wrong
  value
- The file is long and grows with the design system. It is generated and reviewed, not
  hand-authored
- The conventions vocabulary is decoupled from `Styles`: renaming a style member does not
  invalidate a conventions file
