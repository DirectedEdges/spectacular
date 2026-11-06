# ADR: Curation is a settings concern

**Branch**: `093-curation-settings`
**Created**: 2026-09-28
**Status**: ACCEPTED
**Summary**: A `curation` concern with `defaultSelection`, `preserveManualSelections` and `includeDependencies` states which components a run specs.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A library holds more than a team consumes. Curation is the step that decides which
of a library's components are worth a spec. The decision is derived from the
library's own signals, recorded in a manifest a human can edit, and re-derived every
time the library is read again.

Three rules govern that step today. All three are fixed in consumer code, and none
is expressible in `Settings`:

| Rule | Current behaviour | Partial escape |
|------|-------------------|----------------|
| What the first pass selects | The components the library marks ready — or, when the library marks none, every component set and standalone component | A per-run flag forcing the second |
| Whether a hand edit survives | A component whose marking changed takes the new marking, overriding the edit; an unchanged component keeps its recorded selection | A per-run flag preferring the edit |
| Whether dependencies come along | Always, unconditionally | None |

Two of the three are half-exposed as per-run flags with nothing standing behind
them, which is the wrong shape for a team policy — a workspace that always wants one
of them must remember a flag on every invocation. The third has no escape at all.

The third rule is also the one with a demonstrated defect: dependency selection is
applied *after* a prior manifest's edits are merged forward, so a component
deselected by hand is reselected on the next pass. The flag that exists to preserve
edits does not protect against it, because it acts earlier in the sequence.

These are choices, not facts. A team that marks nothing ready, a team that treats
its manifest as the authority, and a team that wants exactly what it marked and
nothing more each want a different answer, and each answer is correct for them.
That is the definition `Settings` already carries.

### What is not decided here

- **What counts as being built from something.** That is `Conventions.subcomponents`,
  and it stays there. A component specced inside its parent is unaffected by any
  member below.
- **The convention-matching defects** that make the rules behave differently between
  workspaces are implementation bugs in consumers, not contract questions.
- **Re-deriving from scratch.** Discarding a recorded selection and starting over is
  a one-off action, not a standing policy: as a setting it would destroy a team's
  curation on every pass. It remains a per-run flag only.

---

## Decision Drivers

- **Settings are choices, not facts** — a member qualifies only if every value
  yields a defensible result, never an incorrect one.
- **Additive only** — optional members with defaults matching current behaviour, so
  no workspace changes on upgrade.
- **Type ↔ schema symmetry** — `types/Settings.ts` and `schema/settings.schema.json`
  move together (Constitution I).
- **No logic in this package** — declarations plus `DEFAULT_SETTINGS` entries, the
  single permitted runtime export for settings (Constitution II).
- **A shared concept, not a consumer's internal** — the concern and its members must
  not be named for, or justified by, one package's command or function
  (Constitution III).
- **Naming — code platforms first, no abbreviations** — Constitution VI.
- **A value's meaning must be stated, not implied** — an off-switch whose `false`
  silently means a second, unnamed behaviour fails this.

---

## Options Considered

### Decision 1 — Is curation expressible in `Settings` at all?

#### Option A: A concern group with a member per rule *(Selected)*

`Settings` gains a group holding one member per curation rule, each defaulting to
current behaviour.

**Pros**:
- Satisfies *settings are choices*: every value of every member is defensible.
- Additive and defaulted.
- Gives the two existing per-run flags a standing form, with the flag remaining a
  per-run override — the relationship `data.directory` and its flag already have.

**Cons / Trade-offs**:
- Admits configurations that produce specs referencing components with no spec.
  Recorded under Consequences.

---

#### Option B: No members — curate by editing the manifest *(Rejected)*

The manifest carries a per-component selection a human can edit.

**Rejected because**: it does not work today. Dependency selection is applied after
edits are merged forward, so a deselection is reversed on the next pass. Even once
that ordering is fixed, it would leave a team re-deselecting the same components
after every library change — a standing policy expressed by repetition.

---

#### Option C: No members — express it through `Conventions` *(Rejected)*

A workspace declares unwanted components excluded in `Conventions.subcomponents`.

**Rejected because**: conventions describe how a library encodes meaning. Selection
describes what a run should produce. An exclusion pattern used to suppress
generation overloads a contract member with a second job, and reshapes how every
matching component is specced as a side effect.

---

#### Option D: Members on the CLI's own configuration, not the shared schema *(Rejected)*

Curation is CLI-only today — `specs-plugin-2` has no dev-status curation — so the
members could live in the CLI's configuration surface.

**Rejected because**: `settings.yaml` is the shared workspace contract, and `data`
already establishes that a concern group may be honoured by one consumer. Splitting
a workspace's configuration across two contracts by which consumer reads it would be
a larger and less coherent change than adding a group.

---

### Decision 2 — Where the members live

#### Option A: A top-level `curation` group *(Selected)*

```yaml
curation:
  defaultSelection: READY_FOR_DEV
  preserveManualSelections: false
  includeDependencies: true
```

**Pros**:
- Names the concern, matching how `data`, `spec` and `assets` are named.
- Survives Constitution III: curation is what the step *is*, independent of the tool
  performing it.
- Three members justify a group on their own.

**Cons / Trade-offs**:
- A group that owns no `directory`, unlike the other three. Accepted: the directory
  is incidental to those concerns, not the reason they are groups.

---

#### Option B: A top-level `scan` group *(Rejected)*

**Rejected because**: it names a CLI command. Constitution III forbids a contract
member named for one package's implementation, and a second consumer performing the
same step under another name would inherit a misleading key.

---

#### Option C: `curation.scan.*` — nested by command *(Rejected)*

**Rejected because**: the test for nesting by command is whether two commands would
need different values of the same member. They would not — a curation rule should
mean one thing wherever curation happens. It also places a command name a level
deeper in the contract than Option B does, and no existing group nests this way.

---

#### Option D: Members on the existing `spec` group *(Rejected)*

**Rejected because**: `spec` describes a generated spec — where it lands, how it is
split, what it contains, how values are serialized. These members decide which specs
exist at all, which is a different question asked at a different stage. Filing them
under `spec` would make the group mean two things.

---

#### Option E: A `selection` group *(Rejected)*

**Rejected because**: it names the output of the step rather than the step. Two of
the three members describe how a selection is arrived at and maintained, not the
selection itself.

---

### Decision 3 — Naming the signal-derivation member

#### Option A: `defaultSelection: 'READY_FOR_DEV' | 'ALL'` *(Selected)*

**Pros**:
- An enum names both behaviours. The alternative to reading the library's marking is
  not "nothing" — it is "select everything", a real behaviour that deserves a name.
- Matches how closed-set members are named elsewhere: `details`, `layout`, `tokens`
  name their axis and enumerate its values.
- `READY_FOR_DEV` carries the no-marks fallback as part of its documented meaning,
  so the default preserves today's behaviour exactly.

**Cons / Trade-offs**:
- `READY_FOR_DEV` is Figma's vocabulary. Constitution VI rule 3 applies: no code
  platform expresses an opinion on library curation, and the value names a signal
  that exists only in the design tool.

---

#### Option B: `readyForDev: boolean` *(Rejected)*

**Rejected because**: `false` would silently mean "select every component set and
standalone component" — a second behaviour hidden inside an off-switch, which the
drivers forbid. It is also the shortest and most readable candidate, which is why it
was considered first.

---

#### Option C: `selectBy: 'READY_FOR_DEV' | 'ALL'` *(Rejected)*

**Rejected because**: the verb reads well in isolation but misstates the scope — it
implies the member governs all selection, when it governs only the first pass, with
`preserveManualSelections` governing later ones.

---

#### Option D: `initialSelection: 'READY_FOR_DEV' | 'ALL'` *(Rejected)*

**Rejected because**: accurate, and nearly selected. `default` says the same thing
in the vocabulary the package already uses for a value that applies absent anything
else, and reads better beside `DEFAULT_SETTINGS`.

---

### Decision 4 — Naming the edit-precedence member

#### Option A: `preserveManualSelections: boolean` *(Selected)*

**Pros**:
- Verb-led, and concrete about what is protected and from what.
- A genuine two-valued choice, unlike Decision 3 — both values name themselves.
- Reads correctly at the point of use: a reader setting it to `true` knows their
  edits will survive.

**Cons / Trade-offs**:
- The default is `false`, which reads as "do not preserve edits" and overstates the
  case: edits are preserved for every component whose marking did not change. The
  member governs only the conflict, and the doc comment says so.

---

#### Option B: `selectionAuthority: 'LIBRARY' | 'MANIFEST'` *(Rejected)*

**Rejected because**: symmetric and precise, but abstract — "authority" names a
relationship a reader must reconstruct, where the selected option names the thing
being protected.

---

#### Option C: `priorSelections: 'PRESERVE' | 'FIGMA_WINS'` *(Rejected)*

**Rejected because**: the values mix vocabularies — one names an action, the other
names a winner — and `FIGMA_WINS` puts the design tool's name in a value where the
member is about a record, not a tool.

---

#### Option D: `rescanBehavior: 'LIBRARY' | 'MANIFEST'` *(Rejected)*

**Rejected because**: "rescan" names a command performed twice, which Constitution
III rules out for the same reason as Decision 2's Option B.

---

### Decision 5 — Naming the dependency member

#### Option A: `includeDependencies: boolean` *(Selected)*

**Pros**:
- Carries the imperative that the noun-led members (`invalidVariants`,
  `emptyVariants`) leave implied, so `false` cannot be misread as an assertion that
  no dependencies exist.
- Unambiguous inside a group named `curation`; "composed" stops earning its length
  once the group supplies the context.

**Cons / Trade-offs**:
- A boolean cannot later express a third mode — for example, dependencies from one
  part of a library but not another. No such mode is known to be wanted.

---

#### Option B: `composedDependencies: boolean` *(Rejected)*

**Rejected because**: noun-led, so it inherits the ambiguity of an unstated verb,
and "composed" restates what the group already says. It was the first draft of this
ADR's only member.

---

#### Option C: `selectDependencies: boolean` *(Rejected)*

**Rejected because**: "select" is accurate to the mechanism but is the vocabulary of
the manifest rather than of the result. A reader asking what appears under the spec
directory is asking what is included.

---

#### Option D: `includeComposedDependencies: boolean` *(Rejected)*

**Rejected because**: the longest candidate, and the distinction "composed" draws is
already drawn by the group. Constitution's no-abbreviation rule favours full words,
not redundant ones.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Settings.ts` | Added optional group `curation` with `defaultSelection`, `preserveManualSelections`, `includeDependencies` | MINOR |
| `Settings.ts` | Added required group `curation` to `ResolvedSettings` | MINOR |
| `Settings.ts` | Added `curation` defaults to `DEFAULT_SETTINGS` | MINOR |
| `Settings.ts` | Updated the `Settings` doc comment — concerns are no longer all directory-owning | PATCH |

**Example — new shape** (`types/Settings.ts`):
```yaml
# Before
Settings:
  author?: string
  data?: { … }
  spec?: { … }
  assets?: { … }

# After
Settings:
  author?: string
  curation?:                                      # optional group — MINOR
    defaultSelection?: 'READY_FOR_DEV' | 'ALL'    # defaults to READY_FOR_DEV
    preserveManualSelections?: boolean            # defaults to false
    includeDependencies?: boolean                 # defaults to true
  data?: { … }
  spec?: { … }
  assets?: { … }
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `settings.schema.json` | Added `curation` object under `#/definitions/Settings/properties` with three properties | MINOR |
| `settings.schema.json` | Updated the `Settings` description for the same reason as the type | PATCH |

**Example — new shape** (`schema/settings.schema.json`):
```yaml
# New property under #/definitions/Settings/properties
curation:
  type: object
  additionalProperties: false
  properties:
    defaultSelection:
      type: string
      enum: [READY_FOR_DEV, ALL]
      default: READY_FOR_DEV
    preserveManualSelections:
      type: boolean
      default: false
    includeDependencies:
      type: boolean
      default: true
  # not in required[] — the whole group is optional
```

### Notes

- **Every default preserves current behaviour.** A workspace upgrading sees no
  change in what is selected.
- **`READY_FOR_DEV` includes the no-marks fallback.** Selecting nothing from a
  library that marks nothing would be a behaviour change and a poor default, so the
  fallback is part of the value's meaning rather than a separate value.
- **Optional in `Settings`, required in `ResolvedSettings`**, per the stated rule
  that every property with a default in `DEFAULT_SETTINGS` is required on the
  resolved type. `curation` is the first non-`spec` group to be required there,
  because it is the first with defaults this package supplies.
- **Flags become overrides.** The two existing per-run flags override
  `defaultSelection` and `preserveManualSelections` for one invocation. A third
  flag — re-derive from scratch — stays flag-only, per Context.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Settings['curation']` ↔ `#/definitions/Settings/properties/curation`,
  member for member. `ResolvedSettings['curation']` is the same group with defaults
  applied and carries no separate schema definition, consistent with `spec`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Three fixed rules become configurable; defaults preserve today's output | Read the group when deriving selection; make the flags override it; recompile |
| `specs-from-figma` | None to the transform contract | Recompile |
| `specs-plugin-2` | Performs no dev-status curation today; the group may inform a future curation surface | Recompile |

### Pipeline consequences of the non-default values

With `includeDependencies: false`, or with a selection narrowed by hand under
`preserveManualSelections: true`, a generated spec may reference a component that
has no spec of its own. Every consumer that resolves such a reference resolves it by
lookup and treats a miss as "not composable":

| Consumer | Behaviour on an unresolvable reference |
|----------|----------------------------------------|
| `react-from-specs` | The element is not emitted as an instance; it falls through to the container emitter |
| `webcomponents-from-specs` | Mirrors the React package's resolution |
| `figma-from-specs` | The reference is not counted as a dependency and is not rendered as that component |

**None of these fail.** There is no dangling import and no build or Storybook error.
The element is emitted as a plain container, so a composed piece renders as an empty
box where a real component belongs. The failure is silent and visual rather than
loud and mechanical, which makes it harder to attribute than an error would be.

This argues for the defaults rather than against the members: a workspace that never
touches this group never meets the degradation.

### Implementation note for the CLI pass

`preserveManualSelections: true` cannot be honoured by reading the member alone.
Dependency selection is currently applied after edits are merged forward and
re-selects what a human deselected. The ordering is a defect in its own right; a
member promising that edits stand must actually make them stand.

---

## Semver Decision

**Target version**: `0.35.0` — the version of `@directededges/specs-schema` on the
active `release/next` branch.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: The change adds one optional group to `Settings`, one required
group to `ResolvedSettings` (which is produced by this package's own defaults, never
authored), three `DEFAULT_SETTINGS` entries, and one optional schema property. No
field is removed, renamed, or made required on an authored type. Constitution:
"`MINOR` for additive types or new optional fields."

---

## Consequences

- A team can state its curation policy once in the workspace rather than remembering
  flags per invocation.
- A team that does not mark readiness in Figma can say so, instead of relying on a
  fallback that triggers on whether anyone happened to mark anything.
- Every default is current behaviour, so acceptance changes no existing output.
- Narrowing a selection admits specs whose references do not resolve. Consumers
  degrade silently to a container rather than erroring, so a workspace choosing this
  accepts visual gaps it must notice for itself.
- Curation becomes a named concern of `Settings`, giving future curation questions a
  place to be decided.
- `curation` is a concern group that owns no directory, which the `Settings` doc
  comment now accounts for.
- Two booleans and one enum commit to their value sets. A third mode for either
  boolean would be a MAJOR change to that member.
