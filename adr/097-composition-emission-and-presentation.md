# ADR: A Composition Emits One Story in Its Own Nav Group, and Only Under Pro

**Branch**: `feature/compositions-cli`
**Created**: 2026-09-29
**Status**: ACCEPTED
**Summary**: A composition emits exactly one `Default` story under its own `Compositions` nav group in both targets, with the sticker sheet suppressed by kind and the whole kind skipped on free tier rather than degraded.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

ADR-095 makes a composition appear in the manifest; ADR-096 gives its spec a home. What
neither settles is what the React and Web Components targets *emit* for one, and how it
presents in Storybook.

A composition is structurally unlike a component in three ways that all bear on this:

| | Component | Composition |
|---|---|---|
| Variant axes | usually several | none — a frame has no variant properties |
| Prop surface | a contract | empty — the engine returns no props for a frame |
| What it is for | reuse | showing an arrangement of things that are reused |

The existing story emission is built around the first two. A component gets a Default
story, a story per variant-prop axis, and — under Pro — a sticker sheet across the full
variant matrix. Run that machinery over a spec with no variants and no props and it
produces one Default story and a sticker sheet of a single cell, which is a sticker sheet
in name only.

The nav is a flat namespace under one prefix: `React/<Title>`, where the title is derived
from the Figma name with separators normalized. A composition's Figma name carries its own
path — a screen named for a product area and a breakpoint — so dropped into the same
namespace it interleaves with components alphabetically and the nav stops being a
component list.

The Pro seam is already in these packages: `proEntitled` gates composition, glyphs and
images, and the free tier writes a note into the emitted file saying what it withheld
rather than leaving the absence silent. "Composition" is named in that seam's own
description today, which is the entitlement this ADR spends.

---

## Decision Drivers

- **A composition is one thing, shown once.** With no axes to vary, more than one story is
  more than there is to say.
- **Components and compositions are browsed differently.** A person looking for a
  component and a person looking at a screen are doing different things, and the nav
  should not make them share a list.
- **No new story machinery.** Whatever a composition emits should fall out of the existing
  emission with the parts that cannot apply switched off — not a parallel code path.
- **The two targets stay in lockstep.** React and Web Components are peer implementations;
  a decision made for one is made for both, in the same shape.
- **Withholding is stated, never silent.** The free tier already says what it did not
  emit. A skipped composition must be as visible as a reduced story set.
- **A composition imports real components.** Its scaffold references the components it
  composes, which under ADR-096 sit at a different depth — so the import must be derived,
  not assumed.

---

## Options Considered

### Option A: One story, own nav group, skipped on free *(Selected)*

A `Compositions` nav group of its own in each target, one `Default` story, no sticker
sheet. On the free tier the composition is not emitted at all, and the run says so.

**Pros**:
- The single story is what the existing emission already yields for a spec with no axes —
  the only addition is suppressing the sticker sheet, which is a guard, not a code path.
- One inserted title segment gives the nav group; Storybook's nesting is derived from the
  title, so there is nothing else to build.
- The skip is the honest free-tier behaviour: a composition with its components stripped
  out is not a degraded composition, it is an empty frame.

**Cons / Trade-offs**:
- A free-tier user who marks a frame ready for dev gets a spec but no emitted output, and
  learns why only from the run's note.
- `Compositions` becomes a reserved first segment: a component whose title starts with it
  would land in the same group. Acceptable — the same is already true of the target prefix.

---

### Option B: Compositions in the same nav namespace as components *(Rejected)*

`React/<Name>`, no group.

**Rejected because**: it puts screens in the component list, ordered among components by
name. Violates *components and compositions are browsed differently*, and it gets worse
with every composition added.

---

### Option C: Emit a flat container on free instead of skipping *(Rejected)*

On the free tier, emit the composition's frame as a bare container with its children
omitted.

**Rejected because**: the output would be a styled empty box named after a screen —
indistinguishable from a bug, and worse than nothing for the person looking at it. A note
saying "not emitted, Pro required" carries strictly more information.

---

## Decision

### Stories

| Aspect | Decision |
|---|---|
| Nav title | `Compositions/<Name>` in React, `Web Components/Compositions/<Name>` in the sibling — each target's own root, not a new one |
| Story count | exactly one, `Default` |
| Per-axis stories | none — a frame declares no variant props, so none are generated |
| Sticker sheet | suppressed by kind, not by emptiness |

The sticker sheet is suppressed because the spec is a composition, not because the variant
matrix came out with one cell. A guard on the kind states the rule; a guard on the count
would silently start emitting a sheet the moment anything gave a frame an axis.

React's group sits at the top level rather than under a `React/` prefix, because React has
no such prefix — its components are titled `Components/<Name>`. The Web Components tree
does prefix its own root, so its compositions sit inside it. Each target gives the group
the same position relative to its own components, which is what keeps the two in lockstep;
titling React's group `React/Compositions/<Name>` would have nested screens one level
deeper than its components rather than beside them. The scaffolded `storySort` order lists
`Compositions` after `Components` so the sidebar reads in that order.

### Emitted location

`<tree>/src/compositions/<PascalName>/`, per ADR-096, mirroring the spec layout. The
scaffold's imports of the components it composes resolve across that boundary —
`../../components/<Name>` rather than `../<Name>` — and are derived from the resolved
paths rather than written as a literal, so a depth change cannot leave them stale.

Both emitted trees must pass `transform-verify-imports.mjs`, which is what turns a depth
mistake into one line of error instead of a dead Storybook instance.

### Free and Pro

Compositions are Pro. On the free tier the emitters skip every composition spec and the
run reports it once:

```
⚠ 10 compositions skipped — Pro required. Components emitted as normal.
```

Once, not per composition: the list is not the finding, the entitlement is. Component
emission is unaffected, so a free-tier run over a workspace containing compositions still
succeeds and still emits everything it is entitled to.

The composition's *spec* is generated on either tier. Generating is reading a library;
emitting code from it is the entitled step, which is where the seam already sits.

---

## Type ↔ Schema Impact

- **Symmetric**: N/A — no `@directededges/specs-schema` type or JSON schema changes.
  Emission targets and nav titles are properties of the emitter packages.
- **Parity check**: the emitters read `metadata.source.nodeType` and the kind the CLI
  passes; neither is new.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `react-from-specs` | New nav group, single story, sticker-sheet guard, Pro skip | Implement; derive composition→component imports from resolved paths |
| `webcomponents-from-specs` | The same, mirrored | Implement in lockstep |
| `specs-cli` — react / webcomponents | Reports the skip count | Surface the free-tier note in the run output |
| Storybook instances | A `Compositions` group appears under each target | None |
| Free-tier workspaces | Compositions produce specs but no code | None — behaviour is reported per run |

---

## Semver Decision

**Target version**: `0.32.0` — `@directededges/specs-cli` on the active release branch,
with matching changes in `@directededges/react-from-specs` and
`@directededges/webcomponents-from-specs`.

**Change class**: `MINOR` — new emission for a kind of spec that could not previously
exist. No component's emitted output changes.

**Justification**: additive for every existing spec; the only behaviour that changes is
behaviour for inputs no prior release could produce.

---

## Consequences

- Compositions browse as their own group in both Storybook targets, and the component
  list stays a component list.
- The sticker sheet is suppressed by a rule about kind, so giving frames an axis later
  changes emission deliberately rather than as a side effect.
- Composition→component imports are the first emitted references to cross a depth
  boundary, which makes `specsRoot` (ADR-096) load-bearing rather than tidy.
- The free tier gains a visible boundary it did not have: a workspace can hold specs it
  cannot emit, and the run says so every time.
- `Compositions` is reserved as a nav segment under each target prefix.
