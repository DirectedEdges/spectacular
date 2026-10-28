---
title: "Appendix — Style mapping reference"
description: "Every spec style key, and the CSS declaration it produces."
---

What each spec style key becomes in the emitted stylesheet. An appendix to
[Styles](/code/styles/): that page explains the sheet's shape, this one is the
per-key table.

Read it when the CSS is not what you expected and you want to know whether the
mapping or the spec is responsible.

:::note[One module per section]
Each section below names the single transformer module that owns it. When a
mapping changes there is one file to check this page against. An earlier version
of this reference lived beside the code and drifted silently for months —
documenting a gradient-stroke mechanism, a `FILL` translation and a `text-align`
vocabulary the transformer had all stopped using.
:::

## Element class naming

Each key in `default.elements` becomes a CSS class. Component and element keys
convert from camelCase to kebab-case.

| Element key | CSS selector |
|---|---|
| `root` | `.{component}` |
| any other | `.{component}__{element-in-kebab}` |

`dsButton` → `.ds-button`; its `startVisualAndLabel` element →
`.ds-button__start-visual-and-label`.

For the Web Components build the root is the custom element itself, so root rules
target `:host` and qualifiers go *inside* the functional form:
`:host([data-size="l"]:hover)`. Element rules are identical in both builds.

## Variant selectors

*(`sheet/variantSelectors.ts`)*

A variant's `configuration` becomes qualifiers on the root selector. **Which kind
of qualifier depends on whether the states convention classifies the prop.**

| Configuration | Emits | Why |
|---|---|---|
| A prop the `states` convention classifies | the concept's real CSS selector — `:hover`, `:disabled`, `[aria-selected="true"]` | the state is carried by the platform or by ARIA, not by a data attribute |
| Any other enum prop | `[data-prop="value"]` | |
| Any other prop, `true` | `[data-prop]` | scaffolds emit booleans as presence |
| Any other prop, `false` | `:not([data-prop])` | the attribute is *absent* when false, so `[data-prop="false"]` would match nothing |

```
configuration: { appearance: outline, state: hover }
  → .ds-button[data-appearance="outline"]:hover
```

Four behaviours follow from that split, and each one is a case where the obvious
output would be wrong:

**A concept with several selectors emits several rules.** `disabled` is
`:disabled, [aria-disabled="true"]` — either may carry the state — so the variant
produces one rule per part, and two classified props produce the cartesian
product of their parts.

**A classified boolean set to `false` negates its concept.** It has no concept of
its own, so without this the variant would be read as the resting state and emit
nothing — an unselected row, and every hover pairing with it, would have no rule.
Negating a multi-part concept is an AND of nots
(`:not(:checked):not([aria-checked="true"])`), never a cartesian expansion.

**`:hover` and `:active` are guarded against firing while disabled.** A disabled
control still receives pointer events, so the hover rule would otherwise paint
over the disabled one. Applied whenever the convention names a `disabled`
concept.

**A concept a nested element's role announces is routed to the data attribute
instead.** The root no longer carries the ARIA state — the nested control does —
so the root's rule keys off the variant prop. A prop keeps its classification
when another concept still uses it.

A classified value that no concept names is **skipped with a warning**, naming
the prop and value. Skipping is correct for the prop's resting value, since the
base block already covers it; for anything else the declared styling would be
dropped silently, which is what the warning exists to prevent.

Variants emit in **schema order** — `variants.yaml` puts single-prop variants
before compound ones, which is the cascade the variant-layering algorithm
assumes. Child element overrides use a descendant selector:
`.ds-button[data-appearance="outline"] .ds-button__label`.

## Token references

*(`values/tokens.ts`)*

A reference (`{ $token: "Color/Primary", $type: "color" }`) becomes a custom
property derived from the token path:

```
Color/Primary                 → var(--color-primary)
Constants/Spacing/5x          → var(--constants-spacing-5x)
Typography/font__300__medium  → var(--typography-font--300--medium)
```

Resolution is format-aware. `FIGMA_SYNTAX_WEB` uses a `--`-prefixed string as the
variable name directly; `CUSTOM` prefers an explicit `$cssVar`; every other format
derives the name from the path. See [Token format](/settings/tokens/).

Characters invalid in a CSS dashed-ident — parentheses, `%`, `&` — are dropped,
and each drop is counted in a warning summary at the end of the run.

**A variable Figma could not resolve at capture time is withheld, not emitted.**
Its sentinel name derives a perfectly ordinary custom property that nothing
defines, so the reference would be dead on arrival — and worse than nothing where
it lands on a size, which collapses the element to zero. The ladder is: the
captured raw value the spec carries, then `unset` for a single-property
declaration, then no declaration at all. A value composed into a shorthand keeps
returning nothing, so the composite falls back to its own zero rather than
embedding a keyword where a length belongs.

## Fills

*(`style/fills.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `backgroundColor` | `background` | `null` → `transparent` |
| `textColor` | `color` | `null` → `transparent` |
| `fillColor` | `background-color`, `fill`, or `background` | depends on the element's anatomy type — see below |

`fillColor`'s target is decided by the element type and nothing else:

- **glyph / vector** → `background-color`, which shows through the mask the
  element paints with
- **untyped** → `fill`, the legacy SVG paint
- **anything else** → `background`

Colour values resolve as: token reference → `var(--…)`, hex string → as-is,
colour object → its `hex`, else `currentColor`.

A gradient maps to a CSS gradient function, with stop colours run through the
same rules so token stops become `var(--…)`:

| Gradient | CSS |
|---|---|
| `LINEAR` | `linear-gradient(Ndeg, …)` — the spec angle is already CSS convention |
| `RADIAL` | `radial-gradient(at X% Y%, …)` |
| `ANGULAR` | `conic-gradient(from 0deg at X% Y%, …)` — both start at 12 o'clock |

An angular gradient carries no angle (ADR-003); the rotation it appears at is the
node's, applied as a transform. A gradient `textColor` paints as a background
clipped to the glyphs (`background-clip: text; color: transparent`). A gradient
`fillColor` is skipped for untyped elements, which have no inline-gradient
equivalent.

## Opacity

*(`style/opacity.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `opacity` | `opacity` | a plain number passes through; **a token reference becomes `calc(var(--x) * 1%)`** |

Opacity variables are authored on a percentage scale (36, not 0.36) because that
is what reads naturally across platforms. Emitting the variable bare would give
`opacity: 36`, which clamps to 1 and silently discards the state.

## Border

*(`style/border.ts`)*

Every stroke alignment emits an **outline**, not a border. A Figma stroke costs no
layout space at any alignment, and a CSS border does for a hugging element — a
badge came out 2px taller than the design for exactly that reason. An outline
affects no layout and follows `border-radius`.

| Spec key | CSS | Notes |
|---|---|---|
| `strokes` | `outline-color` + `outline-style: solid` | `null` clears both mechanisms (`border-color: transparent`, `outline-style: none`), since a variant dropping its stroke must cancel what the default drew |
| `strokes` (gradient) | *nothing on the element* | painted as a `::before` ring instead — see below |
| `strokeWeight` | `outline-width` | plus a negative `outline-offset` for inside strokes. A `Sides` object keeps the **border** mapping, as an outline has one width. `null` zeroes both |
| `strokeAlign` | `outline-offset` | `INSIDE` (and an unrecorded alignment, Figma's default) is pulled back over its own edge; `OUTSIDE` and `CENTER` sit where the outline falls |

**A gradient stroke paints as a `::before` ring**, and the element itself declares
no stroke at all. No outline can take a gradient; `border-image` is the only
border property that can and it ignores `border-radius`, so a rounded element
would come out square; and painting into the element's own `background` destroys
whatever fill it declares. The ring covers the host, inherits its radius, and
masks out its middle. Its thickness is the pseudo-element's padding.

An element that mixes gradient and solid strokes across variants emits
`border-image: none` alongside the solid stroke, so the later declaration wins.

**A stroke paint with no weight emits `border-width: 0`** in the element's default
block. Figma reports `strokeWeight: 0` for these and the spec carries the paint
without the zero, so `border-style` alone would fall back to CSS's initial
`medium` — about 3px of border the design does not have.

## Corner radius

*(`style/cornerRadius.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `cornerRadius` | `border-radius` | scalar or token → one value; a `Corners` object (`topStart topEnd bottomEnd bottomStart`) → four-value shorthand |

## Effects

*(`style/effects.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `effects` (token reference) | `box-shadow` / `filter` / `backdrop-filter` | names up to three role variables — `<name>-shadows`, `<name>-layer-blur`, `<name>-background-blur` — each holding its property's complete value. All three emit with a `none` fallback, so only the roles the consumer defines take effect |
| `effects.shadows` | `box-shadow` | comma-joined `[inset] x y blur spread color`; `visible: false` entries dropped; an all-invisible list emits `box-shadow: none` |
| `effects.layerBlur` | `filter: blur()` | `visible: false` → `filter: none` |
| `effects.backgroundBlur` | `backdrop-filter: blur()` | `visible: false` → `backdrop-filter: none` |
| `effects: null` | all three reset to `none` | a variant removing the lower layer's effects |

Where one `effects` value fans out into several properties, each declaration
carries an `/* effects */` trace comment tying it back to the single spec value.

## Size

*(`style/size.ts`)*

| Spec key | CSS |
|---|---|
| `width`, `height` | `width`, `height` |
| `minWidth`, `minHeight` | `min-width`, `min-height` |
| `maxWidth`, `maxHeight` | `max-width`, `max-height` |

Zero values are omitted. **`height` is skipped entirely when the element states an
`aspectRatio`** — the two are redundant, and only the ratio survives composition:
a fixed height beats `aspect-ratio` in the cascade, so a component placed in a
narrower box would keep its full authored height. A style set with
`aspectRatio: null` is stating it has no ratio, so its height is emitted.

## Padding

*(`style/padding.ts`, `values/sides.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `padding` | `padding` | scalar or token → one value; `null` → `padding: 0` |
| `padding` (`Sides`) | **logical** per-side properties | `padding-block-start`, `padding-inline-end`, `padding-block-end`, `padding-inline-start` |

When all four sides are known they collapse to the two-value logical pair —
`padding-block` and `padding-inline` — not to a four-value `padding`, which reads
as top/right/bottom/left and would put `start` on the left in every writing
direction.

The same table drives `border-width`, where the side splits the property name
(`border-inline-start-width`) rather than suffixing it. A property with no entry
falls back to physical names.

## Typography

*(`style/typography.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `typography` (token reference) | `font` | plus `letter-spacing: var(--<name>-letter-spacing, normal)` — the `font` shorthand cannot carry tracking and resets it, so the companion variable is referenced explicitly |
| `typography.fontSize` | `font-size` | px when a number |
| `typography.fontFamily` | `font-family` | quoted when it contains a space |
| `typography.fontStyle` | `font-weight` + `font-style` | Figma combines weight and slant in one name ("SemiBold Italic"), split here |
| `typography.lineHeight` | `line-height` | **a number gets `px`** — unitless line-height in CSS is a multiplier; a string passes through |
| `typography.letterSpacing` | `letter-spacing` | px when a number |
| `typography.textCase` | `text-transform` | `UPPER`→uppercase, `LOWER`→lowercase, `TITLE`→capitalize, `ORIGINAL`→none |
| `typography.textDecoration` | `text-decoration` | `UNDERLINE`→underline, `STRIKETHROUGH`→line-through, `NONE`→none |

A sub-property is a literal value unless it is an explicit token reference — a
plain string like `"Inter"` or `"120%"` is data, not a token name.

## Text alignment

*(`style/textAlign.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `textAlignHorizontal` | `text-align` | `START`→start, `CENTER`→center, `END`→end, `JUSTIFY`→justify |

Logical directions only (ADR-064). The transform speaks the current schema; Figma's
`LEFT`/`RIGHT`/`JUSTIFIED` are remapped before they reach it.

## Text truncation

*(`style/truncation.ts`)*

Figma truncates by line count, optionally with an ellipsis. CSS has two
mechanisms and they do not overlap.

| Spec | CSS |
|---|---|
| `maxLines: 1` | `white-space: nowrap; overflow: hidden` (+ `text-overflow: ellipsis` when `textOverflow: ELLIPSIS`) |
| `maxLines: n > 1` | `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: n; line-clamp: n; overflow: hidden` |
| `textOverflow: ELLIPSIS` with no line count | treated as single-line truncation |

Both set `overflow: hidden`, which `clipsContent` may have stated already — a
duplicate is harmless, and omitting it would leave the truncation inert.

## Aspect ratio

*(`style/aspectRatio.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `aspectRatio` | `aspect-ratio: x / y` | `null` emits nothing, and means the element's height is authored — see [Size](#size) |

## Visibility and overflow

*(`style/visibility.ts`, `style/overflow.ts`)*

| Spec | CSS |
|---|---|
| `visible: false` | `display: none` — only when explicitly false |
| `clipsContent: true` | `overflow: hidden` |
| `clipsContent: false` | `overflow: visible` |

## Transform

*(`style/transform.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `rotation` | `transform: rotate(…)` | zero omitted — a transform creates a containing block for absolute descendants, so emitting a no-op one changes layout |

## Raw CSS

*(`style/rawCss.ts`)*

`_rawCss` holds declarations a [rule pre-pass](/settings/) injected into the
structured data before any mapping ran. Emitted verbatim, and last among the
style keys, so a rule can override what the mapping derived.

## Position and offsets

*(`style/position.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `position: ABSOLUTE` | `position: absolute` | |
| `position: AUTO` | **`position: static`** | the element re-enters auto-layout flow; static is what undoes a prior absolute rule |
| `top` | `inset-block-start` | |
| `bottom` | `inset-block-end` | |
| `start` | `inset-inline-start` | left in LTR |
| `end` | `inset-inline-end` | right in LTR |

With no explicit `position`, coordinates can still imply absolute placement.
Outside auto-layout any coordinates do. Inside it, children are flow-placed, so
coordinates only count when they are meaningful — non-zero, or anchored on
opposing sides (`top`+`bottom`, `start`+`end`). Zero-only single anchors are
canvas noise.

## Layout

*(`style/layoutToCSS.ts`)*

| Spec key | CSS | Notes |
|---|---|---|
| `layoutMode: HORIZONTAL` | `display: flex; flex-direction: row` | suppressed when `visible: false`, which emits `display: none` in the same rule |
| `layoutMode: VERTICAL` | `display: flex; flex-direction: column` | as above |
| `layoutMode: NONE` or `null` | **`display: block`** | |
| `mainAxisAlignment` | `justify-content` | `START`→flex-start, `END`→flex-end, `CENTER`→center, `SPACE_BETWEEN`→space-between |
| `crossAxisAlignment` | `align-items` | `START`→flex-start, `END`→flex-end, `CENTER`→center, `STRETCH`→stretch, `BASELINE`→baseline |
| `wrap` | `flex-wrap` | `true`→wrap, **`false`→nowrap** |
| `wrapAlignment` | `align-content` | `START`→flex-start, `SPACE_BETWEEN`→space-between. Emitted whenever present |
| `itemSpacing` | `gap` | number → px; token → `var(--…)`; `{ horizontal, vertical }` → `gap: <vertical> <horizontal>`, or a single `row-gap`/`column-gap` when only one side is known |

**A negative `itemSpacing` emits no `gap`.** Figma expresses overlapping children
that way and `gap` cannot be negative; the overlap becomes a negative margin on
every child after the first (see [Additional rules](#additional-rules)).

### Sizing within the parent

`FILL` depends on the **parent's** flex direction, which the mapping is told:

| Spec | Parent | CSS |
|---|---|---|
| `layoutSizingHorizontal: FILL` | `HORIZONTAL` | `flex: 1 0 0` |
| `layoutSizingHorizontal: FILL` | anything else | `width: 100%` |
| `layoutSizingVertical: FILL` | `VERTICAL` | `flex: 1 0 0` |
| `layoutSizingVertical: FILL` | anything else | `height: 100%` |
| `layoutSizingHorizontal: HUG` | — | `width: fit-content` |
| `layoutSizingVertical: HUG` | — | `height: fit-content` |
| `FIXED` | — | nothing; the explicit `width`/`height` carries it |

Cross-axis `FILL` is deliberately **not** `align-self: stretch`. Stretch means
"ignore the parent's alignment, start at the edge and fill", so the moment a
min/max constraint stops the child actually filling, the leftover space lands on
one side and the parent's alignment has already been discarded — a dialog's
max-width'd body sat against its padding edge where the design centres it. The two
are identical while the child does fill, which is most of the time and why it went
unseen.

## Additional rules

Some spec facts produce whole rules rather than declarations on the element.

| Spec fact | Rule | Module |
|---|---|---|
| A negative `itemSpacing` | `> * + *` with a negative margin on the parent's main axis | `sheet/elementRules.ts` |
| A gradient `strokes` | a `::before` ring, masked to its padding | `sheet/elementRules.ts` |
| An `instance` element with a stated size | `> *` at `width`/`height: 100%`, so the composed child fills the slot rather than painting at its own master's size | `sheet/elementRules.ts` |
| A `slot` element | `:empty` and `[data-empty]` → `display: none`, so an unfilled slot stops taking the parent's gap | `sheet/defaultBlock.ts` |
| An element whose role emits a native control | a reset of the user-agent styling that tag brings | `sheet/roleResets.ts` |
| A `checkbox` or `switch` role | the hidden input, the click-target label, and a focus ring re-drawn on the visible proxy | `sheet/roleResets.ts` |
| The `states` convention naming an `active` or `pressed` concept | `cursor: pointer` | `sheet/cursors.ts` |
| The `states` convention naming a `disabled` concept | `cursor: not-allowed` | `sheet/cursors.ts` |

Everything generated sits in one `@layer specs` cascade layer, so an unlayered
consumer rule beats it regardless of specificity. The root and its descendants
also get `box-sizing: border-box`: a Figma frame's width includes its padding and
CSS's default excludes it, so without this every element with both a fixed
dimension and padding renders larger than the spec by exactly its padding.

## Skipped keys

| Spec key | Reason |
|---|---|
| `locked` | Figma layer lock — no CSS equivalent |
| `cornerSmoothing` | Figma's squircle algorithm — no CSS equivalent |
| `primaryAxisSizingMode` | Figma internal — no CSS equivalent |
| `textAlignVertical` | the parent's `align-items` carries it in most cases |
| `centerHorizontalOffset`, `centerVerticalOffset` | no CSS equivalent for CENTER-constrained Figma positioning |
| `DIAMOND` gradients | excluded at the schema level — no native equivalent on any target platform |

## See Also

- [Styles](/code/styles/) — the sheet's shape, and what a role adds to it
- [Token format](/settings/tokens/) — which naming format the references use
- [States](/settings/states/) — the convention that decides which props become real CSS selectors
