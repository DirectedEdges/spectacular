---
title: "json-render"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Emits the [json-render](https://github.com/vercel-labs/json-render) target: a typed Zod catalog, a starter React registry binding to the components [`specs react`](/cli/commands/react/) already emitted, and one flat Spec payload per composition and instance example — into `json-render/`, what a host application needs to let a model generate UI from your real components.

Where the [a2ui target](/cli/commands/a2ui/) produces a protocol payload any registered renderer replays, this one produces **code**: the catalog and registry are TypeScript the host compiles, and the registry imports your emitted React components directly — so `specs react` must have run first.

## Usage

```bash
specs json-render [options]
```

No arguments. The target is the command.

## What it writes

```
json-render/
└── src/
    ├── catalog.ts                            defineCatalog: Zod per component, constraints,
    │                                         invalid combinations as .superRefine, actions,
    │                                         guidelines as prompt customRules
    ├── registry.tsx                          starter defineRegistry over ../../react/src —
    │                                         role handlers wired to emit(), the value
    │                                         convention through useBoundProp
    ├── components/
    │   └── Alert/
    │       └── examples.json                 one Spec per instance example
    └── compositions/
        └── SignIn/
            └── json-render.json              flat { root, elements, state } Spec
```

`@json-render/core`, `@json-render/react`, `zod` (v4) and React are the workspace's own dependencies (the `json-render/package.json` the tree carries), never Spectacular's — the same posture Storybook and the a2ui SDK have.

## What the artifacts carry

| Spec surface | json-render form |
|---|---|
| Props | Zod per component — enum values on the same normalized casing the React contracts declare |
| Prop `constraints` | `.min()`/`.max()`/`.regex()` refinements; `required` drops the optional widening |
| `invalidPropCombinations` | `.superRefine()` — a forbidden configuration fails the component's schema |
| States convention | Browser-managed state props excluded from catalog and payloads |
| Value convention | `{ $bindState: "/<id>/<prop>" }` two-way bindings, seeded in `state`, wired through `useBoundProp` |
| `{Placeholder}` text | `{ $state }` reads with seeded `state` |
| Repetition | Native `repeat: { statePath }` with one `$bindItem` template child |
| Roles and actions | `on: { <event>: { action, params } }` dispatch; the action vocabulary as the catalog's `actions` dictionary |
| Guidelines (ADR-118) | Component guidance in descriptions; foundations guidance exported as `customRules` for `catalog.prompt()` |
| Element visibility | `styles.visible: false` lowers to the Spec's native `visible: false` |

Styles otherwise do not transmit: they live in the React components the registry binds, which carry the [CSS binding](/schema/mappings/css/)'s output. The full disposition table is the generated [json-render mapping](/schema/mappings/json-render/).

## Options

| Option | Description |
|---|---|
| `-o, --output <path>` | Path to the specs directory (input) |
| `--config <path>` | Path to a `config/` directory |
| `--components <keys...>` | Only emit these component folders |
| `--compositions` / `--no-compositions` | Emit one kind only |
| `--watch` | Re-emit on every change |

Compositions are Pro, as they are for every emitted target.
