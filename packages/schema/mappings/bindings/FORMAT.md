# Binding declaration format

How a `mappings/bindings/<platform>.json` file is shaped, and why.

The generated page is `mappings/<PLATFORM>.md`. Edit the JSON, never the page.

## The problem a flat table cannot solve

A one-row-per-key table assumes each spec style key maps to its own output independently. That holds for most keys and fails for the ones that matter most.

Three relationship shapes have to be expressible:

| Shape | Example |
|---|---|
| One key → one output | `opacity` → `opacity` |
| One key → several outputs | `padding` → four CSS longhands, or one shorthand |
| **A group of keys → a group of outputs, jointly** | `layoutMode` + `mainAxisAlignment` + `crossAxisAlignment` + `wrap` + `wrapAlignment` + `itemSpacing` → `display` + `flex-direction` + `justify-content` + `align-items` + `flex-wrap` + `gap` |

The third is the hard one. No single key in that group determines any single declaration: `mainAxisAlignment: CENTER` becomes `justify-content: center` under a row layout and `align-items: center` under a column one, and means nothing at all with no `layoutMode`. Absolute positioning is the same story with a different cluster — `position` plus the four inset keys plus the two centre offsets.

So the format carries **two** sections, and a key appears in exactly one of them.

## `concepts.styles` — independent keys

```json
"opacity": {
  "disposition": "bound",
  "target": "node.opacity",
  "elements": ["component", "frame", "..."],
  "notes": "A TokenReference binds the variable; otherwise the raw number is written."
}
```

| Field | Meaning |
|---|---|
| `disposition` | `bound` \| `approximated` \| `unsupported` \| `unverified` (§11.1) |
| `target` / `module` | What realises it. Figma declares a node property; React declares the emitting module |
| `elements` | Which element types carry it. Figma only — transcribed from the writer's declared key table |
| `notes` | Degradation, ordering constraints, and anything a consumer needs. Required when the disposition is `approximated` or `unsupported` |
| `cluster` | Present instead of `target` when the key belongs to a cluster. Names it |

## `concepts.styleClusters` — keys that resolve jointly

```json
"autoLayoutSizing": {
  "disposition": "bound",
  "form": "cases",
  "keys": ["layoutSizingHorizontal", "layoutSizingVertical"],
  "inputs": [
    { "ref": "self.layoutSizingHorizontal", "from": "document" },
    { "ref": "parent.layoutMode", "from": "document (ancestor)" },
    { "ref": "context.isInstance", "from": "emitter context" }
  ],
  "derived": {
    "crossStretches": {
      "expression": { "operation": "all", "args": [ /* … */ ] },
      "source": "layoutToCSS.ts:130-131"
    }
  },
  "cases": [
    { "when": { "operation": "equals", "args": { "value": "self.layoutSizingHorizontal", "compareTo": "FILL" } },
      "emit": ["width: 100%"] }
  ],
  "otherwise": { "emit": [], "why": "FIXED or absent contributes nothing" }
}
```

| Field | Meaning |
|---|---|
| `form` | `cases` or `prose`. A `prose` cluster is unconverted debt and renders with a warning |
| `keys` | Every spec key participating. Each must also appear in `concepts.styles` with `cluster` naming this one |
| `inputs` | Every fact the cluster may read, and where it comes from. Finite and visible by declaration |
| `derived` | Named sub-predicates, each with the source line it came from. Keeps a case readable without hiding it |
| `cases` | Ordered; first match wins. Each carries `when` and `emit` |
| `otherwise` | What happens when no case matches |

Predicates reuse this contract's `ConditionExpression` vocabulary — `operation` with `args` — because `operation` is a deliberately open string (DSPEC-28). `all`, `any` and `not` join the built-in `equals`, `notEquals`, `isNull` and `isNotNull`.

The operand space differs from a spec `Conditional`'s, and the difference is declared rather than glossed: a `Conditional` tests a `PropBinding` into `#/props/*`; a binding case tests a style fact on `self`, `parent`, `derived`, or the emitting `context`.

Cross-referencing both ways is what keeps the format honest: a key cannot quietly drop out of the table by being "handled elsewhere", and a cluster cannot claim a key the table does not agree it owns. `build-mappings.mjs` enforces both directions.

## Why not model every output per key

Because it would be false. Writing `mainAxisAlignment → justify-content` is wrong half the time — under a column layout it is `align-items`. A table that states it anyway is worse than one that admits the key is cluster-resolved, because a reader implementing from it ships the bug.

The cluster section costs more to author and is the only form that can be true.

## Defaults are not here

A binding declares what a platform does with a **value**. What an absent key means is not a platform's choice, so a binding never declares it (DSPEC-46).

Since ADR-113, every property of `Styles` carries a `default` in `styles.schema.json`, and that is the single source. `_defaults.json` is a generated summary of those declarations, published as `DEFAULTS.md` — it cites the schema and decides nothing.

A default answers only one of the three reasons a key can be absent. The other two — a variant inheriting under layering, and an element type that cannot carry the key — remain unmarked in a document. `DEFAULTS.md` states that gap rather than papering over it.

## Why cases, not prose

An earlier draft of this format gave each cluster a `resolution` sentence. That was inference wearing determinism's clothes: "emits nothing when the parent cross-stretches" cannot be checked, and a reader implementing from it is guessing at the boundaries.

A case table has boundaries. Each case names its predicate and the exact outputs it emits; the order is the precedence; `emit: []` is a claim that nothing is emitted, which is different from having said nothing. The operand set is declared up front, so the facts a cluster may consult are finite and visible — a case referencing something outside that set is a defect the reader can see.

It is also testable, which prose never was: synthesize a document matching a case's predicate, run the platform's transform, and compare against `emit`. That test does not exist yet; the format is what makes it possible.

## Evaluation versus post-processing

A mapping is not always a direct read of one Figma property. Some spec keys are produced by a later pass — collapsed, diffed against a parent, or removed — and a binding that presents them as direct reads misleads anyone implementing a second time.

Where a key is post-processed rather than read, `notes` says so and names the stage.
