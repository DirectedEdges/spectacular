---
title: "dependencies"
description: "Emit a component dependency graph showing blast radius and prop utilization across nested instances"
---

The dependencies analyzer builds a directed graph of how components compose one another, read from `instanceOf` references across every spec. It answers two questions no single spec can:

- **What is the blast radius of changing this component?** If Icon changes, Button (which places an Icon) is impacted directly — and Card (which places a Button) is impacted transitively.
- **Which of this component's props do its consumers actually use?** Every dependent may configure Icon's `size`, while none ever touches `appearance`.

## Use When

- You are planning a change to a shared component and need the full list of impacted components before you start.
- You want to know which props are load-bearing across the library and which are never configured by any consumer.
- You want to find structural facts about the library: its most-depended-on components, components nothing depends on, or unintended circular dependencies.
- You want a structured input for an LLM to produce a change-impact report (see [Analyzing with an LLM](#analyzing-with-an-llm)).

## Invocation

```bash
specs analyze dependencies
```

## Reading the Graph

The output uses a handful of graph-theory terms. Each maps to a concrete question about your library:

| Term | Meaning here |
|------|--------------|
| **Node** | A component. Components outside the analyzed set appear as nodes flagged `external`. |
| **Directed edge** `A → B` | Component A uses component B. The arrow points from the dependent to the dependency: `dsButton → dsIcon` means Button places an Icon. |
| **Dependencies** of A | Every node reachable by following edges *forward* from A — what A is built from. |
| **Dependents** of B | Every node that can reach B by following edges — what is built from B. Computed by walking edges in reverse; this reverse reachability *is* the blast radius. |
| **Depth** | The length of the shortest dependency chain between two components. A direct dependent has depth 1; `dsCard → dsButton → dsIcon` puts Card at depth 2 from Icon. |
| **Degree** | Edge counts at a node: `dependsOn` (how many components it relates to) and `dependedOnBy` (how many relate to it). Both cover every edge kind — a component reachable only through another's slot still counts — and `byKind` splits them by the relationship behind them. A high `dependedOnBy` marks a load-bearing component. |
| **Root** | A component nothing depends on — the top of a composition chain (pages, dialogs, full patterns). |
| **Leaf** | A component that depends on nothing — a primitive (icons, dividers). |
| **Cycle** | A set of components that depend on each other in a loop, directly (`A → A`) or mutually (`A → B → A`). Healthy component libraries have none; any that exist are reported. |

## Edge Kinds

Not every reference implies the same certainty, so edges carry a `kind`:

| Kind | Source | Certainty | In blast radius? |
|------|--------|-----------|------------------|
| `instance` | A placed instance — `instanceOf` on an anatomy or variant element | The component's shipped anatomy contains it | Yes |
| `slot` | A slot prop's `anyOf` constraint | The component's contract admits it | No — listed as a contract relation |
| `example` | A `slotContentExamples` composition | The component's documented examples compose it | No — listed as a contract relation |

Every edge is a proven fact read from the spec; the kinds differ in *what changes propagate through them*. An `instance` edge transmits any change — styling, props, structure — because the dependent's own rendered output contains the dependency. A `slot` or `example` edge couples the components at the contract and documentation level: renaming or deleting the target invalidates the dependent's `anyOf` list or examples, but changing the target's styling touches nothing the dependent itself renders.

The transitive closure (blast radius) is therefore computed over `instance` edges only — folding "may compose" edges into it would make every radius maximal and meaningless. Slot and example relations appear separately as `contractDependents` / `contractDependencies`. For contract-level changes (deleting a component, renaming it, changing what it fundamentally is), read `contractDependents` as part of the blast radius.

## How Dependencies Are Collected

For every component directory containing an `api.yaml`, the analyzer reads `instanceOf` references from the anatomy and from every element in the `default` configuration and each variant. In split-concerns output these live in `variants.yaml` and examples in `examples.yaml`; single-file output falls back to `api.yaml`. Alongside each placed instance, the analyzer records the `propConfigurations` applied to it — including `$nested` deep configurations, which are resolved through intermediate components to the terminal instance that owns the prop.

- **Subcomponents collapse into their parent.** A reference to `#/subcomponents/control` is internal structure, not a cross-component dependency. Instances placed *inside* a subcomponent become edges from the parent component.
- **Unmatched references become external nodes.** `instanceOf` values are matched against analyzed component keys (with name normalization, so `DS Icon` matches `dsIcon`). Anything else — a component from another library, a private component not in the workspace — appears as a node flagged `external: true` with no further data. The graph stays honest about edges leaving the analyzed set.
- **Instance swaps contribute candidate edges.** When an element's `instanceOf` is bound to a prop, each of that prop's enum values that matches a known component becomes an `instance` edge. Unmatched swap candidates are dropped rather than reported as externals.
- The `(unresolved instance)` sentinel emitted for unresolvable slot constraints is ignored.

## Outputs

Two aggregate files are written to `analysis/` after all components are processed. The extension follows `spec.format` in `config/settings.yaml` — `.json` shown here, `.yaml` when configured.

| File | Answers |
|------|---------|
| [`dependencies.graph`](#dependenciesgraph) | What is the shape of the whole library — nodes, edges, roots, leaves, cycles? |
| [`dependencies.byComponent`](#dependenciesbycomponent) | For one component: who depends on it, what does it depend on, and how are its props used? |

### dependencies.graph

The raw graph — the durable, diffable artifact. `summary` carries library-wide facts; `nodes` carries per-node degrees; `edges` is the full adjacency list with per-kind labels showing *where* each dependency occurs.

`roots` and `leaves` are disjoint: a root is depended on by nothing, a leaf depends on nothing, and a component that is neither — connected to nothing at all — is listed under `isolated` rather than in both. `cycles` is over instance edges only, since a slot constraint cannot form one.

```json
{
  "summary": {
    "components": 3,
    "externals": 1,
    "edges": { "instance": 3, "slot": 1, "example": 0 },
    "roots": ["dsCard"],
    "leaves": ["dsIcon"],
    "isolated": [],
    "cycles": []
  },
  "nodes": {
    "dsButton": {
      "external": false,
      "dependsOn": 1,
      "dependedOnBy": 1,
      "byKind": {
        "instance": { "dependsOn": 1, "dependedOnBy": 1 },
        "slot": { "dependsOn": 0, "dependedOnBy": 0 },
        "example": { "dependsOn": 0, "dependedOnBy": 0 }
      }
    }
  },
  "edges": [
    { "from": "dsButton", "to": "dsIcon", "kind": "instance", "elements": ["startIcon"], "count": 1 },
    { "from": "dsCard", "to": "Partner Logo", "kind": "instance", "elements": ["logo"], "count": 1 },
    { "from": "dsCard", "to": "dsButton", "kind": "instance", "elements": ["action"], "count": 1 },
    { "from": "dsCard", "to": "dsIcon", "kind": "slot", "slots": ["media"], "count": 1 }
  ]
}
```

### dependencies.byComponent

The blast-radius view — one entry per analyzed component, so answering "what breaks if this changes" is a single lookup with no traversal. `transitiveDependents` and `transitiveDependencies` map each indirect relation to its depth.

`propUsage` inverts the edges: for each of the component's props, how many configuration sites set it across all consumers (`configuredBy`), broken down per consumer and per value. A *site* is one configuration of the prop in one place — the consumer's `default` configuration, one of its `variants`, or one of its `slotContentExamples` — and each consumer's entry counts sites by section, so `{ "default": 1, "variants": 5 }` reads as "configured in the default and in five variants." Per-consumer `values` counts how many sites set each value.

Every declared prop appears — a prop with `configuredBy: 0` is never touched by any dependent, a strong signal when weighing a breaking change against its real usage. The `values` roll-up answers the reverse question — which consumers use a given value — when assessing a value-level change. Bound values are recorded as `$binding:<propName>` markers and slot fills as `$slotContent:<exampleName>`.

```json
{
  "dsIcon": {
    "directDependents": ["dsButton"],
    "transitiveDependents": { "dsCard": 2 },
    "directDependencies": [],
    "transitiveDependencies": {},
    "contractDependents": ["dsCard"],
    "contractDependencies": [],
    "propUsage": {
      "size": {
        "configuredBy": 2,
        "consumers": {
          "dsButton": { "default": 1, "variants": 1, "examples": 0, "values": { "Small": 2 } }
        },
        "values": { "Small": ["dsButton"] }
      },
      "appearance": {
        "configuredBy": 0,
        "consumers": {},
        "values": {}
      }
    }
  }
}
```

Here a change to `dsIcon` impacts `dsButton` directly and `dsCard` at depth 2; `dsCard` may also compose an Icon through its `media` slot. Button configures `size` in its default and one variant — but `appearance` is never configured, so changing its values touches no dependent.

## Visualizing the Graph

`dependencies.graph` maps mechanically onto a [Mermaid](https://mermaid.js.org) flowchart — each edge becomes an arrow, with dashed arrows for contract (slot/example) relations. Hand the JSON to an LLM and ask for exactly this, or generate it with a few lines of scripting, then paste into any Mermaid renderer:

```
flowchart TD
  dsCard --> dsButton
  dsCard --> PartnerLogo["Partner Logo (external)"]
  dsCard -. slot: media .-> dsIcon
  dsButton --> dsIcon
```

Reading the picture: `dsIcon` sits at the bottom (a leaf), `dsCard` at the top (a root), and the Icon blast radius is everything with a solid-arrow path down to it.

## Analyzing with an LLM

The aggregate files are structured for LLM input. The strongest use is a **change-impact report**: give a model the target component's `dependencies.byComponent` entry (plus the entries for its dependents — or the whole file, for small libraries), name the change you intend, and ask for exactly this structure:

```
# Change Impact Report — [Component]
[YYYY-MM-DD] · [change summary]

## Verdict
One paragraph: is this change safe, risky, or breaking — and for whom?

## Blast Radius
A table of every impacted component: name, depth, how it consumes the
changed component, and whether this change touches that usage.

## Safe Surface
Props and values in the change that no dependent configures — changes here
touch nothing.

## Verify Before Shipping
A checklist of the specific component + prop combinations to re-test,
ordered by depth.
```

Instruct the model to reference component and prop names directly, and to say so where the data cannot answer (runtime code usage, consumers outside this workspace) rather than guess.

The data files are the durable artifact — regenerated deterministically, diffable across runs. The report is a one-time snapshot: save it dated (`analysis/dependencies.report.YYYY-MM-DD.md`) and re-run against fresh data when the library moves. Agentic coding tools can automate the whole loop — regenerate the analysis, pull the relevant entries, produce the report — as a reusable skill or command in your workspace.

## See Also

- [Analyze overview](/cli/analyze/)
- [`props` analyzer](/cli/analyze/props/)
- [`styling` analyzer](/cli/analyze/styling/)
