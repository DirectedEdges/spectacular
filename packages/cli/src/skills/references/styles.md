<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: authoring styles

Load when authoring `variants.yaml`. Assumes `specs-cli.authoring.primer` is read.

Styles live per element, in `variants.yaml`: fully on every element under `default.elements.<el>.styles`, and as deltas under `variants[].elements.<el>.styles`. The schema source of truth is `styles.schema.json#/definitions/Styles`; every property below names its definition there. Each definition carries its own description, examples, and — for closed value sets — a described `oneOf` of every option: read the schema for what a property or option *means*; this reference carries only the map and the judgment. The docs site mirrors the schema as one generated page per property under `/schema/styles/`.

## The property map

Properties group by the shape of their value. A property not in this table does not exist — `Styles` rejects unknown keys.

| Group | Properties | Value shape |
|---|---|---|
| Numbers | `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `opacity`, `rotation`, `cornerSmoothing`, `maxLines` | number, `$token`, or null (`NumberStyleValue`) |
| Colors | `backgroundColor`, `textColor`, `fillColor`, `strokes` | `{r,g,b,a}` object, gradient, `$token`, or null (`ColorStyleValue`) |
| Sides | `padding`, `strokeWeight` | single value or `{top, end, bottom, start}`, each number or `$token` (`SidesStyleValue`) |
| Corners | `cornerRadius` | single value or `{topLeft, topRight, bottomRight, bottomLeft}`, each number or `$token` (`CornersStyleValue`) |
| Deep: typography | `typography` | `$token` (a named text style) **or** an inline `Typography` object — members, their defaults, and which accept `$token` are declared on the `Typography` definition |
| Deep: effects | `effects` | `$token` (a named effect style) or an effects array (`EffectsStyleValue`) — shadows, blurs |
| Deep: image | `backgroundImage` | `ImageValue` or `$token` (`ImageStyleValue`) |
| Booleans | `clipsContent`, `wrap`, `locked`, `itemReverseZIndex` | boolean, `$token`, or null (`BooleanStyleValue`) |
| Bindable boolean | `visible` | boolean, `$token`, `$binding`, or `Conditional` (`BooleanBindableStyleValue`) — the one style a prop may drive directly. Bind it on nested elements only: a `$binding` on the **root** element's `visible` currently emits broken React (known transform defect), and root show/hide is interaction state that belongs to the behavior layer anyway |
| Spacing | `itemSpacing` | number when uniform, `{horizontal, vertical}` when the gaps differ, or `$token` (`ItemSpacingStyleValue`) |
| Other | `strokeDashPattern`, `aspectRatio` | per their definitions; neither accepts `$token` |

## Structural properties are never token-bound

Structural properties carry layout structure, take only their closed value set (or null), and reject `$token`. The authority is the schema itself: every such definition says **"Structural property — not token-bindable"** and declares its options as a described `oneOf` — read the option meanings there, not here. They are: `layoutMode`, `position`, `mainAxisAlignment`, `crossAxisAlignment`, `wrapAlignment`, `textAlignHorizontal`, `textOverflow`, `layoutSizingHorizontal`, `layoutSizingVertical`, `primaryAxisSizingMode`, `textAlignVertical`, `strokeAlign` (the last five narrowed to closed sets by ADR-115), plus the `position: ABSOLUTE` offsets (`top`, `start`, `end`, `bottom`, `centerHorizontalOffset`, `centerVerticalOffset`), which take numbers.

## Tokens

A token reference is `{$token: "<path>", $type: "<type>"}`. Rules:

- **Copy the path exactly as the catalogue spells it.** A token path is slash-separated (`Color/Primary`), per the `TokenReference` definition — but segment names and casing are the library's, not yours: read them verbatim from `analysis/styling.byToken.yaml`. Common `$type` values: `color`, `dimension`, `typography`, `effect`.
- **The token must exist in the source library.** `specs validate` checks every `$token` against the render caches and errors on one the library does not have; a class it cannot check is stated in a note. A token you invented will not resolve on any platform.
- **Prefer a token wherever one exists.** A literal where the system has a token is a consistency defect, not a shortcut. Check how sibling components style the same property (`analysis/styling.byComponent.yaml`).
- **Composite tokens bind whole nodes.** `typography: {$token, $type: typography}` corresponds to a Figma *text style*; `effects: {$token, $type: effect}` to a Figma *effect style*. Use the composite when the library has a named style; go inline only when it does not.

## Bindings and conditionals in styles

- `$binding` in styles is legal **only on `visible`** — e.g. `visible: {$binding: '#/props/showIcon'}`. Prop-driven content and instance swaps bind on the element's `content` / `instanceOf`, not in styles.
- A `Conditional` resolves a value from a bound prop: `{if: {condition: …, then: …, else: …}}`. Reach for it only when a variant delta cannot express the difference — variants are the primary mechanism for "this prop value changes this style".

## Defaults and deltas

`default.elements.<el>.styles` carries the complete baseline for the element. A variant's `styles` carries only what that configuration changes — never restate the baseline. The resolved component is every matching variant layered onto the default in order, like a cascade.

Composite members now declare their defaults in the schema (ADR-116: `Sides`/`Corners` members `0`, `alpha` `1`, `inset` `false`, the `Typography` text-transform members, `objectFit` `COVER`, …). Omit an optional member sitting at its declared default — writing it out restates the schema.
