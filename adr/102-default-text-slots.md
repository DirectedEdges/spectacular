# ADR: Slots That Accept Primitive Content — `$text` and `$glyph` in `anyOf`

**Branch**: `102-default-text-slots`
**Created**: 2026-10-06
**Status**: DRAFT
**Summary**: Reserved `$text` and `$glyph` markers in `anyOf`, with `Element.contentStyles` formatting each primitive fill per variant.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A component's label is composable on every code platform. React types a Button's
children `ReactNode`, which accepts a string *or* an element. Web Components
expose the default `<slot>`, which accepts text nodes and element nodes alike.
SwiftUI takes a `@ViewBuilder` closure that a `Text` view satisfies as readily as
any other view. All three agree: a label is content, and content may be a
primitive or a component.

The spec cannot say that. `SlotProp.anyOf` is `string[]` — a list of permitted
*component* names, and nothing else. A Button whose children slot takes either a
label string or a composed Badge is inexpressible, so the component acquires a
second parallel prop for one of the cases, or that case goes undescribed.

**Figma already distinguishes what a slot accepts, and the distinction is
authored.** A designer who wants composable content authors a **slot** and puts a
primitive — a text layer, a glyph — into its default content. A designer who
wants a plain string authors a **`TEXT` property on a text layer**. Those are
different acts producing different structures, and the difference is the intent.
It needs no convention naming prop names and no annotation restating it.

Two gaps follow.

**A slot cannot name a primitive among the things it accepts.** `anyOf` draws
from the library's component namespace. There is no value in it, and no sibling
member, that means "a text primitive" or "a glyph primitive".

**The primitive's formatting has nowhere to live.** A Button's label typography
and color change across `appearance` and `state`; a glyph's fill changes with
them too. A consumer filling the slot with a primitive must apply that formatting
per variant; one filling it with a component must discard it, because the
component brings its own. And the primitive carrying that formatting sits inside
the slot's default content — it is a *fill*, not a part of the component — so it
cannot persist as its own entry in `anatomy`, where a transform would emit a node
the component does not always have.

**Default-ness is orthogonal and already solved.** ADR-099 added
`SpecsConventions.slots.default.match` and `SlotProp.defaultSlot` to name a
component's one always-composed slot. Whether a slot is *the default* and what it
*accepts* are independent: a Button's `children` is both default and
text-accepting, an Alert's `description` is text-accepting and not default, and a
layout component's slots are default-eligible and take components only. This ADR
changes nothing about ADR-099.

---

## Decision Drivers

- **Constitution I (types ↔ schema parity)**: any new member on `SlotProp`,
  `Element`, or `PlatformConventions` requires a symmetric change in `schema/`.
- **Constitution II (no logic)**: this package states what a slot may accept, what
  gates the reading, and where a primitive's formatting is recorded. It does not
  state the traversal that finds a slot's default content, nor the cascade a
  transform applies when rendering a fill.
- **Constitution III (minimal, intentional API)**: prefer widening an existing
  shape over adding a parallel one.
- **Constitution VI rule 1 (code platforms first, 2+ agreeing)**: React, Web
  Components, and SwiftUI all model a slot as accepting primitive content
  alongside element content.
- **Reuse the vocabulary the schema already has.** `ElementType` already names
  `text` and `glyph` for exactly these primitives, and `anatomy` items carry those
  names. A second spelling for the same concept — `string` beside `text` — would
  be two words for one thing in one contract.
- **Read what the designer authored; never re-declare it.** Where Figma's
  structure carries the intent unambiguously, a convention or annotation restating
  it is a second source of truth that can disagree with the file.
- **Composability varies per component, not per catalogue.** `description` is
  composable on an Alert and a plain string on a Tooltip. Any mechanism keyed to a
  library-wide name pattern cannot express this.
- **Default slot content is not single-child.** A real default fill may hold a
  glyph *and* a label. A rule that only fires on exactly one child would miss the
  common composed case and read a two-child slot as accepting nothing.
- **Anatomy lists only what the component always has.** A slot's default primitive
  content is a fill, and must not persist as an anatomy element a composed fill
  would delete.
- **Per-variant formatting must not fork from how variants already work**:
  variant-specific element values live in `default.elements` and
  `variants[].elements`, and this must be addressable there.
- **A changed reading of existing data is opt-in.** Emitting a slot differently
  than today changes output for libraries that authored nothing new.
- **Absence must stay backward compatible.** Every existing spec must remain valid
  and keep its meaning.
- **Degrade only with data the spec carries.** Where a fill is a component, the
  recorded primitive formatting must be identifiably discardable.

---

## Options Considered

### Decision 1 — What identifies a slot as accepting a primitive

#### Option A: Default slot content holds a top-level primitive of that type, in at least one variant *(Selected)*

A slot accepts a primitive of kind *K* when its default content includes at least
one **top-level** child that is a primitive of kind *K*, in at least one variant.
Nesting depth matters: only direct children of the slot count, so a text layer
buried inside a composed instance does not make the slot text-accepting.

Each kind is evaluated independently, so one slot may accept several:

```yaml
# Figma default slot content: [ glyph "check", text "Save" ]
# → the slot accepts both primitives, and a Badge besides
anyOf: [$glyph, $text, badge]
```

Where a kind is accepted, **the formatting recorded for it is taken from the first
top-level primitive of that kind, per variant.** First in child order, evaluated
once per variant, so a variant that reorders or restyles its default content
records its own answer.

**Pros**:
- Matches what real default content looks like. A Button's default fill is
  commonly a glyph plus a label, and an exactly-one-child rule would read that
  slot as accepting neither — the single most likely shape, excluded.
- Each kind resolves independently, so adding a glyph to a text-only slot's
  default content widens what the slot accepts rather than silently un-accepting
  the text.
- "Top-level child" keeps the rule from reaching into composed instances, whose
  own text belongs to their own components. Without that bound, a slot containing
  one Badge would read as text-accepting because the Badge has a label inside.
- "First per variant" is a total rule with no ambiguity to resolve at read time,
  and it degrades sensibly: two labels in one fill means the first one's
  formatting is the slot's, not that the slot has no formatting.
- Variant-scoped evaluation means the formatting record and the variant data are
  produced by the same pass, so they cannot disagree.

**Cons / Trade-offs**:
- Two primitives of one kind in a default fill — a label and a trailing counter —
  record only the first one's formatting. The second's styling is lost unless it
  is a component. Accepted: the alternative is a per-child styling record whose
  keys no consumer could resolve against an arbitrary fill.
- A slot authored with primitive default content purely as placeholder
  scaffolding, never meant to take a primitive fill, reads as accepting one. This
  is why Decision 2 gates the whole reading. The failure mode is a content set
  wider than intended, not a wrong one.
- The answer depends on default content a designer may change for unrelated
  reasons — deleting the placeholder label narrows what the slot accepts.

---

#### Option B: Default slot content is exactly one primitive, and nothing else

Fire only when the slot's default content is a single child and that child is a
primitive.

**Rejected because**: it excludes the shape the feature exists to describe. A
Button's default fill is routinely a glyph plus a label, and under this rule that
slot accepts nothing at all — neither the glyph nor the text — because the child
count is two. It would also make the reading brittle in the most ordinary way a
design changes: adding a leading icon to an existing text-only Button silently
removes `$text` from its slot, changing the component's public API with no
authored intent to do so. Option A's per-kind evaluation has no such cliff.

---

#### Option C: A library-wide name convention, `slots.composable.match`

Name which prop names accept primitives, beside ADR-099's `slots.default.match`.

**Rejected because**: composability is not a catalogue-wide property of a name.
`children` is composable everywhere, but `description` is composable on an Alert
and a plain string on a Tooltip, and `helpText` is composable on a Form Label and
nowhere else. A pattern matching `description` would be wrong for most components
using the word, and a pattern narrow enough to be right would have to enumerate
component/prop pairs — a per-component table in the wrong file, duplicating what
the design already says.

---

#### Option D: A Figma Dev Mode annotation

Add a third annotation key beside `role:<concept>` (ADR-067) and
`action:<concept>` (ADR-087), declaring a slot's accepted primitives.

**Rejected because**: it asks a designer to declare in an annotation a fact their
structural choice already states. A slot containing a text layer is already the
text-accepting case; the annotation can only agree with the shape (redundant) or
contradict it (a second source of truth with no precedence rule). Annotations earn
their place where structure cannot carry the fact — `role:` names a semantic that
geometry does not imply — which is not the situation here. They also require Dev
Mode, which not every workspace has.

---

### Decision 2 — Whether the reading is gated, and where that gate lives

#### Option A: `inferComposableSlots` on `PlatformConventions` *(Selected)*

Add `inferComposableSlots?: boolean` to `PlatformConventions`, authored in
`config/conventions/figma.yaml`, optional and defaulting to `false`, with a
required counterpart on `ResolvedPlatformConventions` — mirroring
`inferNumberProps` exactly.

**Pros**:
- `inferNumberProps` is the precedent and the direct analogue: it says "this
  platform authors numeric props as `TEXT` props whose values parse as numbers."
  This says "this platform authors composable content as a slot with primitives in
  it." Same kind of claim, same risk profile, same opt-in treatment.
- Correctly a `PlatformConventions` member under ADR-073 Decision 4: what it names
  — a slot primitive's default content — exists only in a platform's artifacts, so
  a reader holding only the spec cannot apply it.
- Default `false` keeps the change opt-in, so Decision 1's placeholder trade-off
  cannot surprise anyone who did not ask for the reading.
- The required-on-resolved shape means a consumer never decides what an absent
  value meant, matching `inferNumberProps` and `slotConstraints`.

**Cons / Trade-offs**:
- A third `infer*`-style member on an already-wide type. The alternative is less
  control over a reading that can be wrong.

---

#### Option B: No gate — always read primitive default content this way

**Rejected because**: it changes generated output for every existing library with
no declaration. Any slot whose default content happens to include a text layer —
placeholder scaffolding included — silently gains a wider content set on the next
generation. `inferNumberProps` exists as an opt-in for exactly this reason.

---

#### Option C: A `Settings` member

**Rejected because**: `Settings` holds run choices — a different value produces
different output from the same library. This is a fact *about the library*: either
this design system authors composable content as primitives-in-a-slot or it does
not, and the answer does not change run to run. ADR-071 drew that line.

---

### Decision 3 — How a `SlotProp` declares that it accepts a primitive

#### Option A: Reserved marker values inside `anyOf` *(Selected)*

`anyOf` continues to be the one list of what a slot permits. Primitive kinds join
it as reserved values distinguished by a sigil (Decision 5) and named from the
existing primitive vocabulary (Decision 4):

```yaml
# Takes a label string, or a Badge, or an Icon
anyOf: [$text, badge, icon]

# Text-only — a Badge whose children are a string
anyOf: [$text]

# A glyph and a label, or a composed Badge
anyOf: [$glyph, $text, badge]
```

**Pros**:
- One list answers one question. "What may fill this slot" has a single home, and
  a consumer enumerating permitted content reads one member instead of
  intersecting two. A parallel kinds member (Option B) makes
  `accepts: ['component']` with `anyOf: ['badge']` and
  `accepts: ['string','component']` with no `anyOf` both require a join to
  interpret.
- Nothing becomes ambiguous, because the sigil removes the collision that would
  otherwise exist. A reserved bare word like `string` could clash with a component
  named `String`; `$text` cannot clash with any component name, since the safe key
  grammar (ADR-066) does not admit a leading `$`.
- `anyOf`'s existing absence semantics survive untouched: absent still means "any
  component, no primitive", which is what every published spec means today.
  Nothing needs a new default.
- It extends by adding a vocabulary member, not a type member. A future `$image`
  is one more reserved value, with no change to `SlotProp`'s shape.
- The narrowing composes naturally. `[$text]` is text-only, `[$text, badge]` is
  text-or-Badge, and `[badge]` is Badge-only — three distinct statements that a
  boolean plus a list cannot all make.

**Cons / Trade-offs**:
- `anyOf`'s element type stays `string[]` while two populations of string live in
  it. The sigil carries the distinction by convention rather than by type. A
  schema `pattern` and a documented vocabulary are the enforcement, not the
  TypeScript type.
- A consumer that does not know about the markers will treat `$text` as a
  component name and look for a component called `$text`. It will find nothing and
  narrow to no permitted component, which is a visible failure rather than a
  silently wrong render.

---

#### Option B: A parallel `accepts` member of content kinds

Add `accepts?: SlotContentKind[]` (`'component' | 'string'`) beside `anyOf`, with
`accepts` stating kinds and `anyOf` continuing to narrow components. Absence of
`accepts` means `['component']`.

**Rejected because**: it splits one question across two members that must be read
together, and the join has non-obvious cases. `accepts: ['string']` with an
`anyOf` list is contradictory — kinds exclude components while the list names
some — and nothing in either member's own validity catches it. The sigil approach
makes that state unrepresentable rather than merely discouraged. The parallel
member also buys type-level checking of the *kind* vocabulary at the cost of
making the *content set* unreadable from one place, which is the wrong trade for a
contract whose main job is to say what may fill a slot. *(This option was selected
in an earlier revision of this ADR, on the grounds that `anyOf`'s component
namespace could not safely host a reserved word. Decision 5's sigil removes that
objection, and with it the reason to keep two members.)*

---

#### Option C: A dedicated boolean per primitive

`acceptsText?: boolean`, `acceptsGlyph?: boolean`.

**Rejected because**: each new primitive is another member on `SlotProp`, with no
single place to read what a slot takes, and the text-only slot stays
inexpressible — an absent `anyOf` already means "any component", so a boolean
cannot narrow components away while admitting a primitive.

---

### Decision 4 — What the primitive kinds are called

#### Option A: The existing primitive vocabulary — `text`, `glyph` *(Selected)*

Name the markers from `ElementType`, which already defines `text` and `glyph` for
these exact primitives and which `anatomy` items already carry.

**Selected because**: the schema already has one word for each of these things,
and a second word for the same thing is a drift the contract has to carry
forever. `string` would be that second word: a spec would say `type: text` in
anatomy and `$string` in `anyOf` for the same primitive, leaving every reader to
learn that they are one concept. Reusing `text` also makes the glyph case
automatic — `$glyph` needs no new decision, because the vocabulary already named
it. Constitution VI's naming governance is satisfied without appeal to a platform,
since this is an internal-consistency choice between two spellings the schema
already controls.

#### Option B: Platform-flavoured names — `string`, `icon`

Use the names code platforms use for the values rather than the nodes — `string`
because React types children as `string`, `icon` because that is the common
component name.

**Rejected because**: it describes the value's runtime type rather than the
primitive the spec models, and the spec's own vocabulary is the one a reader is
holding. `icon` is worse than `string`: ADR-077 already settled that an icon is a
*component* in a library's namespace while `glyph` is the node kind, so `$icon`
would collide conceptually with a real component name that `anyOf` can already
carry. Using `glyph` keeps the node/component boundary ADR-077 drew.

---

### Decision 5 — The sigil that distinguishes a marker from a component name

#### Option A: `$` — `$text`, `$glyph` *(Selected)*

**Selected because**: `$` is already this schema's mark for "reserved by the
contract, not supplied by the library." Every reserved *key* carries it — `$token`
and `$type` on a token reference, `$binding` on a prop binding, `$slotContent` on
a slot reference, `$image`, `$ref`, `$extensions`. A reader meeting `$text` in a
list of component names has the right instinct immediately, because the sigil
already means this everywhere else in the contract.

Extending it from keys to *values* is new, and that is the point worth stating
plainly: no schema value currently begins with `$`, so the namespace is empty and
claiming it collides with nothing. It is also safe permanently rather than
incidentally — the safe key grammar (ADR-066) does not admit a leading `$` in a
component key, so no library can ever author a component whose name shadows a
marker. The guarantee is structural, not a convention anyone has to remember.

| Alternative | Rejected because |
|-------------|------------------|
| **No sigil** — bare `text`, `glyph` | A component named `Text` or `Glyph` is entirely plausible, and under the safe key grammar its key could be exactly `text`. The collision is unresolvable: nothing in the array distinguishes the library's component from the reserved kind, and the failure is a silently wrong content set rather than an error. |
| **`@`** — `@text` | Carries no existing meaning in this schema, so it would be a second reserved sigil alongside `$` with no stated difference between them. `@` also reads as a scope or handle from npm and social convention, which is the wrong connotation for a node kind. |
| **`:`** — `:text` | Resembles a CSS pseudo-class, which invites the reading that this is a *state* or *selector* rather than a permitted content kind. It also collides with the `role:<concept>` and `action:<concept>` annotation grammar, where `:` separates a key from its value. |
| **`#`** — `#text` | Already means a JSON Pointer fragment throughout this schema — `#/props/children`, `#/definitions/SlotProp`. Reusing it for a content kind would make `#` mean two unrelated things depending on position. |
| **`*`** — `*text` | Reads as a wildcard or glob, suggesting a pattern match against component names rather than a fixed reserved value. |
| **`SCREAMING_CASE`** — `TEXT`, `GLYPH` | Distinguishes by casing alone, which is fragile: a library whose naming convention uppercases component keys would collide, and nothing structural prevents it. The constitution also scopes SCREAMING_CASE to `Styles` enum values, not to `Props`. |
| **Namespaced prefix** — `primitive:text` | Unambiguous and self-describing, but verbose at every use site for a two-member vocabulary, and it introduces a separator (`:`) that the annotation grammar already owns. The brevity of `$text` matters in a list read often. |
| **An object entry** — `{ primitive: 'text' }` | Makes `anyOf` heterogeneous — `(string \| object)[]` — which complicates every consumer that reads it as a list of names, in exchange for formality this vocabulary does not need. |

---

### Decision 6 — Where the primitive's per-variant formatting is recorded

The primitive sits inside the slot's default content, so it is a fill and cannot
be an anatomy element. The element that *is* in anatomy is the slot.

#### Option A: A `contentStyles` companion to `styles` on the slot element *(Selected)*

The slot element gains a second style block beside its own `styles`. Its `styles`
are the slot container's own — padding, alignment, sizing. Its `contentStyles` are
what a primitive fill is formatted with, captured per Decision 1's
first-per-variant rule. It is addressed through the mechanism that already varies
element values per variant, so per-variant formatting needs nothing new:

```yaml
# api.yaml
anatomy:
  - key: children
    type: slot

# variants.yaml
default:
  elements:
    children:
      styles:
        padding: { $token: "DS Space.200", $type: dimension }
        mainAxisAlignment: CENTER
      contentStyles:
        $text:
          typography: { $token: "DS Type.Label.Medium", $type: typography }
          textColor: { $token: "DS Color.Text.OnPrimary", $type: color }
        $glyph:
          fillColor: { $token: "DS Color.Icon.OnPrimary", $type: color }

variants:
  - configuration: { appearance: subtle, state: default }
    elements:
      children:
        contentStyles:
          $text:
            textColor: { $token: "DS Color.Text.Subtle", $type: color }
          $glyph:
            fillColor: { $token: "DS Color.Icon.Subtle", $type: color }
```

**Pros**:
- Keeps anatomy honest. The only anatomy element is the slot, which the component
  always has. Nothing in anatomy disappears when the slot takes a component.
- Per-variant formatting costs nothing new — `default.elements` and
  `variants[].elements` are already `Elements` keyed into the same record.
- Separates two genuinely separate subjects. A slot container's padding and its
  label's typography are different things, said structurally rather than by naming
  convention inside one block.
- Makes the discard rule expressible: a component fill is formatted by the
  component, so a consumer applies `styles` and ignores `contentStyles`. That rule
  is statable only because the two are separate members.

**Cons / Trade-offs**:
- A reader resolving a property must know which of two blocks it came from.
  Mitigated by the subjects being disjoint in practice.
- `contentStyles` is meaningful only on a slot element. Nothing in the schema
  prevents it elsewhere; the ADR documents rather than enforces that, consistent
  with ADR-099's treatment of the at-most-one-`defaultSlot` invariant.

---

#### Option B: Keep the primitive as its own anatomy element

Leave the slot's default primitive in `anatomy` and `elements`, and read its
per-variant `styles` as the fill formatting. No new member anywhere.

**Rejected because**: anatomy would list an element that any composed fill
deletes. A Button filled with a Badge has no label text node, yet anatomy would
declare one, and a transform reading anatomy to emit structure would emit it. The
slot's default content is a fill, and a fill is not part of the component's
anatomy. It also leaves the discard rule unstateable: with formatting on an
element that may or may not exist, there is nothing to point at to say "this
applies to primitive fills only".

---

#### Option C: Leave it in `slotContentExamples`

Keep the captured primitive as a `SlotContent` triplet under
`Component.slotContentExamples`, where slot fills already live.

**Rejected because**: it puts the formatting out of reach of the mechanism that
varies it. `Variant.elements` keys into the component's own `elements` record; a
`SlotContent` triplet has its own, and no variant can address inside one. The move
would force per-variant addressing into `slotContentExamples`, or a variant array
nested in `SlotContent`, to recover what Option A gets for free.

---

#### Option D: A per-variant style block on `SlotProp`

Record the formatting on the prop as an array mirroring `Variants`.

**Rejected because**: it makes `props` a second place variant-conditional values
live. Every consumer walking variants to resolve a style would have to walk props
too, and the two could disagree with no rule saying which wins. It also makes a
prop definition structurally dependent on the variant axis, where today `props`
declares the API surface and `variants` describes configurations of it.

---

### Decision 7 — The shape of `ContentStyles`

Decision 6 settled that a style block sits on the slot element. This settles what
is inside it. Decision 1 permits a slot to accept more than one primitive kind,
and the two kinds are formatted by disjoint property sets — so the shape has to
account for both.

#### Option A: Keyed by primitive, with a per-kind property set *(Selected)*

`ContentStyles` is a map from primitive marker to that primitive's formatting,
using the same `$text` / `$glyph` keys `anyOf` uses:

```yaml
ContentStyles:
  $text?: TextContentStyles
  $glyph?: GlyphContentStyles

TextContentStyles:
  textColor: ColorStyle
  typography: TokenReference | Typography   # composite — fontSize, fontFamily, lineHeight, … inside
  textAlignHorizontal: TextAlignHorizontal | null
  textAlignVertical: Style
  textOverflow: TextOverflow | null
  maxLines: Style

GlyphContentStyles:
  fillColor: ColorStyle
  width: Style
  height: Style
```

The two sets are not a text set and a subset of it. They overlap in nothing, and
each contains a member the other must not have — `width` and `height` are glyph
members precisely because they are *not* text members:

| | Text | Glyph |
|---|---|---|
| Colour | `textColor` | `fillColor` |
| Size | *(none — the run is measured by its container)* | `width`, `height` |
| Typography, alignment, overflow, line clamp | yes | no |

A glyph is **sized**, not laid out. Its box is the icon's own, set on the layer,
and a slot's layout does not derive it the way a text run's measure is derived
from the container. So a glyph fill recorded without its dimensions has lost them
outright, with nothing for a render to restore — where a text fill without a width
has lost nothing, because its width was never the fill's to state. That asymmetry
is the reason the per-kind sets must be separate types rather than one bag with
documented applicability.

**Pros**:
- It is the only shape that expresses a slot accepting both kinds, which Decision
  1 explicitly permits. A glyph-plus-label default fill records a `fillColor` and
  dimensions for the glyph and a typography for the text, unambiguously attributed.
- It is the only shape that can give the two kinds *different* members for the
  same concern. `width` is valid under `$glyph` and invalid under `$text`; a flat
  block cannot state that at all, because one property cannot be simultaneously
  permitted and forbidden.
- Each kind's property set is stated in its own type, so what is valid for a glyph
  is not a documented subset of a wider bag — it is the type. A `typography` under
  `$glyph` does not compile and does not validate.
- The keys are the same markers `anyOf` carries, so a reader who learns the
  vocabulary once applies it in both places, and a spec's `anyOf` and
  `contentStyles` keys can be checked against each other.
- It extends the same way everything else here does: `$image` would add one key
  and one small type, touching neither existing kind.
- Each property keeps the exact type its `Styles` counterpart has, so a value
  valid in `styles` is valid here, and token binding, prop binding and
  conditionals work wherever the underlying type is `Style`.

**Cons / Trade-offs**:
- One more level of nesting than a flat block, which is real verbosity in a spec
  read by humans.
- Three types rather than one, and the per-kind types must track `Styles` if a
  shared member's type ever changes.

---

#### Option B: A flat block whose valid members depend on the kind

One `ContentStyles` holding all nine properties — the six text ones plus
`fillColor`, `width` and `height` — with per-kind applicability documented rather
than typed.

**Rejected because**: it cannot attribute styles when a slot accepts both kinds,
which Decision 1 permits and real default content exhibits. A flat block carrying
`typography` and `fillColor` does not say that the typography is the label's and
the fill is the glyph's. Worse, `width` makes the shape outright
self-contradictory: it is a required member of the glyph set and must be *absent*
from the text set, and a flat block can only permit it for both or neither. The
sets being otherwise disjoint was a coincidence that made a flat block look
readable; `width` and `height` remove even that. Per-kind applicability as prose
also means a transform must hold a table the type could have held.

---

#### Option C: Flat, with the kind named in a sibling field

A flat block plus `contentKind: PrimitiveSlotContent` saying which primitive the
block describes.

**Rejected because**: it permits exactly one kind per element, so the
glyph-plus-label case needs two `contentStyles` blocks on one slot element and
there is only one member to hold them. It also re-derives from a field what the
keys of Option A give structurally.

---

### Decision 8 — What the content-style block is called

#### Option A: `contentStyles` *(Selected)*

**Selected because**: it pairs with `Element.content`, the member that already
names what a content-bearing element carries, so a reader meets it with the right
referent in hand. It is kind-neutral, which is now load-bearing rather than
speculative: the block holds `$text` and `$glyph` together, so a name scoped to
either would be wrong on the face of it.

#### Option B: `childStyles`

**Rejected because**: it collides with `Element.children`, a list of element keys.
A reader would reasonably take it to mean "styles for the elements listed in
`children`" — a different, plausible feature — and the collision sits in the
public contract. A slot's fill is not among the element's `children` either.

#### Option C: `nestedTextStyles`

**Rejected because**: it names one kind, and the block holds two.

#### Option D: `slottedStyles`

**Rejected because**: it borrows `::slotted()`, one platform's syntax, where CSS
inheritance and SwiftUI's environment propagation already agree on a broader
model. It would also read as permanently scoped to slots.

---

## Decision

### `PlatformConventions` gains `inferComposableSlots`

`PlatformConventions` (`types/Conventions.ts`) gains `inferComposableSlots?:
boolean`, optional and defaulting to `false`, with a required counterpart on
`ResolvedPlatformConventions` — mirroring `inferNumberProps` (Decision 2).
Authored in `config/conventions/figma.yaml`.

When true, a slot's default content is inspected per Decision 1. When false or
absent, slots are emitted exactly as they are today.

`DEFAULT_CONVENTIONS` gains nothing: it carries no members at all, so the `false`
default is supplied by whoever resolves a platform, exactly as `inferNumberProps`'
is.

### `anyOf` carries reserved primitive markers

`SlotProp.anyOf` keeps its type, `string[]`, and its absence semantics — absent
still means "any component, no primitive" (Decision 3). It gains a reserved
vocabulary of `$`-prefixed values (Decisions 4 and 5), exported as a documented
union:

```yaml
# New exported union
PrimitiveSlotContent: '$text' | '$glyph'
```

| Marker | Admits |
|--------|--------|
| `$text` | A text primitive — a plain string fill |
| `$glyph` | A glyph primitive — an icon fill |

No `SlotProp` member is added. A permitted content set is one list:

```yaml
props:
  children:
    type: slot
    defaultSlot: true          # ADR-099, orthogonal
    anyOf: [$glyph, $text, badge]
  description:
    type: slot
    anyOf: [$text, link]       # accepts a primitive, and is not the default slot
```

A library can never author a component whose key shadows a marker: the safe key
grammar (ADR-066) does not admit a leading `$`.

### `Element` gains `contentStyles`, keyed by primitive

`Element` (`types/Element.ts`) gains `contentStyles?: ContentStyles` (Decision 6,
shaped per Decision 7, named per Decision 8). On a slot element it carries the
formatting applied to primitive content filling the slot, keyed by the same
markers `anyOf` uses.

```yaml
# After (Element, excerpt)
Element:
  children?: Children
  styles?: Styles
  contentStyles?: ContentStyles   # new — optional, MINOR
  content?: string | PropBinding
```

Three new types in `types/Styles.ts`:

```yaml
ContentStyles:
  $text?: TextContentStyles
  $glyph?: GlyphContentStyles

TextContentStyles:
  textColor: ColorStyle
  typography: TokenReference | Typography
  textAlignHorizontal: TextAlignHorizontal | null
  textAlignVertical: Style
  textOverflow: TextOverflow | null
  maxLines: Style

GlyphContentStyles:
  fillColor: ColorStyle
  width: Style
  height: Style
```

Each property is typed identically to its `Styles` counterpart, so a value valid
in `styles` is valid here — `width` and `height` are `Style`, so they token-bind,
prop-bind and take conditionals exactly as `Styles.width` does. `typography`
carries the composite, so its own members travel inside it. Both maps are closed:
nothing else may appear in either.

`$glyph` supports `fillColor`, `width` and `height`. The dimensions are the
fill's because a glyph is **sized** rather than laid out: its box is the icon's
own, set on the layer, and the slot's layout does not derive it the way a text
run's measure is derived from its container. A glyph fill recorded without its
dimensions has lost them, and a render has nothing to restore. No text member
carries a dimension for the mirror-image reason — a text run's width was never
the fill's to state.

Layout and surface stay out of both maps. `padding`, `minWidth`, `backgroundColor`
and the rest belong to the element, not to what fills it.

Per-variant formatting uses the existing mechanism, with no new addressing:
`default.elements[key].contentStyles` carries the default, and
`variants[].elements[key].contentStyles` overrides it per configuration.

**`contentStyles` applies to a primitive fill only.** A component fill is
formatted by the component it instantiates; a consumer rendering one applies the
element's `styles` and discards its `contentStyles`.

**The slot's default primitives are not anatomy elements.** The anatomy element is
the slot. The primitives inside it are its default content, their formatting is
what `contentStyles` records, and they do not also persist as entries in `anatomy`
or `elements`.

That exclusion scopes to the **host component's** `anatomy` and `elements` only.
The slot's recorded default content itself — the structure a generator captures
for the fill, primitives included — is untouched by this ADR: the primitives stay
represented there unchanged, and that record is what carries a primitive's actual
content (its characters, its glyph identity) for reproduction. Deriving `anyOf`
markers and `contentStyles` is additive to storing slot default content, never a
replacement for it.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Added `PrimitiveSlotContent` exported union (`'$text' \| '$glyph'`) | MINOR |
| `Props.ts` | Doc-only: `anyOf` description states that `$`-prefixed reserved values name primitive kinds alongside component names | PATCH |
| `Styles.ts` | Added `TextContentStyles`, `GlyphContentStyles`, and `ContentStyles` exported types | MINOR |
| `Element.ts` | Added `contentStyles?: ContentStyles` to `Element` | MINOR |
| `Conventions.ts` | Added `inferComposableSlots?: boolean` to `PlatformConventions` | MINOR |
| `Conventions.ts` | Added required `inferComposableSlots: boolean` to `ResolvedPlatformConventions` | MINOR |
| `index.ts` | Exported `PrimitiveSlotContent`, `ContentStyles`, `TextContentStyles`, `GlyphContentStyles` | MINOR |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added `TextContentStyles`, `GlyphContentStyles` and `ContentStyles` definitions, each `additionalProperties: false`, properties `$ref`-ing the value types their `Styles` counterparts use | MINOR |
| `component.schema.json` | Added a `ContentStyles` stub `$ref`-ing `styles.schema.json#/definitions/ContentStyles`, mirroring how `Styles` is referenced | MINOR |
| `component.schema.json` | Added `contentStyles` property to `Element`, `$ref`-ing `ContentStyles` | MINOR |
| `component.schema.json` | Added `PrimitiveSlotContent` definition (string enum: `$text`, `$glyph`) | MINOR |
| `component.schema.json` | Doc-only: `SlotProp.anyOf` description states the reserved marker vocabulary | PATCH |
| `conventions.schema.json` | Added `inferComposableSlots` boolean (`default: false`) to `PlatformConventions` | MINOR |

No `ResolvedPlatformConventions` counterpart is added to `schema/`, because the
schema defines no `Resolved*` shape at all — it validates authored documents, and
the resolved shapes exist only in `types/`. A pre-existing, justified asymmetry
this ADR inherits.

`anyOf` itself gets no schema type change. Its items stay `{ "type": "string" }`,
because the array holds two populations — reserved markers and library component
names — and constraining items to an enum would reject every component name. The
marker vocabulary is enforced by the `PrimitiveSlotContent` definition where it is
referenced, and documented on `anyOf`.

### Notes

- Each content-styles map is closed. A capture records whichever members it found;
  anything else is invalid rather than ignored, so a generator cannot record a
  container's `padding` as content formatting.
- `typography` is listed once, as the composite. Its members — `fontSize`,
  `fontFamily`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration` and
  the rest — are not enumerated, because `Typography` already holds them.
- A slot's `anyOf` markers and its element's `contentStyles` keys should agree, but
  the schema does not enforce the correspondence — they live on different objects
  (a prop and an element), which JSON Schema cannot relate. An
  authoring/generator contract, consistent with ADR-099's handling of the
  at-most-one-`defaultSlot` invariant.
- **The fill value itself is not re-decided here.** A primitive filling a slot is a
  slot fill like any other, recorded where slot fills already are —
  `SlotProp.default` for the authoring default, `Element.propConfigurations` for an
  instance's fill. This ADR changes what a slot *accepts* and how a primitive fill
  is *formatted*, not where a fill is written.
- No `$image` marker is added. ADR-063 image support makes one plausible, but no
  observed slot carries image default content, so it would be speculative.
  `PrimitiveSlotContent` and `ContentStyles` are where it lands additively.
- `accepts` and `SlotContentKind` appeared in an earlier revision of this ADR and
  are not part of it. They were never published — this ADR and ADR-099 both land in
  the same unreleased `0.35.0` — so nothing depends on them.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `PrimitiveSlotContent` (type, `types/Props.ts`) maps to
  `#/definitions/PrimitiveSlotContent` (schema, `component.schema.json`) — a string
  literal union against a string enum with the same two members.
- **Parity check**: `ContentStyles`, `TextContentStyles` and `GlyphContentStyles`
  (types, `types/Styles.ts`) map to the same three definitions in
  `styles.schema.json`, each with `additionalProperties: false` enforcing the closed
  set the `Partial` expresses, and each property `$ref`-ing the value-type
  definition its `Styles` counterpart uses.
- **Parity check**: `Element.contentStyles` maps to
  `#/definitions/Element/properties/contentStyles`, which `$ref`s `ContentStyles`
  via the stub — optional on both sides, absent from `required[]`.
- **Parity check**: `PlatformConventions.inferComposableSlots` (optional, defaults
  to false) maps to the matching property with `default: false`.
- **Justified asymmetry — resolved shapes**: `ResolvedPlatformConventions.inferComposableSlots`
  is required in `types/` and has no schema counterpart, because `schema/` defines
  no `Resolved*` shape. `inferNumberProps` and `slotConstraints` sit the same way.
- **Justified asymmetry — `anyOf` items**: the type stays `string[]` and the schema
  items stay `{"type": "string"}`, because the array holds reserved markers *and*
  arbitrary component names. Neither artifact can narrow it without rejecting valid
  component names, so the marker vocabulary is carried by a separate definition and
  by documentation on both sides. This is the trade-off Decision 3 accepts.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Reads `inferComposableSlots` and, when set, inspects each slot's default content per variant: every top-level primitive kind present is recorded as a `$`-marker in `anyOf`, and the first top-level primitive of each kind supplies that kind's entry in the slot element's `contentStyles`. Those primitives are no longer emitted as anatomy elements. | Engine work to apply the reading and the capture relocation this ADR decides. |
| `figma-from-specs` | Reads `anyOf` markers to decide whether a fill is primitive or component content, and on a primitive fill rebuilds the layer inside the slot from the matching `contentStyles` entry for the variant being rendered. Applies `styles` but not `contentStyles` to a component fill. | Engine work to render a primitive-accepting slot in both fill modes. |
| `specs-cli` | Loads and validates `inferComposableSlots` from `config/conventions/figma.yaml`, and documents it in the `init` template. The `react` and `webcomponents` transforms emit a primitive-accepting slot as content rather than a scalar prop — `children: ReactNode`, or a named `<slot>` — and emit `contentStyles` as the rule formatting slotted content, per primitive, applied to primitive fills only. | Config loader, template, and transform work. |
| `specs-plugin-2` | None at this ADR's scope. | Recompiles against the new optional members. |

Per-package adoption analysis: `specs-local-workspace/adr/102/plan.md` (maintained outside this repo).

---

## Semver Decision

**Target version**: `0.35.0` — the version of `@directededges/specs-schema` on the
active release branch (`release/next`) this ADR merges into.

**Change class**: `MINOR`.

**Justification**: The additions are two optional members (`contentStyles` on
`Element`, `inferComposableSlots` on `PlatformConventions`) and four new exported
types (`PrimitiveSlotContent`, `ContentStyles`, `TextContentStyles`,
`GlyphContentStyles`), with no removal, rename, or narrowing of any existing field
— additive-only per Constitution Additional Constraints & Standards. `anyOf` keeps
its type and its absence semantics; it gains permitted values, which widens what
validates rather than narrowing it.

The required `inferComposableSlots` on `ResolvedPlatformConventions` is a new
required member on a resolved shape, MAJOR-shaped in isolation. It is MINOR here on
the same grounds `inferNumberProps` and `slotConstraints` were: that shape is
produced by resolution, never authored, and resolution supplies the default — so no
authored document becomes invalid and no consumer loses a field it had.

That a slot's default primitives stop being emitted as anatomy elements changes
generated output, but only for a library that sets `inferComposableSlots: true`. The
opt-in default of `false` is what keeps this MINOR.

`accepts` and `SlotContentKind`, from an earlier revision of this ADR, are removed
rather than deprecated. They were never published — this ADR lands in the same
unreleased `0.35.0` that introduced them — so no released version carries them.

---

## Consequences

- A slot can state that it accepts primitive content, so a Button, Badge, or Alert
  label is describable as what it is on every code platform — content that may be a
  primitive or a component — rather than as one or the other.
- A slot can accept a glyph *and* a text primitive *and* a component, which is what
  a real default fill often holds and what no previous shape could express.
- The permitted content set stays one list. `anyOf: [$glyph, $text, badge]` is read
  in one place, with no second member to join against.
- A marker can never be confused with a component name. The safe key grammar
  forbids a leading `$` in a component key, so the guarantee is structural.
- The primitive vocabulary is the one the schema already had. `$text` and `$glyph`
  name the same things `ElementType` and `anatomy` items name, so there is no second
  spelling to learn.
- Detection matches real default content. A glyph-plus-label fill makes the slot
  accept both, where an exactly-one-child rule would have made it accept neither.
- Formatting is attributed per primitive. `contentStyles.$text` and
  `contentStyles.$glyph` each carry their own closed property set: text takes
  colour, typography, alignment, overflow and line clamp; a glyph takes
  `fillColor`, `width` and `height`.
- The two sets overlap in nothing, and each holds a member the other must not. A
  glyph carries its own dimensions because it is sized rather than laid out; a text
  run carries none, because its measure was never the fill's to state. Only the
  keyed shape can say that — a flat block would have to permit `width` for both
  kinds or neither.
- Where a default fill holds two primitives of one kind, the first supplies that
  kind's formatting. The second's styling is not recorded unless it is a component.
- A library opts in per platform via `inferComposableSlots`, defaulting to `false`.
  A library that declares nothing gets byte-identical output.
- A library that opts in and has placeholder-only primitive slots will see those
  slots gain markers. The failure mode is a content set wider than intended, not a
  wrong one; the remedy is authoring the slot without the placeholder, or leaving the
  reading off.
- Anatomy stays honest. A composable slot contributes one anatomy element — the slot
  — and nothing in anatomy disappears when the slot takes a component.
- Per-variant formatting rides the mechanism every other per-variant element value
  already uses. Nothing new to walk.
- A component fill does not inherit the primitive formatting, and the separation from
  `styles` is what makes discarding it expressible.
- Two style blocks now exist on `Element`, of different types. A reader resolving a
  property must know which it came from.
- A spec's `anyOf` markers and its `contentStyles` keys should agree; the schema
  cannot relate a prop to an element, so that correspondence is an
  authoring/generator contract.
- **Follow-up implementation work in `specs-from-figma`**: read
  `inferComposableSlots`, inspect slot default content per variant, record markers in
  `anyOf`, capture first-per-kind formatting into `contentStyles`, and stop emitting
  those primitives as anatomy elements.
- **Follow-up implementation work in `figma-from-specs`**: render a
  primitive-accepting slot in both fill modes, rebuilding each primitive from its
  `contentStyles` entry and ignoring `contentStyles` on a component fill.
- **Follow-up implementation work in `specs-cli`**: load and template the new
  convention, and emit the slot as content in the React and Web Components
  transforms.
- All three are engine work against a rule this ADR decides. None is a deferred
  design decision.
