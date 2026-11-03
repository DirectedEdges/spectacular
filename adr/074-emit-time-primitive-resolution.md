# ADR: Primitives Promote to Component Instances During Capture, in Composed Content

**Branch**: `adr/spec-time-promotion`
**Created**: 2026-08-30
**Status**: ACCEPTED
**Summary**: Primitive layers in composed example content promote to design system component instances during capture, not at emit.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A component's `examples.yaml` records what a designer assembled. Two kinds of thing appear
there side by side, and today they are recorded very differently:

```yaml
anatomy:
  heading: { type: text }                          # a layer the designer drew
  link1:   { type: instance, instanceOf: dsLink }  # a component the designer placed
```

`link1` is an instance: it names the component it is, and carries `propConfigurations`.
`heading` is a text layer with a bag of styles — even though the design system ships a text
component, and the product code that this example stands for would use it.

The difference is not a difference in intent. Composing with real instances in a design file
is laborious, so designers build examples out of raw layers as an approximation of what the
product would compose. The spec faithfully records the approximation.

That leaves the spec describing the design file's limitations rather than the design system's
intent, and it pushes the interpretation downstream. Every consumer that wants to emit
something better than a `div` has to decide, on its own, that a text layer wearing this
design system's typography token means that design system's text component. That decision is
identical for React, Web Components, and any other implementation — it is a fact about the
design system, not about a platform — but nothing in the contract lets it be stated once.

A prior draft of this ADR placed that decision at emit time, in per-platform bindings under
`PlatformConventions.primitives`:

> Bindings are consulted at emit time. The spec keeps `type: text`; a generator resolves it
> to this platform's component, so one spec serves every implementation and no binding is
> ever written into a spec.

The neutrality argument in that sentence does not hold up. `dsText` is not a platform's
component — it is a design system's component, and a spec is authored against exactly one
design system. Naming it in the spec costs nothing in portability across React and Web
Components, which is the portability that exists. What the emit-time placement does cost is
that the same interpretation is re-derived per platform, and that the spec cannot be read as
a statement of what the composition *is*.

---

## Decision Drivers

- **A spec should state design intent, not the source file's limitations.** Where the two
  differ, the spec is the better place for the intent
- **One decision, stated once.** An interpretation identical for every implementation belongs
  in the artifact all implementations share, not repeated per platform
- **Composed content and component definitions are different material.** A component's own
  anatomy is authored; example content is an approximation
- **Reversibility.** Any interpretation applied during capture must be recoverable from the
  spec alone, without the source file
- **Nothing is silently lost.** An incomplete or absent convention degrades to today's output
- **Absence means one thing (ADR-071)**, and **no logic in this package** (Constitution II)

---

## Options Considered

### Option A: Promote during capture, in composed content only *(Selected)*

A primitive layer in `examples.yaml` becomes an instance of the design system's component.
Its anatomy `type` becomes `instance`, it gains `instanceOf`, and the styles the promotion
interpreted become `propConfigurations` — with provenance recorded per ADR-084 so the
transformation reverses.

```yaml
# Before
anatomy:
  heading: { type: text }
elements:
  heading:
    styles:
      textColor:  { $token: Color/Inverse on surface, $type: color }
      typography: { $token: Typography/font__400__medium, $type: typography }
    content: Heading

# After
anatomy:
  heading: { type: instance, instanceOf: dsTypography }
elements:
  heading:
    instanceOf: dsTypography
    propConfigurations: { color: Inverse on surface, size: 400, weight: Medium, text: Heading }
    $extensions:
      com.figma:
        promotedPrimitive: true
        styles:
          textColor:  { $token: Color/Inverse on surface, $type: color }
          typography: { $token: Typography/font__400__medium, $type: typography }
```

`variants.yaml` is untouched. A component's own anatomy is authored: someone who put a text
layer in `dsBadge` chose a text layer, and saying it is an instance of `dsTypography` would
describe `dsBadge` as something other than what it is.

**Pros**:

- Composed content ends up in the shape it already uses for placed instances, so one reading
  covers both — the `heading` above now looks like the `link1` beside it
- The interpretation is stated once, in the artifact every implementation reads
- The spec becomes readable as intent: "this composition uses the text component"
- No contract change to how instances are expressed — `instanceOf` and `propConfigurations`
  already exist and already mean this
- Reversible, because ADR-084 records what was interpreted and what it replaced

**Cons / Trade-offs**:

- The spec is no longer a verbatim transcript of the design file for composed content. This
  is the intended change, and the residue is what keeps it honest
- Interpretation happens once, at capture, so a spec reflects the conventions in force when
  it was produced. Re-capture is how a spec adopts a changed table

---

### Option B: Resolve at emit time, per platform *(Rejected)*

The prior draft: the spec keeps `type: text`, and each platform's generator consults its own
binding.

**Rejected because**: it states one design-system fact once per platform, and it justifies
itself with a neutrality that is not at stake — a spec is already specific to one design
system, so naming that system's component does not narrow it. It also leaves the spec unable
to distinguish "a text layer" from "the text component, drawn as a layer", which is exactly
what a reader of composed content needs to know.

---

### Option C: Promote everywhere, including a component's own `variants.yaml` *(Rejected)*

**Rejected because**: it misdescribes components. A design system's badge contains a text
layer; that is what its anatomy is. Replacing it with an instance of the text component makes
the badge's own definition depend on a conventions table, and makes a component's anatomy
unable to express "a text layer" at all.

---

### Option D: Record both — keep `type: text` and add the resolved component alongside *(Rejected)*

**Rejected because**: it states the same element two ways and leaves every consumer to decide
which wins, with no rule in the contract to settle it. It also doubles the element's size for
no gain: the residue in ADR-084 already preserves the original, in a namespace that cannot be
mistaken for the live value.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Removed `PlatformConventions.primitives` and `PrimitiveBindings` — the emit-time binding block | MINOR |
| `Conventions.ts` | Removed `TextBinding`, `GlyphBinding`, `ContainerBinding` and their `Resolved*` forms | MINOR |
| `Conventions.ts` | `PrimitiveKind` is declared directly as `'text' \| 'glyph' \| 'container'` rather than derived from `PrimitiveBindings` | MINOR |
| *(none)* | `Element`, `ElementType`, `Anatomy` and `Styles` are unchanged — promotion writes members that already exist | — |

Every removal is of a member added in this same unreleased version, so nothing published
changes shape.

**Example — new shape** (`types/Conventions.ts`):

```yaml
# Before
PlatformConventions:
  primitives?:
    text?:      { component: ... }
    glyph?:     { component: ... }
    container?: { component: ... }

# After — the block is gone; the vocabulary it defined survives on its own
PrimitiveKind: 'text' | 'glyph' | 'container'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Removed `primitives` from the platform definition, and the three binding definitions | MINOR |
| `conventions.schema.json` | `PrimitiveKind` retained as a standalone string enum | MINOR |

### Notes

`PrimitiveKind` keeps its meaning exactly — the subset of `ElementType` whose members can be
promoted, triggered by an element's own declared `type` so that nothing is inferred. Only its
derivation changes: it was `keyof PrimitiveBindings`, and that interface no longer exists.
ADR-075 consumes it as the `kind` of a promotion entry.

This ADR establishes *when and where* promotion happens. What a promotion consults, and what
it writes into `propConfigurations`, is ADR-075. The provenance it records is ADR-084. Whether
it runs at all is ADR-085.

Promotion applies to `slotContentExamples` and `instanceExamples` — the composed material in
`examples.yaml`. An element already carrying `instanceOf` is left alone; it is already what
promotion would make it.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: each removed type has its definition removed from
  `conventions.schema.json`; `PrimitiveKind` ↔ the standalone enum, with the same three
  members before and after

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Promotion runs during capture and writes composed content in instance shape | Apply promotion when producing examples |
| `specs-from-figma` | Same, in the shared processing path | Implement promotion; stop emitting per-platform bindings |
| `specs-plugin-2` | Same capture path via the plugin runtime | Recompile |
| `figma-from-specs` | Composed elements arrive as instances rather than primitives | Branch on the ADR-084 provenance when rendering back |

Generators that resolved primitives at emit time no longer need to: a promoted element is an
instance, and instances already resolve to a component name and import.

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**

**Justification**: the removed members were added in this same unreleased version and have
never been published, so no consumer contract is broken. `PrimitiveKind` is retained with an
identical value set. Per the constitution's versioning rule this is MINOR, not MAJOR.

---

## Consequences

- Composed content states which component it uses, in the shape the spec already has for
  instances
- A design-system interpretation is recorded once rather than re-derived per platform
- A component's own definition still describes itself in primitive terms; only composed
  material is interpreted
- A spec carries the result of the conventions in force at capture. Changing the table and
  re-capturing changes composed content — which is what makes the table meaningful, and what
  makes ADR-085's setting necessary for comparing runs
- Consumers can read composed content without a conventions file, because the answer is in the
  spec
- The spec is no longer a verbatim transcript of the design file for composed content, and
  reversing it depends on the ADR-084 residue being present
