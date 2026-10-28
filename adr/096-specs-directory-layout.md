# ADR: The `specs/` Directory Names What Kind of Thing Each Folder Is

**Branch**: `feature/compositions-cli`
**Created**: 2026-09-29
**Status**: ACCEPTED
**Summary**: `specs/` gains a directory per kind — `components/`, `compositions/`, `analysis/` — with one resolver owning the layout and `TransformerContext` gaining `specsRoot` and `kind` so nothing climbs paths to find its depth.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A workspace's `specs/` directory is flat. Every child is a component's spec folder, named
by its camelCase key, except for two things that are not components:

```
specs/
  latest.metadata.yaml      run facts (ADR-089)
  _analysis/                analyzer reports
  actionList/               a component
  alert/                    a component
  … 76 more
```

The underscore on `_analysis` is load-bearing: it is what keeps the analysis directory
from being read as a component whose key happens to be `analysis`, and every reader of
the directory encodes that convention independently — the emitter walk filters for a
child containing `api.yaml`, the version assembler filters out names starting with `_` or
`.`. Two different rules, in two places, for the same question.

Compositions (ADR-095) now need somewhere to go, and every option puts pressure on this
layout:

- Flat, beside components, distinguished only by `metadata.source.nodeType: FRAME`. A
  composition named the same as a component collides, and there is no room to resolve it.
  Browsing mixes two kinds of thing with no way to tell them apart without opening files.
- `specs/_compositions/`. No break to the existing layout, and the underscore cannot
  collide with a component key — but it extends the convention that a leading underscore
  means "not a component", which is exactly the convention that already costs two
  divergent filters.

Both work. Both leave the flat directory's real problem in place: the directory's shape
does not say what is in it, so every consumer has to know, and each one knows slightly
differently.

---

## Decision Drivers

- **A directory should name what it holds.** A reader opening `specs/` should learn the
  kinds of thing a run produced without opening a file or knowing a convention.
- **No collision between kinds.** A component and a composition may legitimately share a
  name. The layout must make that a non-event.
- **One rule, one place.** Which directory holds what must be resolved by a single
  module, not re-derived by each reader with its own filter.
- **Existing workspaces keep working.** There are populated workspaces on the flat
  layout. A release that makes them unreadable, or silently emits half-correct output
  against them, is not acceptable.
- **The emitted trees mirror the spec trees.** A reader who understands `specs/` should
  be able to predict `react/src/`.
- **Nothing derives a path by climbing.** The emitters find the specs root today by
  walking up a fixed number of levels from their own output directory. Any change to
  output depth breaks that silently, which is exactly what this ADR changes.

---

## Options Considered

### Option A: Named subdirectories per kind *(Selected)*

```
specs/
  latest.metadata.yaml
  analysis/
  components/<key>/
  compositions/<key>/
```

**Pros**:
- The directory names its contents. `components` and `compositions` are the two kinds of
  thing a spec run produces, and `analysis` is the reports about them.
- The collision problem disappears by construction, rather than by a naming convention
  that has to be defended.
- `_analysis` loses its underscore, because nothing can collide with it any more — and
  with it goes the "leading underscore means not-a-component" convention, so both
  divergent filters are replaced by one resolver.
- Mirrors cleanly into the emitted trees, which already use
  `<tree>/src/components/<Component>/`: compositions become
  `<tree>/src/compositions/<Component>/` with no new idea.

**Cons / Trade-offs**:
- It is a breaking change to the layout. Every consumer of `specs/` — in this repo, in
  the emitter packages, and in any consumer outside them — learns a new shape.
- One more level of nesting on every path a human types.

---

### Option B: `specs/_compositions/`, components stay flat *(Rejected)*

**Rejected because**: it is the cheaper change and buys the smaller half of the benefit.
Collisions are solved; the directory still does not name what it holds, `_analysis` keeps
its underscore, and the two divergent filters stay. It also leaves the asymmetry that one
kind of spec is at the root and the other is one level down, which the emitted trees
would then have to reproduce or deliberately break.

---

### Option C: Flat, distinguished only by `metadata.source.nodeType` *(Rejected)*

**Rejected because**: it admits an unresolvable collision between a component and a
composition of the same name, and it makes the kind of a spec folder invisible until a
file inside it is parsed. Violates *no collision between kinds*.

---

## Decision

### The layout

```
specs/
  latest.metadata.yaml          run facts — root, unchanged (ADR-089)
  analysis/                     analyzer reports, formerly `_analysis/`
  components/
    actionList/                 api.yaml, variants.yaml, examples.yaml
  compositions/
    checkoutSmall/              api.yaml, variants.yaml, examples.yaml
```

`latest.metadata.yaml` stays at the root, in **one copy**, because it is the *run's*
facts — not any one kind's. A composition and a component produced by the same run share
them.

A copy inside each kind directory was considered, on the argument that the run document
describes `components/` and `compositions/` but not `analysis/`, which a different command
writes. Rejected: `analysis/` never reads the run document, so the root placement was
never a claim about it, and two byte-identical copies can drift the moment anything writes
one and not the other. ADR-089's point is that the run states its facts *once*.

That placement did expose a real defect. `RunMetadataFile.find()` searched a spec's own
directory and one level above it — enough when a spec sat at `specs/<key>/`, one level
short once it sits at `specs/components/<key>/`, and two short for a subcomponent. Render
silently lost the run facts. The reader now climbs a bounded number of levels, nearest
document winning; bounded rather than walked to the filesystem root, because adopting an
unrelated document from somewhere above the workspace is a worse failure than finding
none.

The concern split inside a spec folder is unchanged, and identical for both kinds. A
composition's spec is a spec: `api.yaml` with `metadata.source.nodeType: FRAME`, and
`variants.yaml` only when there is something to put in it — a frame has no variant axes,
so in practice there is not.

### The emitted trees

```
react/src/components/<PascalName>/
react/src/compositions/<PascalName>/
```

and the same under `webcomponents/`. A transformer's `outputTree` declaration is
unchanged; what changes is that the segment between `src` and the component directory is
now derived from the spec's kind rather than hardcoded to `components`.

### Folder naming is one derivation, not two

The kind directory is the only thing this ADR adds to a path. How the folder *inside* it
is named is unchanged, and it is the same for both kinds:

| Tree | Folder name | Example |
|---|---|---|
| `specs/components/`, `specs/compositions/` | the camelCase spec key | `specs/compositions/checkoutSmall/` |
| `react/src/components/`, `react/src/compositions/` | the PascalCase component name | `react/src/compositions/CheckoutSmall/` |

Both lines already held for components, and a composition takes them verbatim — the
authored hub is keyed, the emitted tree is named for the symbol a consumer imports. A
kind-specific casing rule would mean a reader has to know which kind a folder holds before
they can predict its name, which is the cost this layout exists to remove.

### One resolver, and the end of path climbing

A single module owns every fact in this ADR: where each kind lives, how a spec folder is
recognised, and how a legacy layout is read. No consumer re-derives it.

`TransformerContext` gains two members so that emitters stop inferring location from
their own position:

| Member | Meaning |
|---|---|
| `specsRoot` | absolute path to the `specs/` directory this run read from |
| `kind` | `'component'` or `'composition'` — what the spec being emitted is |

Today an emitter finds the specs root by walking up three levels from
`<workspace>/<tree>/src/components/<Component>`. That arithmetic is correct only for one
output depth, and this ADR introduces a second. `specsRoot` replaces the climb with the
path the CLI already knows, and sibling-contract lookups resolve against
`specsRoot/components/<key>/` explicitly.

### Legacy flat layouts

A reader resolves the layout once, from the directory itself:

| Condition | Resolution |
|---|---|
| `specs/components/` exists | **Current layout.** `components/` and `compositions/` are the authority. Spec folders at the root are ignored entirely — not merged |
| `specs/components/` absent, spec folders at the root | **Legacy layout.** Root folders are read as components; no compositions exist; analysis reads and writes `analysis/` — `_analysis/` is retired, not honoured. One deprecation line per run |
| Neither | Empty — the existing "run `specs generate` first" error |

Root folders are *ignored*, not merged, in the current layout. A workspace mid-migration
would otherwise emit one component from two sources with no way to say which won, and a
stale root folder would resurrect a component a rename had retired.

Writers only ever write the current layout. A `specs generate` run against a legacy
workspace produces `components/`, after which the run's own root folders become ignored
leftovers — so the same run prints what to delete rather than deleting spec files it did
not write.

Orphan pruning is authoritative per kind: a full run prunes
`<tree>/src/components/` against its components and `<tree>/src/compositions/` against its
compositions, never one against the other — and never a kind the run did not emit, which
is the same rule a `--components` run and a license-aborted run already obey. Without it,
a free-tier run deletes the composition output a Pro run wrote and reports it as having no
matching spec, when the spec is present and only the entitlement was missing.

### The collapsing layouts

`--combine-as-library` and `--combine-concerns` collapse a catalogue into documents keyed
by spec key. They still do — but per kind. The collapsing happens *within* a kind, and
each kind's documents land in its own directory:

```
specs/
  latest.metadata.yaml
  components/
    api.yaml
    variants.yaml
  compositions/
    api.yaml
    variants.yaml
```

The alternative was one shared namespace, since those layouts have no per-spec directory
to put a kind in. It was rejected: a composition and a component of the same name would
overwrite each other with write order deciding which survived, and a shared name being a
non-event is the whole point of this ADR. A layout flag chooses how a kind's specs are
grouped, not whether kinds are distinguished.

### What reads which kind

Not every consumer of the specs directory wants both kinds, and the difference is not
about the layout — it is about what a composition is:

| Consumer | Reads | Why |
|---|---|---|
| `react`, `webcomponents` | both | a composition is the thing being emitted |
| `analyze dependencies` | both | which components a screen composes is the clearest blast-radius data a library has |
| `analyze styling` | both | a composition carries real styling of its own |
| `analyze props`, `analyze keys` | components only | a composition declares no props; padding the reports with rows empty by construction dilutes every per-component figure |
| `version` | both, graded differently | see below |

A transform declares this for itself (`readsKinds`), defaulting to components only — so a
consumer that has not considered compositions does not silently receive them.

### Versioning a composition

Compositions enter the version ledger, and **every change to one is patch-class**.

A composition declares no contract. There is nothing a consumer can depend on and nothing
for a rule like "a removed prop is breaking" to grade, so the existing severity rules have
no opinion about it. Rather than invent a parallel vocabulary, every composition entry is
set to patch impact after diffing — not re-graded — so the report and the version roll-up
cannot disagree, and a reader never sees an entry marked breaking that contributed a patch.

Compositions carry **no version of their own**. They appear in the cut report with what
moved (`added`, `removed`, `changed`) and no version transition, because a thing with no
contract has no semver to carry. Their map is keyed separately from components', since a
name shared between the two kinds is legal by design and one map would let them overwrite
each other.

---

## Type ↔ Schema Impact

- **Symmetric**: N/A — no `@directededges/specs-schema` type or JSON schema changes. The
  directory layout is a CLI artifact, and `Settings.spec.directory` continues to name the
  `specs/` root, whose internal shape is fixed rather than configured.
- **Parity check**: spec document content is untouched. `metadata.source.nodeType` remains
  the contract for what a spec describes; the directory is navigation, not identity.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` — generate | Writes the new layout | Route spec output by kind through the resolver |
| `specs-cli` — react / webcomponents | Discovers specs, derives output paths, prunes orphans | Read through the resolver; pass `specsRoot` and `kind` |
| `specs-cli` — analyze | Writes `analysis/` | Drop the underscore |
| `specs-cli` — render | Reads the run document from a deeper spec folder | `RunMetadataFile.find()` climbs to the specs root instead of stopping one level up |
| `specs-cli` — version | Assembles both kinds; compositions graded patch-only and unversioned | Read through the resolver instead of its own `_`/`.` filter |
| `specs-cli` — analyze | Dependencies and styling read both kinds | Declare `readsKinds` per analyzer |
| `react-from-specs`, `webcomponents-from-specs` | Stop climbing to the specs root | Consume `specsRoot`; resolve siblings under `components/` |
| Populated workspaces on the flat layout | Read as legacy, with a deprecation line | Re-run `specs generate`, then delete the reported leftovers |

---

## Semver Decision

**Target version**: `0.32.0` — `@directededges/specs-cli` on the active release branch.

**Change class**: `MAJOR` — the on-disk layout a run produces changes, and a consumer
reading `specs/*/api.yaml` finds nothing.

**Justification**: output shape is part of the contract. The legacy read path keeps
existing workspaces working, which makes the change survivable, not additive.

---

## Consequences

- `specs/` states what a run produced. A reader learns the kinds without a convention.
- A component and a composition may share a name with no consequence.
- The "leading underscore means not a component" convention is retired, and the two
  divergent filters that implemented it are replaced by one resolver.
- Emitters no longer compute the specs root from their own depth, so output depth becomes
  a free variable rather than a coupling — which is what lets compositions emit at a
  different depth at all.
- A workspace on the flat layout keeps emitting until it is regenerated, and is told once
  per run that it should be.
- Any external tool reading `specs/<key>/api.yaml` breaks and must read
  `specs/components/<key>/api.yaml`. Anything reading `latest.metadata.yaml` beside a
  spec must look further up — it is still one copy, at the specs root.
- The library version now moves — by a patch — when a composition changes. A workspace
  that only edits screens will see patch releases it did not see before.
- Dependency analysis gains the edges that matter most for blast radius: which components
  each screen is built from.
- `readsKinds` is a new thing every future transform must consider. Its default is the
  conservative one, so forgetting it under-includes rather than silently mis-including.
