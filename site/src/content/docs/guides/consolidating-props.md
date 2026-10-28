---
title: "Consolidating Props"
description: "How Spectacular merges a boolean visibility toggle with its content prop into a single nullable prop"
---

Figma often requires two component properties to control what a single element does: one to show or hide it, and another to set its content. Spectacular detects this pattern and merges the two into one nullable prop in the spec output, producing a cleaner API that matches how developers think about components.

## The Problem

Figma's component property system forces two separate properties for what developers think of as a single concern.

### Text

Consider a Button with an optional label. In Figma, you need:

1. **Show Label** (boolean) — toggles the text layer's visibility
2. **Label** (text) — sets the text content

From a developer's perspective, this is one concern: the label is either present with a value, or it's absent. A coded component would express this as a single `label` prop that accepts a string or `null`. But Figma's property system forces it into two separate bindings.

### Icon Glyph

The same pattern appears with icons. An icon element needs:

1. **Show Icon** (boolean) — toggles the instance layer's visibility
2. **Icon** (instance swap) — selects which icon to display

Developers think of this as one thing: an icon is either provided or it isn't. When the icon is an instance swap that matches a [glyph name pattern](/guides/glyph-name-pattern/), Spectacular classifies it as a `glyph` content type — but the two-prop problem remains the same.

When these prop pairs aren't consolidated, consumers of the spec must manually understand which booleans correspond to which content props and how they interact — duplicating logic that Spectacular can infer automatically.

## What It Does

Spectacular scans every element in every variant looking for **binding pairs**: an element that has both a `visible` binding (to a boolean prop) and a content binding (to a text, instance swap, or slot prop) on the same element. When a consistent pair is found across all variants, Spectacular:

1. **Merges the two props into one** — the content prop becomes `nullable: true`, meaning it accepts its normal values *or* `null`
2. **Sets the default** — if the boolean defaults to `false` (element hidden), the merged prop defaults to `null`
3. **Removes the boolean** — the visibility toggle is dropped from the props list since it's now expressed through nullability
4. **Adds metadata** — a `$extensions.com.figma.visibilityProp` field records the original boolean prop name, so consumers can trace the merge

### Before (without consolidation)

```yaml
props:
  showLabel:
    type: boolean
    default: true
  label:
    type: string
    default: "Button"
  showIcon:
    type: boolean
    default: false
  icon:
    type: string
    contentType: glyph
    default: "IconPlus"
```

A consumer must know that `showLabel` controls whether `label` matters, and `showIcon` controls whether `icon` matters.

### After (with consolidation)

```yaml
props:
  label:
    type: string
    nullable: true
    default: "Button"
    $extensions:
      com.figma:
        visibilityProp: showLabel
  icon:
    type: string
    contentType: glyph
    nullable: true
    default: null
    $extensions:
      com.figma:
        visibilityProp: showIcon
```

Now the intent is clear: `label` is a string that defaults to `"Button"` and can be set to `null` to hide the label. `icon` defaults to `null` (hidden) and can be set to a glyph name to show an icon.

## How It's Detected

The consolidation runs automatically — there's no configuration needed. The engine validates pairs using these rules:

1. **Co-occurrence** — the boolean's `visible` binding and the content prop's binding must appear on the same element
2. **One-to-one** — each boolean must control exactly one element (a boolean bound to multiple elements' visibility is not a clean pair)
3. **Consistent across variants** — every variant where the element has a visibility binding must also have the content binding
4. **Stable prop names** — the boolean and content prop names must be the same across all variants

If any rule fails, the props remain separate — no data is lost.

## What Gets Paired

The engine recognizes three types of content bindings:

| Figma binding | Content type | Spec prop type | Example |
|---------------|-------------|---------------|---------|
| Text (`characters`) | `string` | `StringProp` | Label text, placeholder |
| Instance swap (`mainComponent`) | `glyph` | `StringProp` with `contentType: glyph` | Icon selection |
| Slot (`slotContentId`) | `slot` | `SlotProp` | Nested component |

## Conditional Visibility in Variants

When a pair is active, the element's visibility is no longer a bare `true` or `false`. Instead, the spec expresses it as a [conditional](/schema/conditional/) — a structured expression that says "this element is visible when the prop is not null." This connects the element-level rendering decision back to the prop API.

For example, a Button's default variant with a consolidated label and icon:

```yaml
default:
  elements:
    label:
      styles:
        visible:
          if:
            condition:
              operation: isNull
              args:
                value:
                  $binding: "#/props/label"
            then: false
            else: true
      content:
        $binding: "#/props/label"
    iconGlyph:
      styles:
        visible:
          if:
            condition:
              operation: isNull
              args:
                value:
                  $binding: "#/props/icon"
            then: false
            else: true
      content:
        $binding: "#/props/icon"
```

The test is written as `isNull` with `then: false` — the operation asks whether the prop *is* null, and `then` is the visibility when it is. `isNull` is the only null test the analyzer recognizes; a condition naming anything else yields no rule, and the element renders unconditionally.

Rather than requiring consumers to cross-reference `showLabel: true` with a separate boolean prop, the conditional makes the relationship explicit: the Label element is visible when `label` is not `null`, and hidden when it is. The same applies to the icon glyph — its visibility is tied directly to whether the `icon` prop has a value.

## See Also

- [Icon Glyphs guide](/guides/glyph-name-pattern/) — How icon instances are classified as glyphs
- [Schema: Conditional](/schema/conditional/) — Conditional expression syntax
- [Schema: Props](/schema/props/) — Prop types and nullability
- [Schema: Elements](/schema/elements/) — Element visibility bindings
