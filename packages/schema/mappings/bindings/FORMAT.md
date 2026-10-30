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
"autoLayout": {
  "disposition": "bound",
  "keys": ["layoutMode", "mainAxisAlignment", "crossAxisAlignment", "wrap", "wrapAlignment", "itemSpacing"],
  "outputs": ["display", "flex-direction", "justify-content", "align-items", "flex-wrap", "gap"],
  "resolution": "layoutMode selects the axis and gates the rest; with it absent the cluster emits nothing.",
  "partial": "What happens when some keys are present and others absent.",
  "notes": null
}
```

| Field | Meaning |
|---|---|
| `keys` | Every spec key participating. Each must also appear in `concepts.styles` with `cluster` naming this one |
| `outputs` | Every output the cluster can produce — not a per-key mapping, because there isn't one |
| `resolution` | The rule deciding which outputs appear. The actual content of the mapping |
| `partial` | Behaviour on a partially present cluster. This is where real documents fail, so it is required |

Cross-referencing both ways is what keeps the format honest: a key cannot quietly drop out of the table by being "handled elsewhere", and a cluster cannot claim a key the table does not agree it owns. `build-mappings.mjs` enforces both directions.

## Why not model every output per key

Because it would be false. Writing `mainAxisAlignment → justify-content` is wrong half the time — under a column layout it is `align-items`. A table that states it anyway is worse than one that admits the key is cluster-resolved, because a reader implementing from it ships the bug.

The cluster section costs more to author and is the only form that can be true.

## `defaults` — what an absent key means

A spec omits a style key for at least three different reasons, and a consumer cannot tell them apart from the document alone:

1. The value equalled a default and was dropped at generation.
2. It is a variant that inherits from `default` under layering.
3. The element type cannot carry it.

Only the second is recoverable by a consumer, by reading `default`. The first requires a declared default, and that is what this section is for:

```json
"defaults": {
  "layoutMode": { "assumed": "NONE", "declaredBy": "...", "platformBehaviour": "..." }
}
```

| Field | Meaning |
|---|---|
| `assumed` | The value a consumer assumes when the key is absent, or `null` for "apply nothing" |
| `declaredBy` | Where that default comes from. `"none"` means nobody has declared it — a gap, not a value |
| `platformBehaviour` | What this platform actually does on absence, which may differ from `assumed` |

An entry whose `declaredBy` is `"none"` is a finding: the platform is guessing, and two platforms may guess differently. Those are the rows worth arguing about.

## Evaluation versus post-processing

A mapping is not always a direct read of one Figma property. Some spec keys are produced by a later pass — collapsed, diffed against a parent, or removed — and a binding that presents them as direct reads misleads anyone implementing a second time.

Where a key is post-processed rather than read, `notes` says so and names the stage.
