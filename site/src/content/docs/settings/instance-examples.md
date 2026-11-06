---
title: "instanceExamples"
description: "Detect named example frames that demonstrate a configured whole-component usage"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>
<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Instance examples are real-world usages of a component placed in your Figma file — instances with their props and slots filled in (for example, an alert with a title, body, and two actions) — and when detection is configured, those instances are harvested into `Component.instanceExamples` and emitted. A library fact: where a library keeps its examples and how it marks them are properties of the library — a wrong declaration yields no examples, or foreign ones.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `instanceExamples` |
| **Type** | block (`scope`, `match`, `exclude`, `parentNames`) |
| **Default** | absent (no detection runs) |

## Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `scope` | `"PAGE"` \| `"FILE"` | No | `PAGE` | Where the library keeps its examples. `PAGE` = the component's Figma page only; `FILE` = all pages in the file (for teams with a dedicated "Examples" page) |
| `match` | `string[]` | No | — | Optional name patterns narrowing which instances qualify, using the `{C}` (component name) placeholder. Absence = every in-scope instance of the component qualifies |
| `exclude` | `string[]` | No | — | Name patterns to exclude. Same `{C}` syntax as `match` |
| `parentNames` | `string[]` | No | — | Immediate-parent frame or section names a candidate must be contained within — useful for grouping examples inside a frame named `"Examples"` to distinguish them from test cases or playground instances. Absence means no parent-name filtering |

If a candidate matches an `exclude` pattern, the exclusion wins. `NESTED` scope is intentionally unavailable: a component instance used as an example cannot live inside the component frame itself.

## Example

Simplest setup — every instance of the component inside a frame named "Ready-made examples" is an example. No name patterns; identity plus the parent filter do the scoping:

```yaml
instanceExamples:
  scope: PAGE
  parentNames:
    - Ready-made examples
```

Examples on a dedicated page, inside an "Examples" frame, narrowed by name and with deprecated ones excluded:

```yaml
instanceExamples:
  scope: FILE
  parentNames:
    - Examples
  match:
    - "{C} / *"
  exclude:
    - "* / Deprecated / *"
```

Examples alongside the component, narrowed by name only:

```yaml
instanceExamples:
  scope: PAGE
  match:
    - "{C} – *"
    - "{C} Example *"
```

## Result

Every qualifying instance becomes a keyed entry in the component's `instanceExamples` registry, sitting alongside `anatomy`, `props`, `variants`, and `slotContentExamples`. Each key is derived from the instance's frame name, so a single component typically yields a set of ready-made examples. Each entry records the example's `title` and `propConfigurations` (with slot content referenced via `$slotContent`):

```yaml
components:
  dsAlert:
    title: DS Alert
    anatomy: …
    props: …
    variants: …
    subcomponents: …
    slotContentExamples: …
    instanceExamples:
      alertBasicCustomIcon:
        title: Alert Basic Custom Icon
        propConfigurations:
          showIcon: true
          icon: info
          appearance: info
          children:
            $slotContent: "#/components/dsAlert/slotContentExamples/dsAlert__children"
      alertDescriptionOnly: …
      alertHorizontalContent: …
      alertHorizontalContentDismissable: …
      alertTitleOnly: …
      alertWithActions: …
      alertWithActionsHorizontalContent: …
      alertWithBadge: …
      alertWithOpenDrawer: …
```

When `figma.instanceExamples` is absent (or the license is not Pro), the registry is omitted entirely.

## Qualification

A candidate qualifies primarily by **identity**: it must be an *instance of the component being generated* (one of its variants). Naming is not the relevance test — that's what `match` is for, and `match` is optional. This means example instances can be named anything; they don't need to reference the component name.

The **presence** of `figma.instanceExamples` is the on-switch — the same opt-in model as [`subcomponents`](/settings/subcomponents/). There is no separate flag: when the block is present (and the license is Pro), examples are detected *and* emitted. When it is absent, no detection runs.

## Licensing

Instance example detection and output requires a [Pro license](/overview/licensing/). On the free tier `figma.instanceExamples` is silently ignored — no detection runs and nothing is emitted. The Figma plugin hides these controls until a Pro license is active.

## Further reading

- [Instance (Ready-Made) Examples guide](/guides/instance-examples/) for authoring example frames end to end.
- [`defaultSlotContent`](/settings/default-slot-content/) — the separate default-slot-content output flag.
- [Schema: Component](/schema/component/) for the `instanceExamples` registry shape.
- [`subcomponents`](/settings/subcomponents/) — the presence-driven detection model this mirrors.
