# ADR: Lossless key formatting — safe key grammar and Figma name preservation

**Branch**: `066-lossless-key-formatting`
**Created**: 2026-08-10
**Status**: ACCEPTED
**Summary**: A `format.figmaKeys` option and safe key grammar preserve Figma layer names losslessly through `com.figma.name`.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-058)*

---

## Context

`config.format.keys` selects a naming convention (`SAFE`, `CAMEL`, `SNAKE`, `KEBAB`, `PASCAL`, `TRAIN`) that is applied to every authored key in a spec: `anatomy` keys, `props` keys, and every reference to them — `elements`, `propConfigurations`, `children`, `slotContent`, `instanceExamples`, `compositions`.

Every format other than `SAFE` is a lossy projection. The formatted key is derived by splitting the source name into `[A-Za-z0-9]` words and re-joining them, which discards:

- **Separator identity** — `Icon leading`, `Icon-leading`, and `Icon_leading` all become `iconLeading` / `icon-leading` / `icon_leading`. The source separator is unrecoverable.
- **Casing** — `URL field` and `Url field` both become `urlField`; `Icon Leading` and `Icon leading` are indistinguishable after formatting.
- **Non-alphanumeric characters** — `&`, `+`, `/`, `.`, `()`, and every non-ASCII letter are deleted outright, taking their word boundary with them: `Cut & paste` becomes `cutPaste`, and nothing in the spec records that a `&` was ever there.
- **Word boundaries adjacent to digits** — `Icon 2 leading` collapses to `icon2Leading`, and no rule recovers the boundary.

Because the schema has no record of the name a key was derived from, a spec produced with any format other than `SAFE` cannot be rendered back into Figma faithfully. Figma layer names and component property names are the identity used to match existing nodes; a formatted key that no longer reconstructs the Figma name causes the render direction to create duplicates or fail to bind.

Three things are missing from the contract:

1. A stated **source name shape** on the Figma side, so producers and consumers agree on what an unformatted key looks like and what a formatted key reverses to.
2. A stated **safe key grammar** — the set of names that survive every `format.keys` value unchanged in meaning.
3. A place to record the **Figma name** whenever a key falls outside that grammar.

The precedent for the third already exists: `AnatomyElement.$extensions['com.figma'].originalName` records the pre-collapse layer name for wrapper-collapsed elements (ADR-058, shipped in `0.28.0`). This ADR generalizes that field to all lossy key derivations, adds the equivalent to props, and renames it to match its widened meaning.

---

## Decision Drivers

- **Round-trip fidelity**: a spec must carry enough information to reconstruct the Figma name of every anatomy element and prop, under any `format.keys` value.
- **Mechanically verifiable contract** (Constitution IV): "which keys are safe" must be expressible in JSON Schema, not only in prose.
- **Quiet by default**: the preservation field must not appear on well-formed specs. A catalog that follows the safe grammar emits no extensions at all.
- **Formats must stay fit for purpose**: `CAMEL` and `PASCAL` exist to produce code identifiers. No widening of the safe character set may compromise that.
- **No logic in this package** (Constitution II): the schema declares the grammar and the fields; deriving and emitting them is producer behavior.
- **Types and schema symmetry** (Constitution I): every added field lands in both `types/` and `schema/`.
- **Minimal, intentional public API** (Constitution III): prefer one field with one meaning over parallel fields or a deprecated alias carried forward.
- **References must stay resolvable**: `elements`, `propConfigurations`, and other key references continue to point at formatted keys — no reference-site duplication of source names.

---

## Options Considered

### Decision 1 — Where the Figma name is preserved

#### Option A: `$extensions['com.figma']` on the definition *(Selected)*

Record the Figma name once, on the `anatomy` element definition and on the prop definition. Reference sites (`elements`, `propConfigurations`, …) continue to use the formatted key and resolve the Figma name through the definition.

**Pros**:
- Reuses the field ADR-058 already established for exactly this purpose on `AnatomyElement`.
- Single source of truth — no chance of divergent values at reference sites.
- Absent on well-formed specs, satisfying "quiet by default".
- Optional field on both types — no reference-site schema churn.

**Cons / Trade-offs**:
- Consumers must dereference the definition to recover the Figma name for a reference.

---

#### Option B: A parallel key-map block on `Component` *(Rejected)*

A top-level `keyMap: Record<string, string>` mapping formatted key → Figma name.

**Rejected because**: it introduces a second naming surface outside `$extensions`, with no namespace, and its entries are ambiguous across the anatomy and prop key spaces (a component may have an anatomy element and a prop that format to the same key). It also grows a block on every component rather than staying quiet by default.

---

#### Option C: Emit unformatted keys and store the formatted key in extensions *(Rejected)*

Invert the relationship — keys stay as Figma names, and the `format.keys` result is recorded in `$extensions`.

**Rejected because**: `format.keys` exists so consumers can read keys in their own platform's convention directly. Moving the formatted value into extensions defeats the feature and breaks every existing consumer of formatted output.

---

### Decision 2 — What that field is called

#### Option A: Rename `originalName` → `name` *(Selected)*

Within `$extensions['com.figma']`, the field becomes `name`. `AnatomyElement` is renamed; `FigmaPropExtension` gains the field under the new spelling.

```yaml
# Before (ADR-058)
$extensions:
  com.figma:
    originalName: Leading icon

# After
$extensions:
  com.figma:
    name: Leading icon
```

**Pros**:
- The namespace already carries the qualifier — `com.figma.name` reads as "this element's name in Figma", which is precisely the contract.
- `original` becomes inaccurate once the field generalizes. Under ADR-058 it meant *pre-collapse*; here it also means *pre-format*. "Original relative to what?" has two answers, and the shared answer is simply "in Figma".
- One field, one meaning, two reasons it may be present — rather than a qualifier that describes only one of them.
- Satisfies Constitution III: the smallest accurate public name.

**Cons / Trade-offs**:
- Breaking rename of a field shipped in `0.28.0`. See Migration — the real footprint is three call sites in one repo.

---

#### Option B: Add `name`, deprecate `originalName` *(Rejected)*

Ship both spellings, remove `originalName` at the next MAJOR.

**Rejected because**: it buys a compatibility window no consumer needs (see Migration) at the cost of a period where either spelling may appear, forcing every reader to check both and every producer to choose. The ADR would ship ambiguity to avoid four line edits.

---

#### Option C: Keep `originalName` *(Rejected)*

**Rejected because**: the field's meaning is being redefined by this ADR regardless. Retaining a qualifier that is accurate for only one of its two triggers embeds the confusion permanently to avoid a one-time rename.

---

### Decision 3 — How the source-side name shape is declared

Reversal needs a stated target: given `iconLeading`, a renderer can only reconstruct the Figma name if it knows what convention that file's names follow. Three ways to supply it.

#### Option A: New `format.figmaKeys` config field, defaulting to `NONE` *(Selected)*

Add a sibling to `format.keys` declaring the naming convention the Figma file itself uses, so `format.keys` describes the *output* convention and `format.figmaKeys` describes the *source* convention. Reversal is defined as: format the key back into `format.figmaKeys`.

```yaml
format:
  figmaKeys: SENTENCE   # what the Figma file uses    — new, defaults to NONE
  keys: KEBAB           # what the spec emits         — existing
```

The accepted values are `NONE`, `SENTENCE`, and `TITLE`. `SENTENCE` and `TITLE` are the two conventions observed in practice for Figma layer and component-property names — deliberately narrower than `format.keys`; values are added when a real file requires them, not in anticipation.

`NONE` is the default and means **no source convention is declared**. Under `NONE` the producer asserts nothing about the file's names, so the safe key grammar is not evaluated, no `name` is emitted for format divergence, and no reversal target exists. The ADR-058 wrapper-collapse trigger for `name` is unaffected — it does not depend on a declared convention.

Everything this ADR adds is therefore **opt-in**: a catalog gets the grammar check, the divergence extension, and reversible rendering by declaring `figmaKeys: SENTENCE | TITLE`, and keeps today's *behavior* by leaving it alone.

`NONE` is not byte-identical to today's output. The `originalName` → `name` rename applies unconditionally, so any catalog with a wrapper-collapsed element emits a differently-spelled extension under `NONE` too. What `NONE` preserves is the behavior — which names are formatted, which extensions are triggered — not the bytes.

Opting in is a real trade, not a free upgrade. A catalog that declares `SENTENCE` buys lossless round-tripping and pays for it in spec complexity: every name outside the safe grammar, and every name already written in the destination format, grows a `$extensions` block. On a catalog with inconsistent Figma naming that is a lot of new noise in the output. That cost is the reason the default is `NONE` — the author decides whether the fidelity is worth the specs it produces.

**Pros**:
- Reversal becomes a declared, symmetric pair rather than a hardcoded assumption.
- Files authored in `Title Case` become losslessly reversible without emitting `name` on every key.
- Defaulting to `NONE` makes the checks and preservation behavior opt-in. No existing catalog changes output, and no catalog is told its layer names are "unsafe" against a convention it never claimed.
- Both non-`NONE` values use single-space separators, so the safe grammar's character rules stay uniform and only its casing clause varies.

**Cons / Trade-offs**:
- The default is the *un*safe setting: a catalog gets lossy keys until someone opts in. This is deliberate — the alternative is asserting a convention on the author's behalf and emitting extensions against an assumption they never made.
- A file with mixed conventions still diverges from whatever single value is declared, so `name` remains necessary as the escape hatch.
- A future file using an unlisted convention needs a schema change to declare it, rather than picking an already-present enum value.

---

#### Option B: Hardcode sentence case in the schema documentation *(Rejected)*

Declare in prose that Figma names are always assumed sentence case, with no config surface.

**Rejected because**: it is wrong for real files. A library whose layer names are `Title Case` would emit `name` on every anatomy element and every prop, making the "quiet by default" driver unachievable for that catalog and burying genuine problems in noise.

---

#### Option C: Infer the source convention per component from the observed names *(Rejected)*

**Rejected because**: inference is producer logic with no stable contract — the same catalog could infer differently as components are added, and the schema would have no way to state what a spec's keys reverse to. It also violates Constitution II if expressed here.

---

### Decision 4 — How wide the safe character set is

#### Option A: ASCII letters and digits only *(Selected)*

The safe set is `[A-Za-z0-9]` plus the single-space word separator. Every other character — `&`, `+`, `/`, `.`, `()`, punctuation, non-ASCII letters — is unsafe and routes to `com.figma.name`.

**Pros**:
- Keeps `CAMEL` and `PASCAL` fit for purpose. A preserved `&` would emit `cut&Paste` as an anatomy key — valid JSON, unusable as the code identifier those formats exist to produce.
- Avoids ambiguous reversal. Transliterating `&` → `and` cannot be undone: `cutAndPaste` may have come from `Cut & paste` or from a literal `Cut and paste`.
- One rule covers all six output formats, rather than a per-format safe set consumers must track.

**Cons / Trade-offs**:
- Common authoring characters (`&`, `+`, `/`) always trigger the extension, so catalogs using them are not extension-free.

---

#### Option B: Widen the safe set to retain `&` and `+` *(Rejected)*

Preserve selected symbols through formatting rather than deleting them.

**Rejected because**: it violates the "formats must stay fit for purpose" driver. These characters can only survive `SAFE`; under `CAMEL`, `PASCAL`, `SNAKE`, `KEBAB`, and `TRAIN` they either produce illegal identifiers or must be dropped anyway — meaning the safe set would have to be defined per format, and no single grammar could describe it.

---

#### Option C: Transliterate symbols to words (`&` → `and`, `+` → `plus`) *(Rejected)*

**Rejected because**: it is lossy in the direction this ADR exists to fix. The transliteration is not injective, so the render direction cannot tell a transliterated key from a literal one, and it silently rewrites author intent into English-specific words.

---

### Decision 5 — Names already written in the destination format

A real Figma file is rarely uniform. A library that is largely `Sentence case` may still carry property names authored as code identifiers — `isDisabled`, `hasIcon` — because they were named for the engineers consuming them. Under `figmaKeys: SENTENCE`, `keys: CAMEL`, `isDisabled` is *unsafe* by the grammar (its first character is lowercase), yet `format.keys` leaves it exactly as it found it, and it is already the name the author wants on both sides.

The forward direction is not the problem — `CAMEL` is idempotent over an already-camel name. The problem is **reversal**: a renderer told to reconstruct the Figma name by formatting `isDisabled` into `SENTENCE` produces `Is disabled` and renames a property the author deliberately spelled `isDisabled`.

#### Option A: Detect names already authored as keys, retain them, and record `name` *(Selected)*

A source name that fails the declared `figmaKeys` grammar but is itself a well-formed key in the declared `format.keys` convention is **already in the destination format**. It is retained verbatim, and `com.figma.name` is emitted so reversal restores it rather than re-deriving it. Names in some *other* key convention are not retained — they are formatted and recorded like any divergent name. The Decision states the tests exactly.

```yaml
# figmaKeys: SENTENCE, keys: CAMEL
props:
  iconLeading:            # from "Icon leading" — SENTENCE-safe, formatted, quiet
    type: glyph
  isDisabled:             # authored as "isDisabled" in Figma — already CAMEL
    type: boolean
    $extensions:
      com.figma:
        name: isDisabled  # reversal is identity, not "Is disabled"
```

**Pros**:
- Answers the case directly: mixed-convention files stop being rewritten on render.
- Requires no new field — the escape hatch this ADR already adds carries it.
- The detection is a pure predicate over two declared grammars, not inference about the file.

**Cons / Trade-offs**:
- **Detection alone cannot make it quiet.** `iconLeading` (formatted from `Icon leading`) and `isDisabled` (authored as-is) are both valid `CAMEL` and both invalid `SENTENCE`. Nothing in the emitted key distinguishes them, so the retained case *must* record `name`. Under a lossy `format.keys`, a catalog with many authored-key names will not be extension-free.
- Only meaningful when a convention is declared. Under `figmaKeys: NONE` there is no grammar to fail, so there is nothing to detect and no reversal to protect.

---

#### Option B: Format everything, as today *(Rejected)*

**Rejected because**: it makes the render direction actively destructive on exactly the files most likely to adopt it — the ones already naming properties for their code consumers. Renaming `isDisabled` to `Is disabled` is a silent, unrequested edit to the author's file.

---

#### Option C: Pass through silently, without `name` *(Rejected)*

**Rejected because**: it is undecidable at read time, as Option A's trade-off shows. A consumer seeing `isDisabled` cannot tell whether the Figma name is `isDisabled` or `Is disabled`, which is the precise ambiguity this ADR exists to eliminate. Quiet output is a driver, but not at the cost of the round-trip guarantee.

This is not the same ambiguity as `figmaKeys: NONE`. Under `NONE` no convention is declared, so a consumer knows reversal is undefined and has no license to reconstruct anything — the spec makes no promise it cannot keep. Option C declares `SENTENCE`, invites a consumer to reverse into it, and then silently exempts some keys from that promise. Undeclared is safe; declared-and-selectively-violated is not.

---

## Decision

### The source convention — `format.figmaKeys`

`format.figmaKeys` declares the naming convention the Figma file uses for layer names and component-property names. It is the target of reversal: a renderer reconstructs a Figma name by re-formatting the spec key into `format.figmaKeys`.

| Value | Shape | Example |
|-------|-------|---------|
| `NONE` *(default)* | No convention declared — grammar not evaluated, no reversal target | — |
| `SENTENCE` | First word capitalized, rest lowercase, single spaces | `Icon leading` |
| `TITLE` | Every word capitalized, single spaces | `Icon Leading` |

`SENTENCE` and `TITLE` are source conventions only; neither is accepted by `format.keys`, which describes what the spec emits.

`NONE` is the default, and everything below is gated on a value other than `NONE`:

- The safe key grammar is not evaluated.
- `com.figma.name` is not emitted for format divergence. The ADR-058 wrapper-collapse trigger is independent of `figmaKeys` and continues to emit it.
- Authored-key retention (below) does not apply — there is no grammar for a name to fail.
- Reversal is undefined. A renderer reading a spec produced under `NONE` has no declared target and MUST fall back to `com.figma.name` where present and the formatted key otherwise — today's behavior.

Declaring `SENTENCE` or `TITLE` opts the catalog into all of it.

### The safe key grammar

*Applies only when `format.figmaKeys` is `SENTENCE` or `TITLE`.*

A name is **round-trip safe** when it satisfies both the character rules and the casing rule for the declared `format.figmaKeys`.

Character and word rules, identical for both `figmaKeys` values:

- ASCII letters and digits only — no `&`, `+`, `/`, `.`, parentheses, punctuation, or non-ASCII letters.
- Exactly one space between words. No leading, trailing, or repeated spaces.
- A word is either all letters or all digits. A digit run is always its own word — `Badge count 2` is three words; `Badge count2` is not safe.
- The name does not begin with a digit — the first word is always a letter word.

Casing rule, per declared convention:

| `figmaKeys` | Pattern |
|-------------|---------|
| `SENTENCE` | `^[A-Z][a-z]*( ([a-z]+\|[0-9]+))*$` |
| `TITLE` | `^[A-Z][a-z]*( ([A-Z][a-z]*\|[0-9]+))*$` |

### The word-splitting rule

Reversal is only deterministic if formatting and reversal split words the same way. Both directions split on:

- **Spaces**, in the source name.
- **Case transitions**, lower→upper (`iconLeading` → `icon` + `Leading`).
- **Letter↔digit transitions**, in both directions (`badgeCount2` → `badge` + `count` + `2`).

The letter↔digit clause is what makes `Badge count 2` safe: it formats to `badgeCount2` and splits back to `badge` / `count` / `2`, recovering the boundary. It is also why `Badge count2` is *not* safe — it formats to the same `badgeCount2`, which reverses to `Badge count 2`, not to the authored name. The grammar excludes mixed letter-digit words precisely so that no two safe names collapse onto one key by this route.

Names satisfying the grammar reconstruct identically from the output of any `format.keys` value. Names that do not satisfy it require `com.figma.name` to be recoverable.

### Names already authored as keys

*Applies only when `format.figmaKeys` is `SENTENCE` or `TITLE`.*

Every Figma name is decided by two tests, in order:

1. **Does it match the origin convention** — the safe key grammar for the declared `figmaKeys`? If so, format it and emit nothing. The key reverses back to the name unaided.
2. **Does it match the destination convention** — a well-formed key in the declared `format.keys`? If so, **retain it verbatim** and record `com.figma.name`.
3. **Otherwise** — it matches neither. Format it, and record `com.figma.name`.

Only the *destination* format retains. A `PascalCase` name with a `KEBAB` destination is not a match: it is reformatted and recorded, exactly like any other divergent name. Retention exists because formatting cannot *convert* between key conventions — it splits on spaces, hyphens, and underscores, not case transitions — so a name already in the destination convention can only be damaged by re-running it through the formatter, never improved.

Test 1 runs first so that a name satisfying both tests stays quiet. `Label` is `SENTENCE`-safe *and* a well-formed `PASCAL` key; formatting and retention produce the same key, so the origin test wins and no extension is emitted for a name that reverses correctly on its own.

`SAFE` has no destination pattern — it emits names as authored, so no consumer reverses a `SAFE` key and test 2 does not apply. `SAFE` is still lossy for the characters it strips (`.`, `[`, `]`, `\`, quotes), so a name it changes is recorded on that basis alone.

```yaml
# figmaKeys: SENTENCE, keys: KEBAB
Icon leading   → icon-leading   # matches origin: formatted, no extension
is-disabled    → is-disabled    # matches destination KEBAB: retained, name: is-disabled
isDisabled     → isdisabled     # matches neither: formatted, name: isDisabled
IsDisabled     → isdisabled     # PASCAL is not the destination: formatted, name: IsDisabled
URL field      → url-field      # matches neither: formatted, name: URL field

# figmaKeys: SENTENCE, keys: CAMEL
isDisabled     → isDisabled     # now matches the destination: retained, name: isDisabled
is-disabled    → isDisabled     # KEBAB is not the destination: formatted, name: is-disabled
```

The retained case always emits `name`. `iconLeading` and `isDisabled` are both valid `CAMEL` and both invalid `SENTENCE`, so the emitted key carries no signal a consumer could use to tell a formatted key from a natively-authored one — the extension is the only thing that distinguishes them.

```yaml
# figmaKeys: SENTENCE

# Safe — survives every format.keys value
Icon leading        # → iconLeading | icon_leading | icon-leading | IconLeading | Icon-Leading
Label
Badge count 2       # → badgeCount2 — the digit is its own word, boundary recovered
Icon 2 leading      # → icon2Leading — same rule

# Unsafe — requires $extensions.com.figma.name
Icon-leading        # separator is not a space
Icon Leading        # casing diverges from SENTENCE (safe under figmaKeys: TITLE)
URL field           # inner capitals lost
Badge count2        # mixed letter-digit word — reverses to "Badge count 2"
2 icons             # name begins with a digit
Cut & paste         # symbol deleted, word boundary lost
Size (large)        # parentheses deleted
Étiquette           # non-ASCII letter deleted
```

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Anatomy.ts` | Renamed `FigmaAnatomyElementExtension.originalName` → `name`, widened to record the Figma name whenever the anatomy key diverges from it (format projection or wrapper collapse) | MAJOR |
| `Props.ts` | Added optional field `name` to `FigmaPropExtension` | MINOR |
| `Config.ts` | Added optional field `format.figmaKeys` to `Config`, required field `format.figmaKeys` to `ResolvedConfig`, and `figmaKeys: 'NONE'` to `DEFAULT_CONFIG` | MINOR |
| `Config.ts` | Expanded `format.keys` documentation to reference `format.figmaKeys` and the safe key grammar | PATCH |

**Example — anatomy extension** (`types/Anatomy.ts`):

```yaml
# Before
FigmaAnatomyElementExtension:
  originalName?: string   # pre-collapse layer name only (ADR-058)

# After
FigmaAnatomyElementExtension:
  name?: string           # the element's name in Figma — present when the key diverges from it
```

**Example — prop extension** (`types/Props.ts`):

```yaml
# Before
FigmaPropExtension:
  type?: string
  source?: FigmaCodeOnlySource

# After
FigmaPropExtension:
  type?: string
  source?: FigmaCodeOnlySource
  name?: string   # optional — present only when the prop key diverges from the Figma property name
```

**Example — config** (`types/Config.ts`):

```yaml
# Before
Config.format:
  output?: 'JSON' | 'YAML'
  keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'

# After
Config.format:
  output?: 'JSON' | 'YAML'
  keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'
  figmaKeys?: 'NONE' | 'SENTENCE' | 'TITLE'   # optional — defaults to NONE
```

**Example — emitted spec under `format.keys: KEBAB`, `format.figmaKeys: SENTENCE`**:

```yaml
anatomy:
  icon-leading:            # safe — derived from "Icon leading", no extension emitted
    type: glyph
  url-field:
    type: text
    $extensions:
      com.figma:
        name: URL field
props:
  is-disabled:             # safe — derived from "Is disabled"
    type: boolean
    default: false
  cut-paste:
    type: boolean
    default: false
    $extensions:
      com.figma:
        name: Cut & paste
elements:
  url-field:               # references remain in formatted key space
    text: Email address
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Renamed `AnatomyElement.$extensions['com.figma'].originalName` → `name`, with widened description | MAJOR |
| `component.schema.json` | Added property `name` to `FigmaPropExtension` | MINOR |
| `component.schema.json` | Added definitions `SafeKeySentence` and `SafeKeyTitle` with their `pattern`s and descriptions | MINOR |
| `component.schema.json` | Expanded descriptions of `Anatomy` and `Props` to reference the safe key definitions | PATCH |
| `workspace.schema.json` | Added property `figmaKeys` under `format`, enum `[NONE, SENTENCE, TITLE]`, default `NONE` | MINOR |

**Example — new definitions** (`schema/component.schema.json`):

```yaml
SafeKeySentence:
  type: string
  pattern: "^[A-Z][a-z]*( ([a-z]+|[0-9]+))*$"
  description: >-
    A round-trip-safe Figma name under format.figmaKeys SENTENCE: ASCII letters
    and digits, single-space word separators, sentence case, each word all
    letters or all digits, never digit-initial. Names matching this pattern
    reconstruct identically from the output of any format.keys value; names
    that do not require $extensions.com.figma.name.

SafeKeyTitle:
  type: string
  pattern: "^[A-Z][a-z]*( ([A-Z][a-z]*|[0-9]+))*$"
  description: >-
    As SafeKeySentence, but for format.figmaKeys TITLE — every letter word
    capitalized.
```

```yaml
# New property under #/definitions/FigmaPropExtension/properties
name:
  type: string
  description: >-
    The Figma component-property name, recorded when the prop key diverges from
    it under format.keys. Absent when the name matches the safe key grammar.
```

```yaml
# New property under #/definitions/.../format/properties (workspace.schema.json)
figmaKeys:
  type: string
  enum: [NONE, SENTENCE, TITLE]
  default: NONE
  description: >-
    Naming convention the Figma file uses for layer names and component
    property names. Reversal target for format.keys. NONE (the default)
    declares no convention — the safe key grammar is not evaluated, no
    com.figma.name is emitted for format divergence, and reversal is undefined.
```

### Notes

- `format.figmaKeys` describes the source, `format.keys` describes the output. They are independent; `figmaKeys: SENTENCE` with `keys: SAFE` is the identity case where keys are emitted as authored.
- `figmaKeys: NONE` (the default) preserves today's behavior, though not today's bytes — the `originalName` → `name` rename applies under it. It is the "I have not told you what my file looks like" value, not a claim that the file has no convention.
- `SafeKeySentence` and `SafeKeyTitle` are definitions, not applied constraints on `Anatomy`/`Props` property names. They describe the *Figma-side* name shape, while the keys in a document are in `format.keys` space.
- `name` remains optional on both surfaces, so a catalog whose names all satisfy the grammar emits no *format-divergence* extensions. Wrapper collapse still emits `name` on its own trigger, independent of `figmaKeys` and of the grammar.
- Reference sites are deliberately unchanged. A consumer resolving `elements.url-field` looks up `anatomy['url-field']` and reads `name` there.
- On `AnatomyElement`, `name` has two triggers — wrapper-collapse promotion and format divergence — that are not distinguished. When both apply, the pre-collapse Figma name is the correct value for both purposes.

### Migration

`originalName` shipped in `0.28.0`. Its consumers are:

| Location | Role | Risk |
|----------|------|------|
| `specs-from-figma` — anatomy element construction | Writes the field | Compile error on rename — caught |
| `figma-from-specs` — collapsed-root name recovery | Reads the field | **Reads via an inline structural type, not the published type — will not fail compilation. Silently yields `undefined` if missed.** |
| `specs-plugin-2` | — | No references |
| `specs-testing` workspace specs | Generated `api.yaml` output | Regenerated, not authored |

The read site in `figma-from-specs` is the one hazard: because it declares the extension shape inline rather than importing `FigmaAnatomyElementExtension`, the rename is invisible to `tsc` there. Implementation MUST update it explicitly rather than relying on the compiler.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `FigmaAnatomyElementExtension.name` (`types/Anatomy.ts`) ↔ `#/definitions/AnatomyElement/properties/$extensions/properties/com.figma/properties/name`
  - `FigmaPropExtension.name` (`types/Props.ts`) ↔ `#/definitions/FigmaPropExtension/properties/name`
  - `Config['format']['figmaKeys']` and `ResolvedConfig['format']['figmaKeys']` (`types/Config.ts`) ↔ `format.figmaKeys` in `schema/workspace.schema.json`
  - `SafeKeySentence` and `SafeKeyTitle` (`#/definitions`) have no TypeScript counterpart — a `pattern` constraint on a string is not expressible as a distinct TypeScript type, and introducing a branded type would be logic, not a declaration (Constitution II). This asymmetry is justified and intentional; the type-side contract remains `string`.

---

## Coverage inventory — every named space in a spec

Two fields (`AnatomyElement.$extensions['com.figma'].name` and `FigmaPropExtension.name`) are claimed to cover all Figma-derived naming in a spec. This inventory is the basis of that claim: every keyed space in the schema, what its keys are, and why it is or is not covered.

| Space | Type | Keys are | Status |
|-------|------|----------|--------|
| `anatomy` | `Record<string, AnatomyElement>` | Figma layer names, formatted | **Covered** — `name` on the definition |
| `props` | `Record<string, AnyProp>` | Figma component-property names, formatted | **Covered** — `name` on the definition |
| `elements` | `Record<string, Element>` | References to anatomy keys | **Covered by reference** — resolves through `anatomy` (Decision 1) |
| `propConfigurations` | `Record<string, …>` | References to prop keys | **Covered by reference** — resolves through `props` |
| `children`, `slotContent` refs, `layout` | key references | References to anatomy keys | **Covered by reference** |
| `compositions[].anatomy` / `.elements` | nested `Anatomy` / `Elements` | Figma layer names, formatted | **Covered recursively** — same `AnatomyElement` type (`Composition.ts:26-27`) |
| `slotContentExamples[].anatomy` / `.elements` | nested `Anatomy` / `Elements` | Figma layer names, formatted | **Covered recursively** — same `AnatomyElement` type (`SlotContent.ts:12-13`) |
| `props.<key>.options` values | string values | Figma variant option values, formatted | **Not covered — gap.** No per-option preservation surface |
| `subcomponents` | `Record<string, Subcomponent>` | Formatted from `sub.title` | **Not needed** — unformatted `title` sits alongside |
| `title` (component, composition, instance example) | `string` | Verbatim Figma node name, never formatted | **Not needed** — nothing was projected |
| `instanceExamples` | `Record<string, InstanceExample>` | Authored identifiers (`^[a-zA-Z0-9_-]+$`), not Figma names | **Out of scope** — carries its own `title` for the label |
| `compositions` (registry keys) | `Record<string, Composition>` | Authored identifiers | **Out of scope** — carries its own `title` |
| `slotContentExamples` (registry keys) | `Record<string, SlotContent>` | Authored registry identifiers | **Out of scope** |
| `images` | `Record<string, ImageData>` | Authored / content-derived identifiers | **Out of scope** |
| `config.format.states` | `Record<string, VariantStateEntry>` | Config-declared state names | **Out of scope** — config vocabulary, not a Figma name |

Three consequences of this inventory are normative:

- **Reference sites need no schema change.** Because every reference is in formatted key space and resolves to a definition, adding `name` in two places covers every use of those names throughout the document. This is the whole reason Decision 1 selected the definition site.
- **Producers MUST recurse.** `Anatomy` appears at the top level, inside every `Composition`, and inside every `SlotContent`. A producer that evaluates only the top-level `anatomy` map silently leaves composed and slot-filled elements unprotected, and because the nested type is identical, nothing in the type system catches the omission. Implementation must walk all three.
- **The out-of-scope rows are out of scope because nothing was projected**, not because the loss is tolerated. They hold authored identifiers or verbatim names, so there is no source name to reconstruct. If a producer ever derives one of these keys from a Figma name, it moves into the covered set and needs its own decision.

This inventory is derived from the schema types and the render-direction write sites. It has not been confirmed against a full sweep of what `specs-from-figma` emits into each registry.

---

## Key application surfaces in `figma-from-specs`

Audited on `feat/figma-from-specs`. Every place the render direction either formats a key or writes a spec key back into Figma as a name, and whether `AnatomyElement.name` / `FigmaPropExtension.name` covers it.

| Surface | Site | Direction | Covered by this ADR |
|---------|------|-----------|---------------------|
| Anatomy layer names | `Elements/Elements.ts:231` — `childNode.name = name` | Spec key written to Figma **verbatim, unformatted** | **Yes** — anatomy `name` becomes the value to use here, replacing the raw key |
| Collapsed-root leaf name | `Elements/Elements.ts:122,131` — reads `originalName` | Extension read | **Yes** — the ADR-058 site; rename to `name` (see Migration) |
| Component property names | `Props/Props.ts:48,50,53` — `addComponentProperty(name, …)` | Spec prop key written to Figma **verbatim** | **Yes** — prop `name` becomes the value to use |
| Boolean-pairing property names | `Props/Props.ts:63` — `addComponentProperty(pair.booleanPropName, …)` | Derived from a prop key | **Yes**, transitively — resolves through the same prop `name` |
| Code-only property names | `Props/CodeOnlyProps.ts:76-77,188,206` — property, container, and layer names | Derived from prop keys and `$extensions.com.figma.source` | **Partly** — the property name resolves through prop `name`, but the layer/pattern names at `:188,206` come from the code-only source block and are not a key-format surface |
| Prop-configuration property matching | `PropConfigurations/PropConfigurations.ts:103` — `matchFormatted` | Formats the *Figma* name forward and compares | **Yes** — becomes a `name` lookup with the format comparison as fallback |
| **Variant option values** | `PropConfigurations/PropConfigurations.ts:72` — `formatKey(option, fmt) === specVal` | Formats Figma enum *values* forward and compares | **No — gap.** Enum option values pass through `format.keys` too, and neither `name` field records them. See below |
| Glyph content keys | `Elements/GlyphElement.ts:32` — `formatKey(rawName, glyphKeyFormat) === contentKey` | Formats a glyph library name forward and compares | **No — out of scope.** Matches against a live glyph manifest, not a spec key; the source name is external to the component |
| Subcomponent titles | `Subcomponents/Subcomponents.ts:28,42` — `formatKey(sub.title, keyFormat)` | Formats a title into key space to resolve a manifest entry | **Not needed.** `title` is stored unformatted and stays available to reverse from |
| Component / variant frame names | `Component.ts:83,108,114`, `Variants/Variants.ts:78` | Writes `title` back as the Figma name | **Not needed** — `title` is never in key space (see note below) |

### What this ADR deliberately leaves untouched

The contract covers **anatomy element keys and prop keys**. Three other naming surfaces are explicitly out of scope, for two different reasons.

**Variant option values — a real gap, not fixed here.**

`props.<key>.options` entries are formatted by `format.keys`, and the render direction matches them back by re-formatting the live Figma enum value (`PropConfigurations.ts:72`). `Cut & paste` as an *option value* is exactly as lossy as it is as a key, and `FigmaPropExtension.name` records only the property name — there is no per-option preservation surface. Adding one means a keyed structure under the prop extension, which is a separate decision about the prop extension's shape and is not made here.

**Component titles and subcomponent titles — already lossless, no change needed.**

`title` is not in key space, which is a fact about the read direction: `specs-from-figma` sets `title: this.node.name` verbatim (`Component/Component.ts:283`), so the Figma component name reaches the spec unformatted and no `format.keys` value touches it. Nothing needs preserving, because nothing was ever projected.

In the write direction, `figma-from-specs` formats a title only at the *consumption* site — `Subcomponents.ts:28,42` derives a key from `sub.title` to resolve a manifest entry — and the unformatted `title` remains alongside. Frame naming writes `title` back as-is.

So titles already do what `com.figma.name` does for keys — they record the original name — and they do it in the schema's own field rather than an extension. No `name` extension is added for titles, and none is needed.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | When `format.figmaKeys` is not `NONE`, must evaluate each anatomy element name and prop name against the safe key grammar, apply the authored-key retention test, and emit `name` on divergence or retention; existing `originalName` write site breaks under every value including `NONE` | Rename the emitted extension key unconditionally; add the grammar and retention evaluation gated on `format.figmaKeys`; align the word splitter with the stated letter↔digit rule; recompile |
| `specs-cli` | Emits and validates specs carrying the new optional field; the new config key is accepted in workspace config | Recompile against the new schema version; surface `format.figmaKeys` in config resolution and documentation |
| `specs-plugin-2` | Same emission path as the CLI in the plugin runtime; the render direction reconstructs Figma names by formatting into `format.figmaKeys`, preferring `name` where present | Recompile; use `name` in preference to the formatted key when matching Figma nodes |

---

## Semver Decision

**Version bump**: none — lands in the in-flight `0.30.0` (`MAJOR`-class change, released as a pre-1.0 minor)

**Justification**: Renaming `originalName` → `name` removes a published field name, which the constitution classes as `MAJOR`. The package is pre-1.0 and already releases breaking narrowing changes as minors — `0.29.0` narrowed `Styles.textAlignHorizontal` from `Style` to a string enum. `0.30.0` is unreleased and is the version this ADR lands in, so it absorbs the change and `package.json` is unchanged. All other changes are additive: `FigmaPropExtension.name` and `Config.format.figmaKeys` are optional, and the safe-key definitions are referenced only from descriptions. `ResolvedConfig.format.figmaKeys` is required, and adding a required field to a published type is `MAJOR`-class in its own right — a caller assembling a `ResolvedConfig` literal rather than spreading `DEFAULT_CONFIG` loses compilation. It is absorbed by the same pre-1.0 `0.30.0` as the rename, and `DEFAULT_CONFIG` supplies `NONE` so the spread path is unaffected.

---

## Consequences

- The schema states, for the first time, what an unformatted Figma-side name looks like — declared per workspace via `format.figmaKeys`.
- No existing catalog changes behavior. `figmaKeys` defaults to `NONE`, so the grammar check, the divergence extension, and reversal are opt-in; a catalog adopts them by naming its convention. Output is not byte-identical — the `originalName` → `name` rename applies regardless of `figmaKeys`.
- Solving the problem costs spec complexity, and the author chooses whether to pay it. Opting in adds a `$extensions` block to every name outside the safe grammar and every name already written in the destination format. On a catalog with inconsistent Figma naming, that is substantial noise in exchange for fidelity — which is why it is opt-in rather than the default.
- The default being `NONE` means most catalogs stay lossy until someone opts in. Adoption depends on the value being visible, which is what the analyze report below is for.
- Key formatting becomes a declared pair — `figmaKeys` in, `keys` out — so reversal is defined by config rather than inferred.
- The set of names that survive every `format.keys` value is defined by two mechanically checkable patterns rather than by the behavior of one producer.
- **When `figmaKeys` is declared**, specs produced with a lossy `format.keys` value carry enough information to reconstruct Figma names, making the spec → Figma direction lossless for anatomy and prop identity. Under the `NONE` default they do not, and reversal stays undefined.
- Well-formed catalogs stay quiet — no format-divergence `$extensions` appear unless a name falls outside the safe grammar, so the field doubles as a signal that a Figma name needs attention. Wrapper collapse emits `name` on its own trigger, so a grammar-conforming catalog is not necessarily extension-free.
- Two distinct Figma names can still format to the same key — `Cut & paste` and `Cut paste` both reach `cutPaste`, and a retained name can collide with a formatted one. This is pre-existing behavior and is not changed here: a keyed record holds one entry per key, so one name wins and the other's `name` is not recorded. The loss belongs to the author who named two things the same in key space, not to the system. The safe grammar is collision-free among safe names, and `analyze keys` is the place to surface the rest.
- Consumers that match Figma nodes by name MUST prefer `com.figma.name` over the formatted key when it is present; ignoring it reintroduces the divergence this ADR removes.
- Names outside the safe grammar remain fully supported — they are recorded, not rejected. Narrowing them is an authoring recommendation, not a validation gate.
- `&`, `+`, and `/` will always trigger the extension. Catalogs wanting extension-free output must avoid them in layer and property names.
- `format.figmaKeys` starts deliberately narrow at `SENTENCE | TITLE`; encountering a file with another convention is a schema change, not a config choice.
- The grammar makes naming quality **reportable**, which suggests a follow-on `specs analyze keys` report: run the safe key grammar across a catalog and surface every anatomy element, prop, and option whose Figma name falls outside it — grouped by cause (separator, casing, symbol, mixed letter-digit word, digit-initial, non-ASCII) and by the convention the name *would* be safe under. Two audiences:
  - **Design-system teams** get a list of layer and property names to fix in Figma, ranked by how many components each affects.
  - **Adopters of `figmaKeys`** get the evidence for which value to declare — a catalog that is 94% `SENTENCE`-safe and 3% `TITLE`-safe has an obvious answer, and the residue is the exact list of names that will emit `com.figma.name`.
  The report is also the honest way to run under `figmaKeys: NONE`: no extension is emitted, but the divergence is still measurable and can be shown.
- Deriving the retention and divergence signals is producer behavior (Constitution II). The schema declares the grammar; `analyze keys` is CLI work, out of scope for this ADR.
- Two fields cover every Figma-derived name in a spec, at every nesting depth, because reference sites resolve through definitions — see the Coverage inventory for the full enumeration and the recursion requirement it places on producers.
- The contract covers anatomy and prop *identity* only, and three surfaces stay as they are:
  - **Variant option values** pass through `format.keys` with no preservation field and remain lossy. Closing this needs a per-option surface on the prop extension — a separate decision.
  - **Component titles** are already the verbatim Figma node name and are never formatted.
  - **Subcomponent titles** are likewise verbatim; they are formatted only when read, and the unformatted title remains alongside.
  Titles therefore already record the original name in a first-class field, which is why no extension is added for them.
