---
title: "A2UI artifacts"
description: "What specs a2ui emits, how the two directions relate, and where the losses are"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

[`specs a2ui`](/cli/commands/a2ui/) compiles the spec workspace into [A2UI v1.0](https://a2ui.org/) runtime artifacts, and a companion direction reconstructs specs from A2UI payloads. Together they close the generative-UI loop: the design system's contracts become the vocabulary an agent composes with, and what the agent composes can land back inside the system's own documents.

## The three artifacts

| Artifact | Path | What it is |
|---|---|---|
| Catalog | `a2ui/src/catalog.json` | Every component as an A2UI component definition — one JSON Schema each, in the official catalogs' `allOf [ComponentCommon, …]` idiom, under the library's declared `catalogId` |
| Composition surfaces | `a2ui/src/compositions/<Name>/a2ui.json` | A `[createSurface, updateComponents]` message pair per composition: a flat adjacency-list node array, placeholders lowered to data-model bindings, repeated runs lowered to bound list templates |
| Example surfaces | `a2ui/src/components/<Name>/examples.json` | One small surface per instance example — the few-shot material a model reads to learn what good usage looks like |

All three are deterministic (identical inputs, byte-identical outputs), validate against the official A2UI schemas, and replay through the official A2UI SDK. The SDK itself is the workspace's own dependency, never Spectacular's.

## What transmits

The spec's **contract** surfaces transmit whole: props with their types, defaults and nullability; enums; slots and their constraints; invalid prop combinations as validation blocks; declared input constraints as schema keywords plus runtime `@checks`; accessibility conventions as the native `@accessibility` envelope; roles and actions as concrete `action.event` dispatch with payload context; subcomponents with derived `allowedParents`; guidelines as catalog `instructions`.

Two conventions fork the public API exactly as they do for code targets: the [states convention](/settings/states/) excludes browser-managed state props, and the accessibility conventions lift their props out of the prop surface into the envelope.

## What does not, by design

**Element styles.** An A2UI node carries props; visual styling lives in the renderer's registration of the system's real components — the same delegation React makes to CSS, made to the host application. The one exception is primitive lowering: an un-promoted layer's styles are read through the promotion table to become a configured component's props.

**Capture provenance** (`$extensions`), omitted state configurations, and components the catalog does not define — each dropped with a warning naming it, never silently.

## The reverse direction

The A2UI → spec direction reconstructs a composition's `anatomy + elements + layout` from a payload: bindings read their values back out of the data model, the envelope returns to its convention props, templates reverse to the repetition fact, and unrolled duplicates merge back. With a [standardCatalog](/settings/a2ui-standard-catalog/) declared, nodes an agent composed in the basic vocabulary raise into the library's own components — the promote-primitives relationship, with standard components as the raw layer.

## The platform binding

`mappings/bindings/a2ui.json` in the schema package declares the whole correspondence formally — which prop kinds bind how, which rules govern the forks, and that the style surface is deliberately not read — alongside the bindings the other platforms carry.
