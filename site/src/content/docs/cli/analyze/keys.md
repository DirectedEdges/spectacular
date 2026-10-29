---
title: "keys"
description: "List the Figma layer and property names a formatted key cannot reconstruct, organized as a per-component checklist"
---

Reads every component's `api.yaml` and produces `analysis/keys.yaml`: every Figma layer and property name that falls outside the [safe key grammar](/guides/key-formatting/), grouped by component so it reads as a checklist, then by cause and by frequency.

## Requires a declared convention

This analyzer reports names the producer recorded in `$extensions['com.figma'].name`, which only happens when [`figma.naming`](/settings/figma-keys/) declares a source convention:

```yaml
# config/conventions/figma.yaml
naming: SENTENCE
```

Under the default `NONE`, no convention is declared, no names are recorded, and this report is empty. That is correct rather than a failure — nothing has diverged from a convention you never stated.

## Use When

- You want a per-component list of Figma names to tidy, in the order a designer would work through them.
- You want to find a badly-formed name that repeats across the library, where one rename fixes dozens of specs.
- You want to see which kinds of naming problem dominate before deciding what to fix first.
- You want to confirm a naming cleanup actually landed, by diffing the aggregate between runs.

## Invocation

```bash
specs analyze keys
```

## Output

Writes a single file to `analysis/` after all components are processed.

```
specs/
  analysis/
    keys.yaml   # cross-library aggregate
  ds-button/
    api.yaml
  ds-alert/
    api.yaml
```

## Sections

### summary

Counts for the library as a whole, and the distribution of causes.

```yaml
summary:
  namingConvention: SENTENCE
  measured: true
  totalComponents: 69
  componentsWithDivergence: 52
  totalNames: 948
  divergentNames: 75
  causeDistribution:
    mixed-letter-digit: 42
    casing: 28
    symbol: 2
    separator: 1
    digit-initial: 1
    already-a-key: 1
```

**Read `measured` before any of the counts.** Without a declared `naming` convention there is nothing to measure names against, so every name passes and `divergentNames` is `0` however the library is named — which is indistinguishable from a library that round-trips perfectly. `measured: false` and `namingConvention: null` say which it is, in the file rather than only in the terminal that produced it:

```yaml
summary:
  namingConvention: null
  measured: false
  totalNames: 490
  divergentNames: 0
  causeDistribution: {}
```

Declare `naming` in `config/conventions/figma.yaml` to make the check run.

### byComponent

The checklist. Names are grouped under the component they belong to, because that is the unit a designer opens and edits.

```yaml
byComponent:
  dsAlert:
    divergent: 1
    props:
      - key: fullBleed
        figmaName: Full Bleed
        cause: casing
  dsAvatar:
    divergent: 2
    props:
      - key: a11yLabel
        figmaName: A11y label
        cause: mixed-letter-digit
    anatomy:
      - key: startIcon
        figmaName: Start Icon
        cause: casing
```

Names appear under `props` (component property names) or `anatomy` (layer names). A surface with nothing to fix is omitted.

### byCause

The same names grouped by what is wrong with them, most common first. Useful for deciding what to fix in bulk: a library with 28 casing problems and 2 symbol problems has one systemic issue and two one-offs.

```yaml
byCause:
  - cause: casing
    occurrences: 28
    names:
      - Alternate Half
      - Children minItems
      - DS Bottom Sheet
```

### byName

Each distinct Figma name with the components it appears in, most frequent first. This is the counterweight to the per-component checklist — a name wrong in forty components is one decision, not forty.

```yaml
byName:
  - figmaName: A11y label
    occurrences: 42
    components:
      - dsAvatar
      - dsBadge
      - dsButton
    cause: mixed-letter-digit
```

## Causes

| Cause | Meaning | Example |
|-------|---------|---------|
| `separator` | Leading, trailing, or repeated spaces | `Label   ` |
| `symbol` | A character outside letters, digits, and single spaces | `Cut & paste` |
| `non-ascii` | A non-ASCII character | `Étiquette` |
| `mixed-letter-digit` | Letters and digits share a word, so the boundary is lost | `A11y label` |
| `digit-initial` | The name begins with a digit | `0000 0000 0000 0000` |
| `casing` | Characters are fine, but casing diverges from the declared convention | `Start Icon` under `SENTENCE` |
| `already-a-key` | Not a defect — a name authored in a key convention rather than as a display name | `x-figmacollapse` |

A name is reported under the most specific cause that applies, since that is the edit to make. `already-a-key` is listed last because it is a deliberate authoring choice, not a problem: such names are [retained as authored](/guides/key-formatting/#names-already-written-as-keys).

## Fixing What It Finds

Nothing here is a validation failure. Every name it lists is fully supported — its Figma name is recorded, so the spec round-trips correctly either way. The report exists so naming can be tidied at the source, which makes the extensions disappear and the specs smaller.

Two things worth knowing before a cleanup:

- Renaming a layer or property in Figma changes the spec key too, which is a breaking change for anything consuming that key.
- The report cannot see names in a catalog that has never declared `figma.naming`. Declare a convention first, generate, then analyze.

## See Also

- [Key Formatting guide](/guides/key-formatting/) — the safe key grammar and what happens to unsafe names
- [Figma Keys](/settings/figma-keys/) — declaring the source convention this analyzer depends on
- [Analyze overview](/cli/analyze/) — options shared by every analyzer
