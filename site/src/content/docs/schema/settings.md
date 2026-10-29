---
title: "Settings"
description: "Choices about a run — sources, spec output, and assets"
---

Controls how a run behaves. Changing a setting produces **different** output, never incorrect output: a different team reading the same library may set every one of these differently and each result is correct.

Authored in `config/settings.yaml`. Members are grouped by concern, and each concern carries its own `directory`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `author` | `string` | — | Author recorded in generated spec metadata |
| [`curation`](/settings/curation/) | `object` | — | Which components of a library a run produces specs for |
| `data` | `object` | — | Source acquisition and the directory holding fetched, computed, and authored data |
| `spec` | `object` | — | The generated spec — where it lands, how it is split, what it contains, how values are serialized |
| `assets` | `object` | — | Shared resources every code output points at: icons, images, generated CSS, fonts |

## `curation`

Which components of a library a run specs at all (ADR-093). A library holds more than a team consumes, so curation records the decision in a manifest a human can edit.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| [`defaultSelection`](/settings/curation/) | `'READY_FOR_DEV' \| 'ALL'` | `'READY_FOR_DEV'` | The signal a first pass derives selection from; `READY_FOR_DEV` falls back to every set and standalone component when the library marks none |
| [`preserveManualSelections`](/settings/curation/) | `boolean` | `true` | A hand-edited selection outranks a later change to the library's signal |
| [`includeDependencies`](/settings/curation/) | `boolean` | `true` | The components a selected component is built from are selected too, transitively |

## `data`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `directory` | `string` | — | Directory holding fetched downloads, computed caches, extracted assets, and authored inputs |
| `sources` | `object` | — | Sources the workspace reads from, keyed by source name |

### `data.sources.<name>`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `key` | `string` | *(required)* | Figma file key the source reads from |
| `fetch` | `string[]` | — | Artifacts to download (e.g. `file`, `variables`, `styles`, `icons`) |

## `spec`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `directory` | `string` | — | Directory the generated spec is written to |
| [`format`](/settings/output-format/) | `'JSON' \| 'YAML'` | `'YAML'` | Serialization format |
| [`keys`](/guides/key-formatting/) | `'SAFE' \| 'CAMEL' \| 'SNAKE' \| 'KEBAB' \| 'PASCAL' \| 'TRAIN'` | `'CAMEL'` | Key casing style |
| [`layout`](/guides/data-layout/) | `'LAYOUT' \| 'PARENT_CHILDREN' \| 'BOTH'` | `'LAYOUT'` | Element hierarchy representation |
| [`tokens`](/settings/tokens/) | `'TOKEN' \| 'TOKEN_NAME' \| 'TOKEN_FIGMA_EXTENSIONS' \| 'FIGMA_NAME' \| 'CUSTOM' \| 'FIGMA_SYNTAX_WEB' \| 'FIGMA_SYNTAX_IOS' \| 'FIGMA_SYNTAX_ANDROID'` | `'TOKEN'` | Token reference output format |
| [`color`](/settings/color/) | `ColorFormat` | `'HEXA'` | Color value output format |
| [`variantDepth`](/guides/variant-depth/) | `1 \| 2 \| 3 \| 9999` | `9999` | Maximum variant nesting depth (9999 = unlimited) |
| [`details`](/guides/variant-layering/) | `'FULL' \| 'LAYERED'` | `'LAYERED'` | Output detail level |
| [`collapsePrimitiveWrapper`](/settings/collapse-primitive-wrapper/) | `boolean` | `true` | Strip a root container that only wraps one child — a text/glyph leaf, or a slot — and promote the child to spec root |
| [`promotePrimitives`](/settings/promote-primitives/) | `boolean` | `false` | Promote primitive layers in composed example content to instances of the design system's own components |
| `roles` | `boolean` | `false` | Read Figma Dev Mode annotations and emit [`anatomy.<element>.role`](/schema/anatomy/) and `.actions` — the on-switch for the [role feature](/roles/) (ADR-067) |
| `roleValidation` | `'warn' \| 'error'` | `'warn'` | Severity for unmet required role obligations, such as a control with no accessible-name source; `error` fails the transform (ADR-067) |
| [`invalidVariants`](/settings/invalid-variants/) | `boolean` | `false` | Include variants marked invalid |
| [`invalidCombinations`](/guides/invalid-variant-combinations/) | `boolean` | `true` | Include `invalidPropCombinations` list |
| [`emptyVariants`](/settings/empty-variants/) | `boolean` | `false` | Include variants with no element overrides |
| [`defaultSlotContent`](/guides/default-slot-content/) | `boolean` | `false` | **Pro.** Emit the component's default slot content into `Component.slotContentExamples`. Ignored on the free tier |
| `splitComponents` | `boolean` | `true` | Write one file per component rather than a single combined library file |
| `splitConcerns` | `boolean` | `true` | Write one file per concern (api, styling, variants) |
| `useSubfolders` | `boolean` | `true` | Nest each component's files in a subfolder named for the component |

## `assets`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `directory` | `string` | — | Directory holding shared assets |

Grouped by consumer rather than producer: icons, images, generated CSS, and fonts arrive from fetch, from generate, from transform, or from a process outside this tool — and every code output points at them, whatever the platform.

## DEFAULT_SETTINGS

A runtime export from `@directededges/specs-schema`. Provides defaults for every setting that has one. Typed as `ResolvedSettings` — all defaulted properties are required:

```ts
const DEFAULT_SETTINGS: ResolvedSettings = {
  curation: {
    defaultSelection: 'READY_FOR_DEV',
    preserveManualSelections: true,
    includeDependencies: true,
  },
  spec: {
    format: 'YAML',
    keys: 'CAMEL',
    layout: 'LAYOUT',
    tokens: 'TOKEN',
    color: 'HEXA',
    variantDepth: 9999,
    details: 'LAYERED',
    collapsePrimitiveWrapper: true,
    promotePrimitives: false,
    roles: false,
    roleValidation: 'warn',
    invalidVariants: false,
    invalidCombinations: true,
    emptyVariants: false,
    defaultSlotContent: false,
    splitComponents: true,
    splitConcerns: true,
    useSubfolders: true,
  },
};
```

Directories, `sources`, and `author` carry no default: the consumer supplies them, and this package has no basis for choosing one. They stay optional on `ResolvedSettings` for exactly that reason.

The three split flags are different. Every downstream command — `transform`, `analyze`, `render` — reads the split layout, so the shape of generated output is not a per-consumer choice; leaving each consumer to pick its own default is how the same workspace ends up emitting two layouts. `DEFAULT_SETTINGS` carries them as `true` and they are required on `ResolvedSettings`.
