---
title: "json-render artifacts"
description: "What specs json-render emits, how the catalog, registry and Specs relate, and where enforcement lives"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

[`specs json-render`](/cli/commands/json-render/) compiles the spec workspace into [json-render](https://github.com/vercel-labs/json-render) runtime artifacts — the second generative-UI target beside [A2UI](/code/a2ui/), sharing its lowering and differing where the runtimes differ: this target's catalog is *code*, and its registry binds the React components Spectacular already emitted.

## The four artifacts

| Artifact | Path | What it is |
|---|---|---|
| Catalog | `json-render/src/catalog.ts` | `defineCatalog` over the react schema: one Zod object per component (constraints as refinements, invalid combinations as `.superRefine`), the action vocabulary as a typed `actions` dictionary, foundations guidelines exported as `customRules` for `catalog.prompt()` |
| Registry | `json-render/src/registry.tsx` | A starter `defineRegistry`: every entry imports its component from the emitted `react/` tree, spreads the typed props through a null-stripping boundary, wires role activation handlers to `emit()`, and runs the value convention through `useBoundProp` so `$bindState` two-way updates work without host code. A starter — edit freely; a regeneration overwrites it |
| Composition Specs | `json-render/src/compositions/<Name>/json-render.json` | One flat `{ root, elements, state }` Spec per composition: keyed element map, `{$state}` placeholder reads, `{$bindState}` two-way props, native `repeat` with `$bindItem` templates, `visible`, `on` dispatch |
| Example Specs | `json-render/src/components/<Name>/examples.json` | One Spec per instance example — few-shot material, slot pointers resolved |

All deterministic (byte-identical across runs). The SDK, zod 4 and React are the workspace's dependencies; the registry typechecks against the emitted React contracts, which is why enum values and number nullability in the catalog mirror those contracts exactly.

## Where enforcement lives

Two gates, deliberately different:

- **`catalog.validate(spec)`** is the SDK's structural gate — element shapes, known component types — and it is binding-tolerant: a `{$state}` or `{$bindState}` object passes a plain prop schema, so emitted payloads validate as shipped.
- **The per-component Zod schema** (`catalog.data.components[k].props`) is the constraints gate: a forbidden variant combination or violated constraint fails it deterministically. This is the declared enforcement point because the SDK's composed `catalog.zodSchema()` rebuilds prop objects and drops refinements (measured against `@json-render/core` 0.23.2).

## Relation to the A2UI target

The two targets share one lowering — the states/accessibility/value forks, template detection, primitive lowering, slot-content resolution, dispatch derivation — and differ only in target idiom. Three dispositions diverge on purpose, declared in the [generated mapping](/schema/mappings/json-render/): accessibility-convention props stay ordinary props here (no envelope exists), enum values normalize (the registry binds to React contracts), and constraints live in Zod only. Styling in both cases belongs to the real components — here via the `react/` tree and its [CSS binding](/schema/mappings/css/) output.
