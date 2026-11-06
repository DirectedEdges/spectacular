---
title: "curation"
description: "Which components of your library get a spec at all"
---

A library holds more components than a team actually consumes, and curation decides which ones are worth a spec. `specs scan` makes a first guess, writes it to a manifest as a checklist, and the team corrects it by hand; these three settings control how that guess is made, whether corrections survive the next scan, and how far the selection reaches.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `curation` |
| **Type** | block (`defaultSelection`, `preserveManualSelections`, `includeDependencies`) |
| **Default** | `READY_FOR_DEV`, `true`, `true` |

## Example

```yaml
curation:
  defaultSelection: READY_FOR_DEV
  preserveManualSelections: true
  includeDependencies: true
```

Every default matches what Spectacular does today.

## `defaultSelection`

| Value | What it selects |
|---|---|
| `READY_FOR_DEV` (default) | Components marked **Ready for dev** in Figma. If none are marked, every component set and standalone component instead. |
| `ALL` | Every component, marked or not. |

Most teams leave this alone. `ALL` suits a team that doesn't use Figma's dev status and wants everything, rather than relying on the fallback.

The per-run flag `--include-all` does the same as `ALL` for a single scan.

## `preserveManualSelections`

A component unchecked in the manifest may later be marked Ready for dev in Figma. This setting decides which record wins on the next scan.

| Value | Result |
|---|---|
| `true` (default) | The manual edit stands. |
| `false` | Figma wins. The new status overrides the manual edit. |

This only comes up when the Figma status actually changed. A component nobody touched keeps whatever was set, either way.

The default protects the edit, on the grounds that a correction the next scan discards was not worth making. Set it to `false` when the Figma status is the record you trust and the manifest is only a cache of it.

The per-run flag `--keep-checks` does the same as `true` for a single scan.

## `includeDependencies`

Components are built from other components — a web header places a brand logo, a payment form places the card-network marks. A header marked Ready for dev may depend on a logo nobody marked, an asset the design team maintains; generating only what is marked would produce a header spec that refers to a logo with no spec of its own.

| Value | Result |
|---|---|
| `true` (default) | The logo is generated too, along with anything it uses. |
| `false` | Only what is marked. |

**On:**

```
specs/
  dsWebHeader/
  dsBrandLogo/
```

**Off:**

```
specs/
  dsWebHeader/     # still says it uses dsBrandLogo, but no spec was written for it
```

### Parts are different

This doesn't apply to pieces already declared as parts. A naming convention that says `Card / _ / Header` belongs to Card — see [subcomponents](/settings/subcomponents/) — writes that header *inside* Card's spec rather than beside it. It was never going to get its own folder.

This setting is about one component reaching for a *separate* component that lives on its own.

## Narrowed selections

Turning `includeDependencies` off, or unchecking components by hand, can leave a spec referring to a component that was never generated. A hand-unchecked component stays unchecked across later scans, because `preserveManualSelections` defaults to `true`.

Nothing breaks loudly. No error, no failed build, no red Storybook. The generated React and Web Components code just leaves those pieces out — where the brand logo should appear, there is an empty box.

Narrow the selection deliberately, and expect to find the empty boxes.
