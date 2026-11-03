# ADR 071: Separate Library Conventions from Tooling Settings

**Branch**: `071-config-conventions-split`
**Created**: 2026-08-18
**Status**: ACCEPTED
**Summary**: `Conventions`, `Settings` and `Pipeline` replace `Config`, separating library facts from run choices and declared work.
**Decides**: backgroundImage

---

## Amendment (2026-09-11): `Pipeline` is retired; the split is two, not three

The three-way split held for two of its three parts. `Pipeline` did not survive
contact with what it was describing.

**`transformers` existed to sequence work that no longer needs sequencing.** The
list was ordered because `contract` and `css` had to run before `react`, which
imported their output. Once each target emitted everything it imports —  its own
contract, its own stylesheet, its own stories — there was nothing left to order.
And once output moved into per-target trees, `css` had no location of its own at
all: it writes React's stylesheet into `react/` and the custom element's into
`webcomponents/`, so naming it alone produced two directory trees holding one
stylesheet each and nothing to import them. A transformer that cannot name a
destination is not a transformer; it is part of what a target emits.

`specs react` and `specs webcomponents` replace the list. Each emits one target
whole, which is also why they need no declared order.

**`analyses` never had a reader.** `AnalyzeCommand` takes analyzer names as
positional arguments and resolves them directly. `ConfigLoader` parsed and
defaulted `pipeline.analyses` into an object nothing consulted, from this ADR's own
release onward, while the schema docs described it as working. `specs analyze props
styling` has always needed no configuration.

With both keys gone the file is empty, so `config/pipeline.yaml` is retired and
`Pipeline` with it.

### What this changes

| Surface | Change | Semver |
|---|---|---|
| `types/Pipeline.ts` | Removed — `Pipeline`, `ResolvedPipeline`, `TransformEntry`, `AnalysisEntry`, `DEFAULT_PIPELINE` | MAJOR |
| `schema/pipeline.schema.json` | Removed — one of the entry points ADR-061 defined | MAJOR |
| `types/index.ts` | Drops those exports | MAJOR |
| `CLIConfig` | `pipeline` off the loaded config; the split it carries is `conventions` and `settings` | MAJOR |
| `ConfigLoader` | `resolvePipeline()` and the `pipeline` part-read removed | — |
| `ConfigTemplates` / `specs init` | No longer seeds `config/pipeline.yaml` | — |
| `specs migrate config` | Drops `config.transformers` rather than carrying it forward, and writes no pipeline file | — |
| `specs transform` | Removed | MAJOR |

**Nothing outside the CLI consumed `Pipeline`.** Neither emitter package nor the
plugin imported it, so the removal breaks no downstream type. Workspaces carry the
file, which is what the migration handles.

**What the amendment does not change.** The reasoning that separated library facts
from run choices is unaffected, and both surviving members keep their meaning:
`Conventions` still describes the library a spec came from, `Settings` still
describes the run that produced it. What is withdrawn is the claim that *declared
work* is a third thing a workspace configures. It turned out to be a thing a
workspace runs.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Config` is one flat structure with four groups — `processing`, `format`, `include`, and `transformers` — and every member is a peer. In practice its members answer two unrelated questions.

**What is true about this Figma library?** Get one of these wrong and the output is *incorrect*:

```yaml
processing:
  glyphNamePattern: "DS Icon Glyph / {i}"    # icon assets go undetected if wrong
  codeOnlyPropsPattern: "Code only props"    # code-only props go unextracted if wrong
  subcomponents:
    match:
      - "{C} / {S}"                          # subcomponents go undiscovered if wrong
  states:
    hover:
      prop: state                            # unclassified, this prop emits as a data-* attribute
      value: hover
    active:
      prop: state                            # two concepts share one prop
      value: pressed                         # the concept name is not the Figma value
    disabled:
      prop: disabled                         # boolean prop — no value to match
    readonly:
      prop: readOnly                         # concept casing is not prop casing
    invalid:
      prop: validation                       # neither name resembles the other
      value: invalid
format:
  figmaKeys: SENTENCE                        # name reversal is undefined if wrong
```

**What do I want out of this run?** Get one of these "wrong" and the output is merely *different*:

```yaml
processing:
  variantDepth: 9999
  inferNumberProps: true
format:
  output: YAML
  color: HEXA
include:
  emptyVariants: false
```

The two are indistinguishable in the type, and three consequences follow:

- **The first kind cannot be shared.** Every consumer reading the same library — the CLI, the plugin, a second workspace, a CI job — re-declares the same facts. Drift between copies produces silently different specs from one Figma file
- **`ResolvedConfig` conflates two kinds of absence.** A missing member of the second kind means "use the default." A missing member of the first kind means "this library has no such convention" — a different claim with different consequences
- **A third kind exists in one consumer and has nowhere to live.** The plugin persists values that never reach a spec at all, mixed into the same map as the two above

---

## Decision Drivers

- **Naming governance (Constitution VI)**: no code-platform consensus exists for this concept, so rule 3 applies — terms are chosen for consumer clarity
- **No abbreviations**: full, unabbreviated words in the public contract
- **Minimal, stable, intentional public API (Constitution III)**: the split must express a genuine shared concept, not one consumer's arrangement
- **Type ↔ schema symmetry (Constitution I)**: regrouping applies to both artifacts in the same change
- **No logic (Constitution II)**: the schema may classify members; it may not resolve, merge, or load them
- **Absence must mean one thing per member**
- **Serviceable by every consumer equally**: the CLI, the plugin, and the generator each hold configuration differently

---

## Options Considered

Nine decisions, taken separately: the classification rule, the name of each side (independently), whether the library side is scoped to Figma, the structural shape, whether any block straddles the line, the shape of name-based conventions, what replaces block presence as the detection switch, what becomes of `Config`, and the workspace artifact layout.

---

## Decision 1 — The classification rule

### Option 1A: Substitution — what a different team would have to keep *(Selected)*

**If a different team pointed this tool at the same Figma file, which values would they have to keep?**

- Values they **must keep** are **conventions**. They describe the library, and changing one produces *incorrect* output
- Values they **may freely change** are **settings**. They describe the run, and changing one produces *different* output

A residue falls outside both: values that never reach a spec at all, so two identical specs can be produced with each set differently. They belong to whichever consumer holds them and stay out of the shared contract (see Downstream Impact).

**Pros**:

- Mechanical and reproducible — every current member classifies without argument
- Explains the sharing consequence directly: conventions are the values worth declaring once per library
- Gives absence one meaning per side: a missing setting is defaulted, a missing convention is declared absent
- Distinguishes a violable side from an inviolable one — a setting cannot be wrong, a convention can

**Cons / Trade-offs**:

- Three blocks contain members from both sides (Decision 6)
- A member could in principle be a convention for one library and a preference for another; no current member is

---

### Option 1B: Split by who authors it — designer versus engineer *(Rejected)*

**Rejected because**: it encodes an org chart, not a property of the data. The same person often sets both, and the semantic classification of variant props is authored by whoever knows the library — which may be either.

---

### Option 1C: Split by rate of change — stable versus per-run *(Rejected)*

**Rejected because**: it describes a symptom rather than a cause. `variantDepth` and `format.output` are typically set once and never touched, yet nothing about them describes the library.

---

## Decision 2 — What to call the library side

| Candidate | For | Against |
|---|---|---|
| **`conventions`** *(Selected)* | Established term for a library-wide agreement about naming and meaning; already the word this package's own documentation uses for state classification and name patterns | Slightly formal; says nothing about *whose* conventions (see Decision 3) |
| `authoring` | Accurate — these describe how the library was authored | Names an activity, not a thing; reads oddly as a noun holding patterns |
| `library` | Short, familiar | Ambiguous in a schema whose root artifact already describes a component within a library |
| `source` | Accurate in the data-flow sense | Already load-bearing: `metadata.source` names a Figma node, `images.sourceProps` names props carrying image sources |
| `vocabulary` | Fits the state classification | Wrong for `match`/`exclude` patterns, which are not terms |
| `declarations` | Emphasizes that these are asserted, not derived | Verbose, and every configuration value is a declaration |
| `facts` | Precisely what they are | Unidiomatic in configuration; invites "whose facts?" |

**Selected: `conventions`.** It is the only candidate that covers both halves of the contents — the naming patterns and the semantic classifications — without colliding with an existing term in the schema.

`states` is the clearest member of the category. In a real catalog's declaration, five of ten entries could not be recovered by any rule: two concepts share one prop (`hover` and `active` both read `state`), a concept name differs from the Figma value that activates it (`active` ← `pressed`), a concept's casing differs from its prop's (`readonly` ← `readOnly`), and one pair resembles nothing (`invalid` ← `validation`). Every one of them is an agreement, and a different team reading the same file would have to keep all five.

---

## Decision 3 — Whether the library side is scoped to Figma

Every member classified as a convention today describes **Figma authoring**: layer-name patterns, component naming, variant props, the file's own naming convention. Nothing prevents code-side conventions from arriving later — how generated names are cased, what a platform calls its props.

### Option 3A: `conventions.figma` — namespaced by source *(Selected)*

```yaml
# conventions.yaml
figma:
  naming: SENTENCE
  glyphs:
    match: "DS Icon Glyph / {i}"
  codeOnlyProps:
    match: "Code only props"
  images:
    backgroundImage: true
    match: "DS Image"
    sourceProps:
      - Image
  subcomponents:
    scope: PAGE
    match:
      - "{C} / {S}"
      - "{C} / _ / {S}"
    exclude:
      - "{C} / Examples / {S}"
  instanceExamples:
    scope: PAGE
    match:
      - "{C}*"
    parentNames:
      - Examples
  slotConstraints: true
  inferNumberProps: true
  states:
    hover:
      prop: state
      value: hover
    active:
      prop: state
      value: pressed
    focus-within:
      prop: focused
    disabled:
      prop: disabled
    readonly:
      prop: readOnly
    invalid:
      prop: validation
      value: invalid
    selected:
      prop: selected
    indeterminate:
      prop: selected
      value: indeterminate
```

```yaml
# settings.yaml
author: Nathan Curtis
data:
  directory: ./data
  sources:
    library:
      key: <figma-file-key>
      fetch:
        - file
        - variables
        - styles
        - icons
spec:
  directory: ./specs
  format: YAML
  keys: CAMEL
  layout: LAYOUT
  tokens: TOKEN
  color: HEXA
  variantDepth: 9999
  details: LAYERED
  collapsePrimitiveWrapper: true
  invalidVariants: false
  invalidCombinations: true
  emptyVariants: false
  defaultSlotContent: true
  splitComponents: true
  splitConcerns: true
  useSubfolders: true
assets:
  directory: ./assets
```

```yaml
# pipeline.yaml
transformers:
  - name: react
  - name: css
  - name: contract
analyses:
  - name: dependencies
```

**Pros**:

- **Symmetric.** Both sides are nameable, referenceable, and independently validatable. A classification where only one side has a handle is half a classification
- Either side can be held, shared, published, validated, or diffed on its own, with nothing to unwrap first
- **No parent to imply they are one thing.** The ADR's whole claim is that these have different owners, lifecycles, sharing models, and resolution rules; a container immediately argues the opposite
- The existing group names keep their meaning

**Cons / Trade-offs**:

- Every member's path changes; every consumer breaks at compile time
- A consumer wanting both halves passes or holds two values instead of one

---

### Option 5B: A `conventions` block beside the existing groups *(Rejected)*

**Rejected because**: it is asymmetric. Conventions become addressable and settings do not, leaving "the settings" a category with no handle — unnameable, unvalidatable alone, and unable to be stored separately.

---

### Option 5C: Classify in documentation only *(Rejected)*

**Rejected because**: a classification a consumer cannot address is one it cannot act on. The sharing problem is unsolved, and nothing prevents the next member from landing on the wrong side.

---

## Decision 6 — Members that look like settings but are not

Several members read as run choices at first glance: `scope` (where to search), `backgroundImage` (whether to read container fills), `slotConstraints` (whether to consolidate slot constraints), and `inferNumberProps` (whether numeric-looking text props become number props).

### Option 6A: Test each member; all four are conventions *(Selected)*

| Member | If a different team set it differently | Verdict |
|---|---|---|
| `subcomponents.scope` | A library keeping subcomponents on the page yields none under `NESTED` | Convention |
| `instanceExamples.scope` | A library keeping examples on other pages yields none under `PAGE`; a `FILE` search of a single-page library can match foreign frames | Convention |
| `images.backgroundImage` | A library expressing images as container fills loses them when false | Convention |
| `slotConstraints` | A library authoring slot constraints as code-only props loses declared constraint data when false | Convention |
| `inferNumberProps` | A library authoring numeric props as Figma `TEXT` with numeric defaults gets `StringProp` for genuinely numeric props when false — worse typing, not different typing | Convention |

Each states how the library is organized or authored — **where** its assets live, **how** it expresses images, **how** it declares constraints, **how** it types numbers. None can be chosen freely.

**`collapsePrimitiveWrapper` is the one that stays a setting**, and the distinction is worth stating: that a wrapper around a lone text or glyph is meaningless *is* a library fact, but keeping it is faithful to Figma rather than wrong. Stripping it is a normalization choice, so both outputs are correct and the substitution test passes it to settings.

**Pros**:

- **No feature is split.** All five name-based features live wholly in `conventions.figma` and are read in one place
- Consistent with Decision 8: a declared convention declares the capability, and `scope` is part of the declaration rather than a dial on top of it
- Leaves `settings` holding only members that cannot be wrong
- Removes the awkward case where `scope` and `match`, authored together and meaningless apart, would sit in different artifacts

**Cons / Trade-offs**:

- `backgroundImage`, `slotConstraints`, and `inferNumberProps` read as toggles and are classified as declarations; their names would be clearer as statements about the library (renames deliberately not taken here)
- A team wanting a narrower search for speed cannot express it in configuration — and would get different output if they could, which is the point. Per-run narrowing belongs to the invocation, as in Decision 8

---

### Option 6B: Split the blocks — patterns to conventions, toggles to settings *(Rejected)*

**Rejected because**: it fails the substitution test on every one of them. `scope` is determined by where the library puts its assets, and the wrong value produces missing or foreign matches rather than merely different output. Splitting also separates `scope` from `match`, which are authored together and meaningless apart.

---

### Option 6C: Move whole blocks by majority, without testing each member *(Rejected)*

**Rejected because**: it reaches the selected answer by accident rather than by rule, and would have carried `collapsePrimitiveWrapper` across with the others.

---

## Decision 7 — The shape of name-based conventions

Five conventions answer the same question — *which assets in the file are these?* — under three different key shapes:

| Member | Key today | Value today | Placeholders |
|---|---|---|---|
| `glyphNamePattern` | scalar, suffixed | one pattern | `{i}` |
| `codeOnlyPropsPattern` | scalar, suffixed | one pattern | none — a literal layer name |
| `imageComponent` | scalar, prefixed | one component name | none |
| `subcomponents` | block | `match` list, `exclude` list | `{C}`, `{S}` |
| `instanceExamples` | block | `match`, `exclude`, `parentNames` lists | `{C}` |

The suffix restates what the block already says, and the same idea is spelled three ways depending on when each member was added.

### Option 7A: One block per named thing, keyed `match` — cardinality unchanged *(Selected)*

Every name-based convention becomes a block named for the thing it finds, with its pattern under `match`. **What each member accepts does not change**: members that take one pattern still take one, members that take lists still take lists, and `exclude` appears only where it exists today.

```yaml
conventions:
  figma:
    glyphs:
      match: "DS Icon Glyph / {i}"
    codeOnlyProps:
      match: "Code only props"
    images:
      backgroundImage: true
      match: "DS Image"
      sourceProps:
        - Image
    subcomponents:
      scope: PAGE
      match:
        - "{C} / {S}"
      exclude:
        - "{C} / Examples / {S}"
    instanceExamples:
      scope: PAGE
      match:
        - "{C}*"
      parentNames:
        - Examples
```

**Pros**:

- **The suffix disappears.** Inside `conventions.figma` everything is a name pattern, so `glyphNamePattern` becomes `glyphs.match` — shorter, and it says more
- **One vocabulary.** `match` means the same thing in every member; a reader who knows `subcomponents` can read `glyphs` without checking
- **No implementation is demanded.** Nothing gains a capability, nothing needs new matching logic, and no member starts accepting input it did not accept before. The change is naming and nesting only
- **A later widening stays possible and stays a decision.** If a catalog ever needs two icon patterns, `glyphs.match` can widen — but that is a separate ADR with its own justification, not a consequence of this one

**Cons / Trade-offs**:

- `match` has two cardinalities across members, so the uniformity is in the key, not the type
- Five members change path on top of the regrouping
- Placeholder grammars still differ per member (`{i}`, `{C}`, `{S}`); a shared key name may imply a shared grammar, and documentation has to carry the distinction

---

### Option 7B: Uniform *and* capability-complete — lists and `exclude` everywhere *(Rejected)*

Give every member `match: string[]` and `exclude?: string[]`, so the five are interchangeable in shape and capability.

**Rejected because**: it invents features to satisfy a symmetry. Nothing in the validation library needs a second glyph pattern, an excluded code-only-props frame, or a second image component, and each addition is matching logic to implement, test, and document. A schema that declares capability the transformers do not honor is worse than an asymmetric one that tells the truth.

---

### Option 7C: Keep the scalars as they are *(Rejected)*

**Rejected because**: it keeps a redundant suffix inside a block whose name already supplies it, and keeps one question spelled three ways. The rename costs nothing beyond the `MAJOR` already being taken, and this is the only moment it is free.

---

### Option 7D: Group name-based members under a `names` sub-block *(Rejected)*

**Rejected because**: it separates name-based conventions from semantic ones at the cost of a fifth nesting level, and the block-with-`match` shape already signals which kind a member is.

---

## Decision 8 — What replaces block presence as the detection switch

Five features are switched on today by the **presence of a block that also carries the convention**:

```yaml
# Today — one block, two jobs
processing:
  subcomponents:              # present = detect subcomponents
    match:                    # ...and here is how to find them
      - "{C} / {S}"
```

Splitting the block separates the switch from the pattern, and the implicit "detect this" needs somewhere to go — or needs to be shown unnecessary.

### Option 8A: Convention presence declares the capability; no switch exists *(Selected)*

A declared convention means the library follows it, and a library that follows a convention wants it processed. There is no switch, in either half.

```yaml
conventions:
  figma:
    subcomponents:
      match:
        - "{C} / {S}"

settings:
  processing:
    subcomponents:
      scope: PAGE             # only genuine run choices remain
```

**Pros**:

- **Nothing is invented.** No member is added, and no consumer writes a line it does not write today
- **Behavior is unchanged.** Declaring a convention detects; declaring none does not — the same two states the presence rule produces now
- **Decision 1 holds.** Convention presence does not *drive* the run, it *enables* it. What a run does with a declared capability is the run's business, and belongs to the invocation
- **Two of five features stay whole.** `glyphs` and `codeOnlyProps` have no genuine run choices, so they appear on the conventions side only — no settings block exists solely to hold a toggle
- **No half-states.** A switch would introduce "declared but off" and "on but undeclared"; neither is representable

**Cons / Trade-offs**:

- Skipping a feature for one run is not expressible in configuration. It belongs to the invocation — a CLI flag — and is out of scope here
- The plugin's five booleans gain no contract counterpart and remain application preferences, which is the correct home for a panel checkbox that skips work

---

### Option 8B: An explicit `detect` setting per feature *(Rejected)*

Add `detect?: boolean` to each feature's settings block, defaulting to `true`.

**Rejected because**: it invents a capability to fill a hole the split created. Nobody following a convention wants it ignored, so `detect: false` answers a question no library asks — the same reasoning that rejects Option 7B, and it applies with equal force here. It also costs two settings blocks (`glyphs`, `codeOnlyProps`) that would exist only to hold a toggle, doubles the locations to consult per feature, and introduces two half-states that must then be diagnosed.

---

### Option 8C: Presence of the settings block is the switch *(Rejected)*

**Rejected because**: it preserves the ambiguity in a worse place. Every member of those settings blocks is defaulted, so the on-state is an empty block whose only meaning is that someone typed its name, and `scope` — which has a default — becomes load-bearing by proximity.

---

## Decision 9 — What becomes of `Config` and `Config.ts`

### Option 9A: Retire both; `Conventions.ts` and `Settings.ts` replace them *(Selected)*

No container type is introduced. `Config.ts` splits into two files, and `Metadata` carries both halves as siblings:

```yaml
metadata:
  conventions:
    figma:
      keys: SENTENCE
  settings:
    format:
      color: HEXA
```

**Pros**:

- **Avoids a collision the container would create.** `types/` is flat and already holds `PropConfigurations.ts`; a `Configuration.ts` beside it invites a misread on every import
- **One concept per file**, matching the directory's existing pattern — `Anatomy.ts`, `Props.ts`, `Variant.ts`
- **Type files mirror artifacts.** `Conventions.ts` ↔ `conventions.yaml`, `Settings.ts` ↔ `settings.yaml` (Decision 10)
- **Retires the vague word entirely.** "Config" is the term whose ambiguity let two kinds of value share one structure; naming nothing that removes the temptation to put a third kind there
- Each half is separately diffable in `metadata` — the drift check the linter wants compares `metadata.conventions` directly, with nothing to unwrap

**Cons / Trade-offs**:

- `metadata` gains two keys where it had one, and nothing states that the two were resolved together for one run — beyond their appearing in the same `metadata` block for the same output
- A consumer that genuinely wants "the whole configuration" declares a local pair type
- `DEFAULT_CONFIG` becomes `DEFAULT_SETTINGS` in `Settings.ts`, joined by `DEFAULT_PIPELINE` and `DEFAULT_CONVENTIONS` — one defaults constant per artifact. `DEFAULT_CONVENTIONS` carries only the three members that have a default; no convention *block* is defaulted, because absence is the statement that a library declares none

---

### Option 9B: A `Configuration` container replacing `Config` *(Rejected)*

**Rejected because**: it collides in a flat `types/` directory with `PropConfigurations.ts`, and it re-implies the two halves are one thing at the exact moment the ADR separates them. It also preserves a container whose only remaining job — giving `metadata` a single key — is served just as well by two keys that can be compared independently.

---

### Option 9C: Keep `Config` as the container *(Rejected)*

**Rejected because**: it keeps both the collision risk and the vague word, and the constitution already lists `Config` as a grandfathered abbreviation that new work should avoid.

---

## Decision 10 — Workspace artifact layout, and where paths live

`workspace.schema.json` (ADR 054) describes `specs.config.yaml`, so the artifact's shape is governed by this package and is in scope here. Today that one file carries three unrelated things: `dataDirectory` and `outputDirectory` at the root, a `sources` block, an `output` block, and a `config` block holding everything else.

### Option 10A: One artifact per question; work and place are separate *(Selected)*

```
config/
  conventions.yaml     # what the library is
  settings.yaml        # how output behaves, and where it goes
  pipeline.yaml        # what to run
.env                   # unchanged, at the workspace root
```

**On the folder name.** Frontend tooling names config either for the tool (`.storybook/`, `.github/`) or as a root file (`vite.config.ts`), and a generic `config/` is more Rails idiom than JS. `.specs/` was considered and rejected: `conventions.yaml` is the one artifact meant to be authored, published, and handed to other teams, and hiding the least engineering-facing file behind a dotfolder is the wrong trade. A Specs workspace is a directory dedicated to Specs, so `config/` carries no ambiguity within it.

**Settings groups by concern, not by kind.** Three blocks — `data`, `spec`, and `assets` — each hold their own members *and* their own `directory`. The former `processing` / `format` / `include` grouping is retired: it sorted members by what kind of knob they were, which is not a question anyone asks. `sources` folds into `data`, since declaring what to fetch and declaring where it lands are one concern.

**`assets` is grouped by consumer, not producer.** Icons, images, generated CSS, and fonts arrive from fetch, from generate, from transform, and sometimes from a process outside this tool entirely. What unites them is that every code output points at them, whatever the platform.

**Analysis output has no block.** It is analysis *of* spec data and is inseparable from it, so it stays derived beneath the spec directory as it is today.

**Pipeline declares work; settings declares place.** Transformers and analyses name what runs and nothing else. They do not carry output paths, because they do not own locations — every transformer writes *into* the spec structure the CLI owns (`<component>/generated/`, with `contract`, `css`, and `react` output side by side), and every analysis writes to one analysis location. A per-transformer directory would either fracture that structure or have several transformers name the same path and comingle.

**Pros**:

- **Each output kind is a concern with a home.** `spec`, `analysis`, and `foundations` are separately relocatable, and each block is where that kind's future settings land
- **No transformer name enters the schema** (Constitution III), because no transformer declares a path
- Each artifact answers one question, and `conventions.yaml` can be published by a library for every consuming workspace to adopt verbatim
- `.env` stays at the root, where dotenv-style discovery expects it

**Cons / Trade-offs**:

- **Per-target output locations are unresolved and deliberately out of scope.** Some transformers imply a destination (`react` produces a library, and a storybook alongside it); others do not (`contract` emits beside the spec). Modeling targets here would force every transformer to answer a question only some of them have, so where an assembled library and its storybook live is left to the transformer package that owns them
- `assets` begins as a block holding only a `directory`
- Three files where there was one, and existing workspaces need a read path for the old arrangement
- Naming the assets location makes configurable what is derived today — new capability, deliberately taken

---

### Option 10B: An aggregated `directories` map *(Rejected)*

```yaml
output:
  directories:
    specs: ./specs
    analysis: ./analysis
    react: ./src/react
```

**Rejected because**: it collects paths by virtue of being paths, which is the same "group by kind" mistake as `processing` / `format` / `include`. Every new output kind edits a central map rather than declaring itself, and listing transformer names — `react`, `storybook` — would put one consumer's vocabulary in the shared contract, which Constitution III forbids.

---

### Option 10C: One artifact with three top-level blocks *(Rejected)*

**Rejected because**: it leaves conventions un-shareable without extracting a fragment from a file that also carries settings and pipeline. The types would say the halves are separable while the artifact denies it.

---

## Decision

Retire `Config`. Publish two independent root types — `Conventions` (namespaced by source) and `Settings` — in their own files, and split the workspace artifact to match.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Removed; `Config` and `ResolvedConfig` retired | MAJOR |
| `Conventions.ts` | Added — `Conventions` / `ResolvedConventions`, with a `figma` namespace | MAJOR |
| `Settings.ts` | Added — `Settings` / `ResolvedSettings`, grouped by concern: `data` (absorbing `sources`), `spec`, `assets` | MAJOR |
| `Conventions.ts` | Holds `naming` (from `format.figmaKeys`), `states`, `slotConstraints`, `inferNumberProps`, and the five name-based features whole, including `scope` and `backgroundImage` per Decision 6 | MAJOR |
| `Conventions.ts` | Rekeyed name-based conventions to `<thing>.match`: `glyphNamePattern` → `glyphs.match`, `codeOnlyPropsPattern` → `codeOnlyProps.match`, `imageComponent` → `images.match`. Value types unchanged | MAJOR |
| `Settings.ts` | `processing` / `format` / `include` retired; their members fold into `spec`, and `format.output` becomes `spec.format` | MAJOR |

| `Settings.ts` | Workspace members absorbed: `sources` → `data.sources` (its `data` list renamed `fetch`), `outputDirectory` → `spec.directory`, `splitComponents` / `splitConcerns` / `useSubfolders` → `spec`, `dataDirectory` → `data.directory` | MAJOR |
| `Settings.ts` | `transformers` removed — work to run moves to its own artifact per Decision 10 | MAJOR |
| `Settings.ts` | `author` absorbed from the workspace root | MAJOR |
| `Pipeline.ts` | Added — `Pipeline` / `ResolvedPipeline`, holding `transformers` and `analyses` | MAJOR |
| `Conventions.ts` | `VariantStateEntry` relocated here, beside `states` | MAJOR |
| `Settings.ts` | `ColorFormat` relocated here, beside `spec.color` | MAJOR |
| `Pipeline.ts` | `TransformEntry` relocated here, beside `transformers`; an `AnalysisEntry` of the same shape is added for `analyses` | MAJOR |
| `Settings.ts` | `DEFAULT_CONFIG` → `DEFAULT_SETTINGS`, typed `ResolvedSettings` | MAJOR |
| `Metadata.ts` | `config: Config` → `conventions: ResolvedConventions` and `settings: ResolvedSettings` | MAJOR |
| `index.ts` | Exports both types and their resolved forms; `Config` exports removed | MAJOR |

**Example — new shape**:

```yaml
# Before — types/Config.ts
Config:
  processing:
    glyphNamePattern?: string
    variantDepth?: 1 | 2 | 3 | 9999
    inferNumberProps?: boolean
  format:
    output?: 'JSON' | 'YAML'
    figmaKeys?: 'NONE' | 'SENTENCE' | 'TITLE'
    keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'

# After — types/Conventions.ts
Conventions:
  figma:
    naming?: 'NONE' | 'SENTENCE' | 'TITLE'
    inferNumberProps?: boolean
    glyphs?:
      match: string

# After — types/Settings.ts
Settings:
  spec:
    directory?: string
    format?: 'JSON' | 'YAML'
    keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'
    variantDepth?: 1 | 2 | 3 | 9999
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Removed `#/definitions/Config` | MAJOR |
| `component.schema.json` | Added `#/definitions/Conventions` and `#/definitions/Settings` | MAJOR |
| `pipeline.schema.json` | Added — validates `config/pipeline.yaml` | MAJOR |
| `component.schema.json` | `metadata.config` → `metadata.conventions` + `metadata.settings` | MAJOR |
| `workspace.schema.json` | Removed — one schema per artifact replaces it | MAJOR |
| `conventions.schema.json` | Added — validates `config/conventions.yaml` | MAJOR |
| `settings.schema.json` | Added — validates `config/settings.yaml`, absorbing the former top-level workspace members | MAJOR |

**Example — new shape** (`schema/component.schema.json`):

```yaml
Conventions:
  type: object
  description: "Facts about the library a spec was generated from, namespaced by source. Every consumer reading the same library declares the same values; differing values produce incorrect output, not merely different output."
  properties:
    figma:
      type: object
      properties:
        keys:
          enum:
            - NONE
            - SENTENCE
            - TITLE
        glyphs:
          type: object
          properties:
            match:
              type: string
        subcomponents:
          type: object
          properties:
            match:
              type: array
            exclude:
              type: array
        states:
          type: object
  # not in required[] at any level — a library may declare no conventions
```

### Notes

- **Both halves need a resolved form, for different reasons.** `ResolvedSettings` guarantees every defaulted member is present. `ResolvedConventions` guarantees the members *inside* a present convention block are present — `subcomponents.scope`, `instanceExamples.scope`, `images.backgroundImage` and `sourceProps` all default within a declared block, exactly as `ResolvedConfig` does today. What conventions lack is a default for the *block itself*: absence means the library declares no such convention, and nothing can supply that. `DEFAULT_CONVENTIONS` therefore carries the three defaultable members and no blocks
- **`data.directory` holds artifacts of four different lifecycles**, and the block is named `data` rather than `cache` for that reason. It carries fetched downloads (`library.<kind>.json`, one per entry in `sources.<name>.data`), computed caches (`cache/*.yaml`), extracted assets (`icons/*.svg`), an authored input that injects into a fetched artifact (`token-mappings.json`), and a manifest that is fetched and then authored in place. Naming it `cache` would invite a deletion that destroys authored work. Separating the authored inputs from the regenerable artifacts is a real follow-up and is **not** taken here
- **`sources` folds into `data`, and its `data` list is renamed `fetch`.** Nested under the block it now belongs to, `data.sources.<name>.data` would stutter; `fetch` names what the list actually is — the artifacts to download for that source
- **Work to run is not a setting.** `transformers` names *work* rather than how work behaves, and it is joined by `analyses`, which no artifact declares today. Both move to `pipeline.yaml` (Decision 10), which removes the odd member from `Settings` and gives analyses a declared home for the first time
- **Application preferences are deliberately absent from the contract.** Values that never reach a spec — canvas column count, which sections a consumer renders, whether prior output is replaced — belong to the consumer that holds them. Naming the category is the contribution; owning it is not
- **`VariantStateEntry` and `TransformEntry` are unchanged**, referenced from their new locations
- **One canonical definition per shape, referenced rather than copied.** This package validates two different things: the configuration a person authors in a workspace, and the spec output the tool generates, whose `metadata` embeds the resolved configuration as provenance. The same shapes therefore appear on both sides — and today `workspace.schema.json` carries its own copy of `VariantStateEntry` alongside `component.schema.json`'s. The split multiplies that risk — `metadata` embeds conventions and settings, while the workspace artifacts validate the same shapes — so each shape is defined once and referenced by `$ref` from the other schema files. Constitution IV requires the schemas to remain internally consistent, and duplication is the mechanism by which they drift
- **No migration logic is added to this package** (Constitution II). Reading a pre-split artifact is a consumer concern

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Conventions` ↔ `#/definitions/Conventions`; `Settings` ↔ `#/definitions/Settings`; each moved member's schema property moves with its type field; `ResolvedSettings` is required-with-defaults while `ResolvedConventions` stays optional throughout; `metadata.conventions` and `metadata.settings` ↔ the matching `#/definitions/Metadata/properties` entries; `workspace.schema.json`'s two artifacts reference the same two definitions

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Reads convention and setting members from new paths under renamed types | Update configuration access and type imports; no behavior change |
| `specs-cli` | Workspace artifact splits into `config/conventions.yaml` and `config/settings.yaml`; `metadata` carries two keys where it carried one | Update configuration access and imports; provide a read path for the pre-split artifact; surface which half a validation error came from |
| `specs-plugin-2` | Holds configuration independently of any workspace, in one flat persisted map that mixes all three categories. Its own exported `Settings` type collides with the schema's and is renamed `PanelSettings` | Update configuration access and imports; separate persisted preferences from the shared halves; the convention set becomes comparable against a workspace's, making parity checkable rather than assumed |

**On the plugin's flat map.** Its persisted settings interleave conventions, settings, and a third group that never reaches a spec:

```ts
// specs-plugin-2 — persisted values with no effect on any spec
OUTPUT_COLUMNS: 1 | 2 | 3 | 4           // canvas layout of rendered output
OUTPUT_DATA: boolean                     // which sections to draw on canvas
OUTPUT_STYLING: boolean
OUTPUT_ANATOMY: boolean
OUTPUT_LAYOUT: boolean
OUTPUT_PROPS: boolean
OUTPUT_MODES: boolean
OUTPUT_REPLACE: boolean                  // overwrite prior canvas output
ANATOMY_CONTENT: 'CANVAS' | 'DEV_MODE'   // which surface anatomy is read from
```

These are **application preferences** (Decision 4). They are the plugin's to keep, and this ADR neither types them nor moves them — it names the category so they have somewhere to belong that is not the shared contract.

Two further representational differences are worth naming because they are the plugin's, not the contract's:

- **Feature on-switches are booleans** (`SUBCOMPONENTS`, `GLYPHS`, `IMAGES`, `CODE_ONLY_PROPS`, `INSTANCE_EXAMPLES`) where the contract has no counterpart at all. Per Decision 8 they stay application preferences — a panel checkbox that skips work is a UI affordance, not a statement about the library. The plugin keeps them; the contract does not gain them
- **Pattern members are single strings** (`SUBCOMPONENT_MATCH`) where the contract uses arrays

Neither is changed by this ADR. Both become easier to reconcile once the halves are addressable, because the plugin can map its map onto two named types rather than onto one undifferentiated one.

---

## Semver Decision

**Version bump**: MAJOR

**Justification**: A published type is removed and replaced by two, fields move between paths, a generated `metadata` key is replaced by two, and the workspace artifact splits. Per the constitution, any change to a type signature, field name, field presence, or schema structure is `MAJOR`. Every consumer reading the old paths breaks at compile time, which is the desired failure mode.

---

## Consequences

- The contract states which configuration values describe the library and which describe the run, and a consumer can tell them apart without knowing the ecosystem's history
- Conventions can be published once per library and adopted verbatim by every workspace and consumer that reads it
- Absence means one thing per side: a missing setting is defaulted; a missing convention is declared absent
- Every name-based feature is read in one place — no feature is assembled from both halves — and `settings.processing` is left holding only members that cannot be wrong
- A convention mismatch between two consumers of one library becomes a diffable difference in `metadata.configuration` rather than an unexplained difference in output
- The plugin's isolated configuration and a workspace's become comparable on the half where agreement actually matters
- `conventions.figma` leaves room for conventions of other sources without a further breaking change
- Every name-based convention is keyed the same way, so `match` means one thing across the block — without any member gaining a capability it does not have today
- Widening a single-pattern member to a list remains available as its own decision, with its own justification
- A third category — application preferences — is named and deliberately excluded, so the next consumer-local value has an obvious home outside the contract
- Declaring a convention is what enables its processing, so no consumer writes a switch and no configuration gains a member to preserve today's behavior
- Skipping a feature for a single run is an invocation concern rather than a configuration one, and is deliberately left to the CLI surface
- New configuration members must be classified on arrival: a small ongoing tax, and the mechanism that keeps the split honest
- Every consumer updates imports and configuration access in the same release, and pre-split workspaces need a read path provided outside this package
- The `Config` abbreviation exception can be removed from the constitution's exceptions list, since no type carries the name
- `metadata.conventions` is comparable across specs and consumers on its own, which is what makes convention drift detectable rather than merely diffable
- Conventions and `data.sources` land on opposite sides, which names a new error class worth linting: a conventions file paired with a source it was not written for
- Shared assets have one declared home that every code output can point at, whatever the platform
- Where an assembled library and its storybook live remains open, scoped to the package that produces them rather than to the shared contract
