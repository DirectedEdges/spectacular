---
title: "states"
description: "Classify Figma variant props as browser-driven or consumer-controlled states for deterministic CSS and contract output"
---

The `states` convention classifies your library's variant props as semantic states. A fact about the spec's own props (it names props that exist in `api.yaml`, so a transform reading only the spec can apply it): which prop expresses which state concept is an agreement no rule can recover — a wrong entry lands a concept on the wrong prop, and an unclassified prop emits as a `data-*` attribute.

| | |
|---|---|
| **File** | `config/conventions/specs.yaml` |
| **Path** | `states` |
| **Type** | map of concept → `{ prop, value?, contract? }` |
| **Default** | absent (all variant props emit as `data-*` selectors) |

## Properties

Each entry maps a concept key to the prop that expresses it:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `prop` | `string` | Yes | — | Figma variant prop name (e.g. `state`, `disabled`, `readOnly`) |
| `value` | `string` | No | `"true"` | Figma enum value that activates this concept. Omit for boolean props. |
| `contract` | `"omit"` \| `"keep"` | No | concept default | Override the concept's default contract behavior. Rarely needed. |

## Example

```yaml
states:
  # Concept key → { prop, value?, contract? }
  # value: the Figma variant value that activates this concept (defaults to "true" for booleans)
  # contract: rarely needed — derived from the concept
  hover:
    prop: state
    value: hover
  active:
    prop: state
    value: pressed       # Figma uses cross-platform name "pressed"; concept maps to :active
  focus-within:
    prop: focused        # boolean prop; value defaults to "true"
  disabled:
    prop: isDisabled     # library uses "is" prefix convention
  readonly:
    prop: readOnly
  invalid:
    prop: validation
    value: invalid       # only one enum value maps to this concept
  expanded:
    prop: expanded
```

Run [`specs react`](/cli/commands/react/) to regenerate stylesheets after updating this declaration. Absence of `states` is safe — all variant props continue to emit as `data-*` selectors.

## Behavior

Declaring the convention enables two downstream behaviors:

- [`specs react`](/cli/commands/react/) and [`specs webcomponents`](/cli/commands/webcomponents/) emit real CSS pseudo-classes and ARIA attribute selectors instead of `data-*` attributes for classified props.
- The generated contract omits browser-driven props from its Props interface.

### Props from Figma

These props are typical outputs from `specs generate` — the raw Figma variant structure before any state classification is applied:

```yaml
props:
  state:
    type: string
    default: rest
    enum:
      - rest
      - hover
      - pressed    # cross-platform name; maps to :active on web
  isDisabled:      # library uses "is" prefix convention
    type: boolean
    default: false
  focused:
    type: boolean
    default: false
```

The `states` convention acts on these props during `specs react` — to determine CSS selector strategy and contract inclusion. The `api.yaml` itself is not modified.

### State concepts

Each concept resolves to a canonical CSS selector and determines whether the prop is included in or omitted from the generated Props interface.

| Concept | CSS selector(s) | Contract |
|---------|----------------|----------|
| `hover` | `:hover` | omitted |
| `active` | `:active` | omitted |
| `focus` | `:focus-visible` | omitted |
| `focus-visible` | `:focus-visible` | omitted |
| `focus-within` | `:focus-within` | omitted |
| `placeholder-shown` | `:placeholder-shown` | omitted |
| `disabled` | `:disabled, [aria-disabled="true"]` | included |
| `readonly` | `[readonly], [aria-readonly="true"]` | included |
| `required` | `[required], [aria-required="true"]` | included |
| `invalid` | `[aria-invalid="true"]` | included |
| `valid` | `[aria-invalid="false"]` | included |
| `selected` | `[aria-selected="true"]` | included |
| `checked` | `:checked, [aria-checked="true"]` | included |
| `indeterminate` | `:indeterminate, [aria-checked="mixed"]` | included |
| `expanded` | `[aria-expanded="true"]` | included |
| `collapsed` | `[aria-expanded="false"]` | included |
| `pressed` | `[aria-pressed="true"]` | included |
| `busy` | `[aria-busy="true"]` | included |
| `current` | `[aria-current="true"]` | included |

### Mapping Props to Concepts

Figma naming conventions don't need to match the concept name. Many design systems name their pointer-down state `pressed` rather than `active` because `pressed` is platform-neutral — it maps to `:active` on web, `UIControlState.highlighted` on iOS, and press `Indication` in Compose. Naming it `active` in Figma would embed a web-specific term into a shared design language. Similarly, a library using `isDisabled` as its boolean prop convention is still expressing the `disabled` concept.

:::tip Setting up for the first time?
Run the [`specs-cli.states.setup` skill](/cli/skills/states-setup/) in Claude Code. It reads your own prop data, sorts every variant prop into a state concept, a visibility toggle or a presentation flag, and hands you a ready-to-paste `states` block with the evidence behind each row. Install it with [`specs skills install`](/cli/commands/skills/).
:::

### CSS transform

Without `states` config, all variant props produce `data-*` attribute selectors:

```css
/* Without states config */
.ds-text-input[data-state="hover"] { … }
.ds-text-input[data-is-disabled] { … }       /* boolean prop → presence selector */
.ds-text-input[data-focused] { … }            /* boolean prop → presence selector */
```

With `states` config, classified props produce semantic selectors:

```css
/* With states config — disabled concept configured */
.ds-text-input:hover:not(:disabled):not([aria-disabled="true"]) { … }
.ds-text-input:disabled,
.ds-text-input[aria-disabled="true"] { … }
.ds-text-input:focus-within { … }
```

Props not listed in `states` continue to emit as `data-*` attribute selectors. Unmatched values on a classified prop (e.g. the `rest` default on a `state` prop) are treated as the base state and skipped — the base block already covers them.

:::caution
Naming a prop in any entry excludes it from `data-*` emission for **all** its values, not only the ones you classified. So a `value` that is absent from the prop's `enum` costs you the styling twice over: no concept selector is emitted, and the `[data-*]` selector that used to carry it is gone too. Nothing reports this. Values are matched case-insensitively, so `hover` finds `Hover`, but a different spelling — `active` against an enum holding `press` — silently drops every rule for that variant. Copy each value out of the prop's `enum`, and after `specs react` confirm the selector you expected is in the stylesheet.
:::

For the `focus` and `focus-visible` concepts, the emitted selector is narrowed to the shape of the component's root: a root that can hold focus itself (a button, a link) emits `:focus-visible`, and a wrapper root emits `:has(:focus-visible)` so the styling reaches the control inside — a clicked button never holds its focus ring, while clicking into a text field still shows it. A declared `focus-within` concept always emits `:focus-within` exactly as declared.

### Contract transform

Browser-driven concepts (`hover`, `active`, `focus`, `focus-within`, etc.) are omitted from generated Props interfaces — the browser fires these without the application setting anything. Consumer-controlled concepts (`disabled`, `readOnly`, `validation`, etc.) are included — the consumer sets them and the component bridges them to the appropriate HTML or ARIA attribute.

```typescript
// state and focused omitted — browser-driven, never set by consumers
interface TextInputProps {
  disabled?: boolean;   // bridges to :disabled / aria-disabled
  readOnly?: boolean;   // bridges to [readonly] / aria-readonly
  validation?: 'none' | 'invalid';  // bridges to aria-invalid
}
```

## Further reading

- [`specs react`](/cli/commands/react/) and [`specs webcomponents`](/cli/commands/webcomponents/) — CSS output affected by this classification.
- [`subcomponents`](/settings/subcomponents/) — another presence-driven convention.
