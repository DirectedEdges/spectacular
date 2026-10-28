---
title: "subcomponents"
description: "Configure subcomponent discovery, matching patterns, and exclusions"
---

Subcomponent organization and naming. A library fact: where a library keeps its subcomponents and how it names them are properties of the library, and a wrong declaration leaves subcomponents undiscovered — when present, the block enables subcomponent detection; when absent, the library declares no subcomponent convention and none are detected.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `subcomponents` |
| **Type** | block (`scope`, `match`, `exclude`) |
| **Default** | absent (no subcomponent convention) |

## Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `scope` | `"NESTED"` \| `"PAGE"` | No | `NESTED` | Where the library keeps subcomponents. `NESTED` = component anatomy only; `PAGE` = also search the Figma page |
| `match` | `string[]` | Yes | — | Template patterns using `{C}` (component name) and `{S}` (subcomponent name) placeholders |
| `exclude` | `string[]` | No | — | Template patterns to exclude from matches. Same `{C}/{S}` syntax |

An asset must match at least one `match` pattern to be considered a subcomponent. If it also matches an `exclude` pattern, the exclusion wins regardless of discovery source.

## Example

```yaml
subcomponents:
  scope: PAGE
  match:
    - '{C} / {S}'
    - '{C} / _ / {S}'
  exclude:
    - '{C} / Examples / {S}'
```

## Result

Matched assets are harvested into a `subcomponents` registry on the component. Below is a narrow slice of the `DS Alert` output: the `DS Alert / Actions` subcomponent, discovered via a `{C} / {S}` pattern.

```json
{
  "title": "DS Alert",
  "subcomponents": {
    "actions": {
      "title": "DS Alert / Actions",
      "anatomy": {
        "root": { "type": "container" },
        "children": { "type": "slot" }
      },
      "props": {
        "children": { "type": "slot" }
      }
    }
  }
}
```

Without `subcomponents`, the registry is absent and these nested components are not detected.

## Pattern matching rules

Five rules, and they hold everywhere a pattern is read.

**1. `{S}` matches everything after it, including `/`.**

`{C} / {S}` matches `DS Card / _ / Header`, with `{S}` = `_ / Header`.

**2. Where the parent isn't known, `{C}` fills exactly one segment.**

This is the case when a pattern is checked against a name on its own, with no particular component in mind. `{C} / Examples / {S}` does **not** match `DS Slider /_ / Examples / Steps` — `{C}` can't stretch across the `/` to cover `DS Slider /_`.

**3. Where the parent is known, `{C}` is that name exactly, slashes included.**

Asking whether `DS Asset / Mark / Flag / Icon` belongs to `DS Asset / Mark / Flag`, `{C}` is the whole three-segment name.

**4. Every character outside `{C}` and `{S}` matches exactly — spaces and slashes included.**

`{C} / _ / {S}` matches `DS Card / _ / Header` but not `DS Button /_ / End Visual`. If your library spells the separator both ways, declare a pattern for each:

```yaml
subcomponents:
  match:
    - '{C} / {S}'
    - '{C} / _ / {S}'
    - '{C} /_ / {S}'
```

Case is the one thing not significant.

**5. When more than one `match` pattern hits, the first one listed wins, and it names the part.**

With `match` ordered `{C} / {S}` then `{C} / _ / {S}`, `DS Card / _ / Header` gives a part named `_ / Header`. Reversing the order gives `Header`. List your most specific patterns first.

## Further reading

- [Subcomponents guide](/guides/subcomponent-scoping/) for detailed patterns and strategies.
- [Schema: Subcomponents](/schema/subcomponents/) for the subcomponent schema reference.
