---
title: "a2ui"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Emits the A2UI target: one runtime catalog describing every component as an [A2UI v1.0](https://a2ui.org/) component definition, one surface payload per composition, and one payload per instance example — into `a2ui/`, the artifacts an agent needs to compose UI from your real components instead of inventing them.

Where `specs react` closes the loop at build time, `specs a2ui` closes it at run time: the catalog is the vocabulary a model generates against, the composition payloads are its few-shot examples, and the surfaces it produces validate against the same contracts your design system declared in Figma.

## Usage

```bash
specs a2ui [options]
```

No arguments. The target is the command.

## What it writes

```
a2ui/
└── src/
    ├── catalog.json                          the catalog — every component, one JSON Schema each
    ├── components/
    │   └── Alert/
    │       └── examples.json                 one surface per instance example (few-shot material)
    └── compositions/
        └── SignIn/
            └── a2ui.json                     [createSurface, updateComponents] message pair
```

The A2UI SDK that renders these is your workspace's own dependency (the `a2ui/package.json` the tree carries), never Spectacular's — the same posture Storybook has.

## What the catalog carries

| Spec surface | Catalog form |
|---|---|
| Props (`api.yaml`) | JSON Schema properties — open-valued kinds as bindable `Dynamic*` types, enums literal |
| Slots | `ChildList` properties under their own names; constraints as `allowedChildren` |
| `invalidPropCombinations` | `not`/`anyOf` validation blocks — a forbidden variant combination fails validation |
| Prop `constraints` | Schema keywords plus `@checks` calling an emitted validation-function registry |
| States convention | Browser-managed state props are excluded from the public API (`statesToContract`) |
| Accessibility conventions | Lifted to the native `@accessibility` envelope (label, description, role-implied live regions) |
| Roles and actions | Concrete `action.event` dispatch with payload context, from the concept fact tables |
| Subcomponents | Flattened entries with derived `allowedParents` |
| Guidelines (ADR-118) | Foundations guidance becomes the catalog's `instructions`; component guidance joins descriptions |
| Instance examples | Each ready-made usage becomes its own one-root surface |

What deliberately does not transmit: element styles. An A2UI node carries props; visual styling lives in the renderer's registration of your components — the same delegation React makes to CSS, made to the host application instead.

## Options

| Option | Description |
|---|---|
| `-o, --output <path>` | Path to the specs directory (input) |
| `--config <path>` | Path to a `config/` directory |
| `--components <keys...>` | Only emit these component folders |
| `--compositions` / `--no-compositions` | Emit one kind only |
| `--watch` | Re-emit on every change |

Compositions are Pro, as they are for every emitted target.

## Configuration

The platform conventions file `config/conventions/a2ui.yaml` declares the library's catalog identity and its [standard-catalog correspondence](/settings/a2ui-standard-catalog/):

```yaml
catalogId: "example.com:my-library"
standardCatalog:
  # …
```
