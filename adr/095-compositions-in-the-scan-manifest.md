# ADR: Compositions Are Curated Like Components, From a Smaller Eligible Set

**Branch**: `feature/compositions-cli`
**Created**: 2026-09-29
**Status**: ACCEPTED
**Summary**: A third `## Compositions` manifest section, curated by checkbox exactly as components are; the ready-for-dev marking on the outermost frame decides only which frames are eligible for a row.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends the manifest format ADR-093 governs the curation half of)*

---

## Context

A composition is a Figma `FRAME` that arranges components into a screen, a page, or a
pattern. The engine already specs one: `FRAME` is an accepted node type, a frame yields
no variant props and an empty prop surface, and its anatomy and styles are captured as
for any component. The plugin has produced composition specs in production since it
shipped. `Metadata.source.nodeType` already admits `'FRAME'`, so the spec a composition
produces is already a legal spec.

The CLI's REST path produces none. Three things stand in the way, and only the third is
this ADR's subject:

| Blocker | Where |
|---|---|
| A frame ID is unfindable through the REST lookup | the engine's REST adapter |
| No frame is ever discovered by a scan | `ComponentDiscovery` |
| The manifest has nowhere to put one, and no rule for which frames belong | `ManifestParserV2`, the manifest writer |

The manifest is the CLI's curation surface: a scan writes it, a human edits it, and a
generate reads it. It has two sections today, and they are shaped by two different
answers to the same question — *who decides what is in this run?*

| Section | Who decides | Shape |
|---|---|---|
| `## Components` | the human, from a default the library's dev-status markings seed (ADR-093) | checkbox per row |
| `## Glyphs` | the naming convention, absolutely | no checkbox; recorded and excluded |

Glyphs are the one section that is genuinely output rather than input, and it stays that
way — a glyph is never generated, so there is nothing to curate.

Compositions take the **same** answer as components, which means separating two things
the Components section conflates because for components they coincide:

| Layer | Components | Compositions |
|---|---|---|
| What is **eligible** for a row | every component set and standalone component | only a frame the library marks ready for dev |
| How a row is **curated** | checkbox, seeded from dev status, merged on rescan (ADR-093) | identical |

Eligibility has to differ, and not as a matter of taste. The production library this was
built against holds **19,950 frames**; 4,919 are direct children of a page or section;
**11** are marked ready for dev. Listing frames the way components are listed would
produce a manifest nobody can read, review, or diff. A frame is a working container by
default — a designer's scratch space — and the marking is what distinguishes a
deliverable from one.

Curation must not differ. A team that ships eight of its ten marked screens has the same
need a team shipping eighty of its hundred components has: uncheck the two, and have that
survive the next scan. An earlier draft of this ADR made the section uncurated on the
grounds that the marking was already the decision. That conflated the two layers: the
marking decides *candidacy*, the checkbox decides *this run*, and a team needs both.

---

## Decision Drivers

- **The marking decides eligibility, not the run.** A frame marked ready for dev has
  been declared a candidate. Which candidates this run specs is the manifest's job, the
  same as for components.
- **A manifest a human cannot read is not a curation surface.** Any rule that admits
  thousands of unmarked frames fails, whatever its other merits.
- **Wherever the frame lives.** Compositions sit on pages, in sections, inside other
  containers. No structural position rule may qualify or disqualify one.
- **One frame, one spec.** A composition must not be specced twice, once on its own and
  once as part of something else.
- **One set of curation rules, not two.** Whatever the manifest does for components on a
  rescan it must do for compositions, using the same code — two implementations of
  "preserve a hand edit" will diverge.
- **The manifest stays human-readable.** A third section must read as obviously as the
  two that precede it, and a reader must be able to tell why a row is there.
- **No format version bump.** A v2 parser that predates this ADR must read a manifest
  containing the new section without failing.

---

## Options Considered

The axis is not *whether* to have a Compositions section — that follows from compositions
needing their own output directory (ADR-096). It is how a row gets into it, and what a
reader may do to it once there.

### Option A: Marked frames are eligible; curated like components *(Selected)*

```markdown
## Compositions

_Frames marked `READY_FOR_DEV` in Figma — a frame with no marking gets no row. Check and uncheck to curate, exactly as above._

| ✓ | Name | ID | Type | Dev Status |
|---|------|----|------|------------|
| [x] | Checkout / Small | 30141:6435 | FRAME | READY_FOR_DEV |
| [ ] | Inbox / Small | 39989:35636 | FRAME | READY_FOR_DEV |
```

**Pros**:
- One set of curation rules for the whole manifest. `deriveDefaultInclusion`,
  `mergeRows`, `settings.curation` and the `--keep-checks` / `--reset-checks` /
  `--include-all` flags all apply unchanged, because they are literally the same
  functions — there is no second implementation to diverge.
- A team can ship a subset of its marked screens and have that survive a rescan, which
  is the ordinary case the uncurated draft had no answer for.
- The eligible set stays small and meaningful: 11 rows against a library of 19,950 frames.
- The two layers each sit where their authority belongs — candidacy in Figma, with the
  person who marked the frame; this run in the manifest, with the person reviewing it.

**Cons / Trade-offs**:
- Two sections that look identical follow different eligibility rules, and nothing in the
  table says so. The note under the heading carries that, and has to.
- Unmarking a frame in Figma and unchecking its row are different acts with similar
  effects, which is one more thing to understand.

---

### Option B: Marked frames are eligible; the section is not curated *(Rejected)*

The earlier draft: no checkbox, every listed frame specced, section re-derived wholesale
on every scan.

**Rejected because**: it leaves a team that wants eight of its ten marked screens with no
way to say so except unmarking frames in Figma — editing the library to configure a run.
It also splits the manifest into a curated half and an uncurated half for no benefit the
curated form does not also have. Violates *one set of curation rules*.

---

### Option C: Every frame is eligible, curation decides *(Rejected)*

The literal component rule: list all frames, let dev status seed the checkbox.

**Rejected because**: 19,950 rows in the library this was built against. The manifest
stops being reviewable, a rescan diff stops being readable, and the file's size alone
makes it hostile. Violates *a manifest a human cannot read is not a curation surface*.

---

### Option D: Frames that are direct children of a page or section *(Rejected)*

A structural eligibility rule instead of the marking.

**Rejected because**: still 4,919 rows, and it reintroduces a position rule — a
composition nested one container deeper silently stops being eligible, for a reason that
has nothing to do with whether it is a deliverable.

---

## Decision

### Eligibility — what earns a row

A node is **eligible** to be a composition row when all of the following hold:

1. Its type is `FRAME`.
2. Its `devStatus.type` is `READY_FOR_DEV`.
3. No ancestor of it also satisfies 1 and 2.
4. Its name is not an authoring aid under `conventions.figma.subcomponents.exclude` or
   the `codeOnlyProps` container name — the same exclusion components get.
5. Its name yields a spec key.

**An unmarked frame is never listed** — not as an unchecked row, not at all. This is the
rule that keeps the section finite, and it is not negotiable against any of the others.

Nothing about *where* the frame sits enters into eligibility. A frame that is a direct
child of a page, one nested in a `SECTION`, and one inside a plain container are equally
eligible.

Rule 3 is *one frame, one spec*: a marked frame inside a marked frame is already captured
as part of its ancestor's anatomy, and listing it would spec the same arrangement twice
under two keys. The outermost marking wins.

Rule 5 is defensive, not hypothetical: a frame named with whitespace alone exists in real
libraries. Its name has no alphanumeric content, so it yields no key, and the writer's
fallback would name its folder `component` — which the next such frame would collide with.
Such a frame is skipped with a warning naming its node id.

The key is derived by the **same function that names the folder**, not by an equivalent
one. Two derivations were the original bug: the guard tested `formatKey` against the
workspace's `keys` setting while the writer used its own camelCase reduction, so the two
could disagree about any name and the guard would pass something the writer then mangled.
Note this is independent of `settings.spec.keys`, which governs keys *inside* a spec and
the formatted `instanceOf` values the bridge matches against raw Figma names — never the
folder a spec is written to, which has always been camelCase.

### Curation — what happens to an eligible row

Identical to components (ADR-093), by using the same functions rather than by matching
their behaviour:

| Rule | Behaviour for a composition |
|---|---|
| First scan | `deriveDefaultInclusion` checks it. Every eligible composition is marked ready for dev by definition, so all start checked |
| Rescan, untouched | The recorded checkbox is preserved |
| Rescan, hand-edited | The hand edit wins. An eligible composition's dev status cannot change — it is `READY_FOR_DEV` or it is not eligible — so `mergeRows` never sees the flip that would override an edit. "Sustain the check" therefore holds unconditionally, without needing `--keep-checks` |
| Marking removed in Figma | The frame leaves the eligible set; its row is dropped, like a deleted component's |
| `--reset-checks` | Re-derives every checkbox, discarding the prior manifest |
| `--include-all`, `defaultSelection: ALL` | Checks every **eligible** composition. It widens curation, never eligibility — an unmarked frame is still not a composition |
| `curation.includeDependencies` | **Does not apply.** A checked composition does not retain the components it composes; those are curated on their own merits, exactly as today |

`includeDependencies` is the one deliberate asymmetry. A composition's emitted scaffold
imports the components it composes, so a selection omitting them produces imports that do
not resolve — but retaining them silently would let checking one screen select dozens of
components a team did not ask for, and `transform-verify-imports` already turns the
missing-import case into one line of error rather than a mystery. Keeping selection
predictable beats making one downstream failure impossible.

### The section

| Property | Value |
|---|---|
| Heading | `## Compositions` |
| Position | after `## Components`, before `## Glyphs` |
| Columns | `✓`, `Name`, `ID`, `Type`, `Dev Status` — the same five as Components |
| Row order | by name, ascending, for stable diffs |
| Written when | at least one frame is eligible; omitted entirely otherwise |
| Note under heading | states that a marking earns the row and a checkbox curates it |

`Dev Status` reads `READY_FOR_DEV` on every row, since that is what made the frame
eligible. It is kept anyway: the columns matching Components exactly is what makes the
two sections legible as the same kind of table, and it leaves room for a second qualifying
status without a format change.

### Parser

`ManifestRowV2.type` widens to `'COMPONENT' | 'COMPONENT_SET' | 'FRAME'`, and the parse
result gains `compositions: ManifestRowV2[]` alongside `components`. Both sections share
one row grammar and one code path, differing only in which array a row lands in — so a
row cannot parse differently depending on which heading precedes it.

The scan format version stays **2**. The section is additive; an older v2 parser reads its
rows as component rows only if it ignores headings, which it does not, so it sees five
lines it cannot place and warns rather than failing.

## Type ↔ Schema Impact

- **Symmetric**: N/A — no `@directededges/specs-schema` type or JSON schema changes. The
  manifest is a CLI artifact with no schema definition, and `Metadata.source.nodeType`
  already admits `'FRAME'`.
- **Parity check**: the spec a composition produces is already a valid `SpecApiDocument`;
  nothing in this ADR alters spec content.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` — scan | Discovers eligible frames, then curates them with the component machinery | Implement eligibility in both discovery classes (monolithic and page-sectioned) |
| `specs-cli` — generate | Reads checked `compositions` from the parse result | Process every checked row; route output per ADR-096 |
| `specs-from-figma` | A frame ID must resolve through the REST lookup | Open the lookup gate for explicit IDs |
| Older `specs-cli` releases | Five warning lines per manifest | None — degradation is intended and non-fatal |

---

## Semver Decision

**Target version**: `0.32.0` — `@directededges/specs-cli` on the active release branch.

**Change class**: `MINOR` — a new manifest section and a widened parse result, both
additive. No existing manifest becomes unreadable and no existing row changes meaning.

**Justification**: additive output and an additive member on an internal result type;
the scan format version is unchanged because compatibility is preserved in both
directions.

---

## Consequences

- A frame marked ready for dev appears in the manifest checked, and is specced by the next
  `specs generate` with no edit — the short path stays short.
- A team can ship a subset of its marked screens by unchecking rows, and that survives
  every rescan without a flag.
- Two authorities, each where it belongs: Figma decides what is a candidate, the manifest
  decides what this run produces. Unmarking removes a frame from consideration entirely;
  unchecking keeps it listed and skips it.
- The manifest stays one kind of document. Both curated sections obey one set of rules
  because they run one implementation of them.
- Two sections share a shape while differing in eligibility, and only the note under each
  heading says so. That is a documentation load this ADR accepts rather than solves.
- `settings.curation` now governs compositions too, except `includeDependencies`. Any
  future curation setting must state which kinds it applies to.
