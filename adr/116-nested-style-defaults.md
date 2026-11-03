# ADR: Nested style members declare their own defaults

**Branch**: `116-nested-style-defaults`
**Created**: 2026-11-03
**Status**: DRAFT
**Summary**: Optional members of the `Styles` composite types declare their own `default`, joining the 46 top-level properties that already do.
**Decides**: styles.Sides.top, styles.Sides.end, styles.Sides.bottom, styles.Sides.start, styles.cornerRadius.topStart, styles.cornerRadius.topEnd, styles.cornerRadius.bottomEnd, styles.cornerRadius.bottomStart, styles.itemSpacing.horizontal, styles.itemSpacing.vertical, styles.ColorObject.alpha, styles.ColorObject.hex, styles.backgroundImage.objectFit, styles.effects.shadows, styles.effects.layerBlur, styles.effects.backgroundBlur, styles.effects.shadows.inset, styles.typography.fontSize, styles.typography.fontFamily, styles.typography.fontStyle, styles.typography.lineHeight, styles.typography.letterSpacing, styles.typography.textCase, styles.typography.textDecoration, styles.typography.paragraphIndent, styles.typography.paragraphSpacing, styles.typography.leadingTrim, styles.typography.listSpacing, styles.typography.hangingPunctuation, styles.typography.hangingList
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-113)*

---

## Context

ADR-113 declared a `default` on every property of `Styles`. All 46 top-level keys now answer "what does an absent value mean?" from the schema rather than from a transform, and DSPEC-44 holds a test over them.

Its scope stopped at the top level. Eight of those 46 properties resolve to a composite object — `Sides`, `Corners`, `ItemSpacing`, `Effects`, `Shadow`, `Typography`, `ColorObject`, `ImageValue` — and **not one member of any of them carries a `default`**. The string `default` appears 46 times in `styles.schema.json`, all of them inside `#/definitions/Styles/properties`.

The consequence is visible on the generated reference pages. `/schema/styles/item-spacing/` states its default; `/schema/styles/item-spacing/horizontal/` states nothing. The generator renders a declared default inline on the value arm that carries it, so a member with none renders a value list with no default marked — indistinguishable from a member nobody has reasoned about.

A member's absence is routine, not exceptional. `Sides` exists precisely so that only the sides differing from the collapsed value are written, and `Typography`'s own description says "only properties set on the text node are present". A consumer reading `padding: { bottom: 8 }` must decide what the other three sides are, and today the contract does not tell it.

The gap is the same one ADR-113 closed, one level down: the authoritative answer lives in whichever transform the reader happens to consult.

---

## Decision Drivers

- **The contract must be readable without reading an implementation.** The driver ADR-113 was written against; a member is read the same way a property is.
- **A default must be defensible from the type's own meaning.** Not from what one transform does with the value. Where the type's meaning does not fix a value, the honest record is no default, not a plausible one.
- **A declared default must validate against the member's own schema** (DSPEC-44's second clause, Constitution §IV). A default that its own property rejects is a published falsehood nothing would catch.
- **A default is a literal** (DSPEC-45). Carried over unchanged.
- **Additive.** `default` is an annotation. No document's validity may change, and no type may change.
- **No existing rule is rewritten in silence.** Widening DSPEC-44's wording would retroactively restate what ADR-113 decided. Any change to it is stated here or not made.

---

## Options Considered

### Decision 1 — Which members declare a default

A `default` answers "the value this member carries when it is absent". A member listed in its object's `required` array cannot be absent, so the question it answers does not arise.

| Option | For | Against |
|---|---|---|
| **A. Optional members only — 30 of the 58 members across the `Styles` composite types** | The keyword answers a question that can actually be asked; the boundary is mechanical (`required`) and testable both ways | Two adjacent members of one object may differ in whether they carry the keyword, which reads as inconsistency until the rule is known |
| B. Every member, required ones included | Uniform — every member page shows a default | Meaningless on 28 members. `Shadow.offsetX` is required; there is no document in which it is absent, so a declared default describes nothing. It also defeats the one signal ADR-113 built: a missing `default` meaning "nobody has decided" |
| C. The containing composite declares a member default table | One site per type | Invents a keyword. `default` on the object would have to be a whole object literal, which claims the object's own absence resolves to that shape — a different and false statement |

**A.** The 28 required members are named in *Decision* below so the exclusion is a record, not an omission. The rule that bounds this ADR's scope is: **a required member declares no `default`.**

---

### Decision 2 — A member whose absence means *nothing applies*, where its schema admits no `null`

ADR-113 met this for 19 of 46 properties and answered it with `default: null`, because every one of those properties resolved to a `*StyleValue` union carrying a `null` arm. Four optional members have no such arm, and four more admit a literal that nothing fixes:

| Member | Schema | Why no value can be declared |
|---|---|---|
| `Effects.shadows` | `array`, `minItems: 1` | Neither `null` nor `[]` is an admitted value |
| `Effects.layerBlur`, `Effects.backgroundBlur` | `$ref: Blur` | `Blur` is an object with two required members |
| `ColorObject.hex` | `string`, `pattern: ^#[0-9A-Fa-f]{6}$` | No string expresses "no fallback" |
| `Typography.fontSize`, `.fontFamily`, `.fontStyle` | number / string / `MixedValue` / `TokenReference` | A literal is admitted; the *meaning* is the problem — see below |
| `Typography.lineHeight` | string / number / `MixedValue` / `TokenReference` | Automatic leading is spelled two ways in the contract — see below |

| Option | For | Against |
|---|---|---|
| **A. Declare no `default`; state the member and the reason in this ADR** | DSPEC-44's validity clause stays true with no exemption; the undeclared state keeps meaning "unresolved", which it genuinely is | The member page shows no default, and a reader must come here to learn why |
| B. Declare `default: null` anyway and exempt these members from the validation test | Every member page shows something | Publishes a default the member's own schema rejects, and the exemption dissolves the only gate ADR-113 built. The test would pass on a falsehood by configuration |
| C. Widen each unexpressible member's schema to admit `null` | `null` then validates, and all 30 declare | Changes what documents are valid in order to carry an annotation, for a value nothing writes. This is the reasoning ADR-113 used to refuse `allOf` wrappers around `$ref`, applied to validation rather than structure — and a `shadows: null` arm invites a producer to write one |

**A.** Eight members declare none, in three classes:

- **Unexpressible** — `Effects.shadows`, `Effects.layerBlur`, `Effects.backgroundBlur`, `ColorObject.hex`. The member means "nothing of this kind applies" and the schema has no literal for it.
- **Undetermined** — `Typography.fontSize`, `.fontFamily`, `.fontStyle`. A literal is admitted, but none is defensible from the type's own meaning. `16` is a browser convention, not a fact about `fontSize`; `"Regular"` is a Figma family-style naming convention many families do not use. Picking one would be the invention this ADR's second driver forbids.
- **Disputed** — `Typography.lineHeight`. Automatic leading is the correct default, and the contract spells it two ways: the member's own description says `'auto'`, and the documents carry `'AUTO'`. Declaring either would settle a vocabulary question by annotation, which is how the contract would acquire a second spelling rather than lose one. Resolving it is closed-value-set work of the kind ADR-115 did, not defaults work.

So 22 of the 30 optional members declare a default and 8 do not, each named with its reason.

---

### Decision 3 — Where the keyword attaches, given that two composites are shared

ADR-113's Decision 3 put the keyword on the property rather than on the shared `*StyleValue` definition, because `opacity` → `1` and `rotation` → `0` resolve to the same `NumberStyleValue`. The same question arises here in reverse: `Sides` is reached from two style keys, `padding` and `strokeWeight`, and `ColorObject` from five.

| Option | For | Against |
|---|---|---|
| **A. On the member, inside its composite definition** | `padding` and `strokeWeight` both declare `default: 0`, so `Sides.top` → `0` is true by both paths. `ColorObject.alpha` → `1` holds wherever a colour object is written. One site, no divergence possible | A future style key resolving to `Sides` with a non-zero default would make the member default wrong for that path |
| B. Duplicate the member defaults per style key, by splitting the shared definitions | Each path states its own | Splits `Sides` into two identical types and `ColorObject` into five, to express a difference that does not exist |

**A.** The reference pages already home a shared composite's members at one canonical page — `/schema/styles/sides/top/`, not under both `padding` and `strokeWeight` — so a per-path default would have nowhere to render. A's risk is turned into a test rather than left as a caution: a style key and a member it expands into must declare the same default where the two are of the same JSON type (see *Tests*).

---

## Decision

Every **optional** member of a `Styles` composite type declares a `default` where its own schema can express the value an absent member carries. Every **required** member declares none. A declared default is a literal (DSPEC-45) and validates against the member's own schema (DSPEC-44).

A member default is conditional on its containing object being present. `Typography.textCase` → `"ORIGINAL"` says what an inline `typography` object with no `textCase` means; it says nothing about a text element whose `typography` is absent, which `styles.typography` → `null` already answers.

### Schema changes (`schema/`)

22 members of `#/definitions` composite types gain a `default`:

| Type | Member | `default` | Defensible from |
|---|---|---|---|
| `Sides` | `top`, `end`, `bottom`, `start` | `0` | A side with no inset holds no space. Both keys reaching `Sides` declare `default: 0` |
| `Corners` | `topStart`, `topEnd`, `bottomEnd`, `bottomStart` | `0` | A corner with no radius is square; `cornerRadius` declares `default: 0` |
| `ItemSpacing` | `horizontal`, `vertical` | `0` | An axis with no gap holds none; `itemSpacing` declares `default: 0` |
| `ColorObject` | `alpha` | `1` | DTCG Color §4.1, already stated in the member's own description |
| `ImageValue` | `objectFit` | `"COVER"` | Already stated in `ObjectFitValue`'s description: "Absent means COVER" |
| `Shadow` | `inset` | `false` | Already stated in the member's own description: "absent or false for drop shadow (DTCG)" |
| `Typography` | `letterSpacing`, `paragraphIndent`, `paragraphSpacing`, `listSpacing` | `0` | No tracking, no indent, no added spacing |
| `Typography` | `textCase` | `"ORIGINAL"` | `ORIGINAL` is the member's own name for untransformed text, per its description |
| `Typography` | `textDecoration` | `"NONE"` | `NONE` is the member's own name for undecorated text, per its description |
| `Typography` | `leadingTrim` | `"NONE"` | The `const` branch naming "keeps the font's full leading", per Figma's own API |
| `Typography` | `hangingPunctuation`, `hangingList` | `false` | A typographic refinement is off until enabled |

**Example — new shape** (`schema/styles.schema.json`):

```yaml
# Before — #/definitions/ItemSpacing/properties
horizontal:
  $ref: "#/definitions/NumberStyleValue"
  description: "Horizontal gap between items"

# After
horizontal:
  $ref: "#/definitions/NumberStyleValue"
  description: "Horizontal gap between items"
  default: 0
```

As in ADR-113, `default` sits as a sibling of `$ref` where the member has one, which is how `description` is already carried. No member becomes an `allOf` wrapper.

### Members that declare no default, and why

| Member | Reason | Class |
|---|---|---|
| `Effects.shadows` | `array` with `minItems: 1`; neither `null` nor `[]` validates | Unexpressible |
| `Effects.layerBlur` | `$ref: Blur`, an object with required members; `null` does not validate | Unexpressible |
| `Effects.backgroundBlur` | As `layerBlur` | Unexpressible |
| `ColorObject.hex` | `string` with a 6-digit hex pattern; no string means "no fallback" | Unexpressible |
| `Typography.fontSize` | A literal validates, but no number follows from the type's meaning | Undetermined |
| `Typography.fontFamily` | As `fontSize`; no family name is a fact about the member | Undetermined |
| `Typography.fontStyle` | As `fontSize`; `"Regular"` is a Figma naming convention, not a contract | Undetermined |
| `Typography.lineHeight` | Automatic leading is the value; the contract spells it `'auto'` in the member's description and `'AUTO'` in documents | Disputed |

The four unexpressible members all mean "nothing of this kind is applied". Resolving them needs a `null` arm on each member's schema, which is a validity change and its own decision. `lineHeight` needs its two spellings reconciled first, which is a closed-value-set decision and also its own.

### Required members, excluded by Decision 1

28 members, declaring no `default` because they cannot be absent:

- `AspectRatioValue` — `x`, `y`
- `ColorObject` — `colorSpace`, `components`
- `ImageValue` — `$image`
- `Blur` — `visible`, `radius`
- `Shadow` — `visible`, `offsetX`, `offsetY`, `blur`, `spread`, `color`
- `StrokeDashPattern` — `dash`, `gap`
- `LinearGradient` — `type`, `angle`, `stops`
- `RadialGradient` — `type`, `center`, `stops`
- `AngularGradient` — `type`, `center`, `stops`
- `GradientStop` — `position`, `color`
- `GradientCenter` — `x`, `y`

### Type changes (`types/`)

None. A TypeScript type cannot express "the value when this member is absent"; `?:` already means optional. This is the same parity exception ADR-113 took and stated, for the same reason: the schema gains annotations and no named type is added or altered.

### Specification changes

§4.1a gains a sibling, **§4.1b — An absent composite member resolves to its declared default**, stating the rule, the required-member boundary, the conditional nature of a member default, and the two classes of member that declare none.

The rule catalogue gains two rules. **DSPEC-44 is not widened.** Its wording — "Every property of `Styles` declares a `default`" — is a complete and true statement about the top level, and this ADR's rule is not "every": seven optional members declare none. Rewriting DSPEC-44 to span both levels would make it false, and rewriting it to carry an exception would hide this ADR's scope inside ADR-113's rule.

| ID | Rule | Class |
|---|---|---|
| DSPEC-52 | An optional member of a `Styles` composite type declares a `default` where its own schema can express the value an absent member carries, and any declared `default` validates against that member's schema | package |
| DSPEC-53 | A required member of a `Styles` composite type declares no `default` | package |

DSPEC-45 (a default is a literal) and DSPEC-46 (a platform binding does not redeclare a default) apply unchanged and are cited, not restated.

### Tests

`tests/StyleDefaults.test.ts` gains a second pass, walking the eight composite types:

- The traversal reaches the 16 composite types it is meant to, asserted as a list, so a traversal that stopped short cannot pass every other assertion on an empty set.
- Every required member carries no `default` (DSPEC-53).
- Every optional member carries one, except the eight named above, which the test lists explicitly so adding a default to one is a deliberate edit rather than a silent drift.
- Every declared member default is a type the member admits (DSPEC-52), by the same structural check the top-level pass uses.
- Every declared member default is a literal (DSPEC-45).
- A style key and a composite member it expands into declare the same default, where the two are of the same JSON type. This is what holds Decision 3 together: `Sides` serves `padding` and `strokeWeight`, and a third key defaulting to anything but `0` would make `Sides.top` wrong by that path.

The explicit exclusion list is the mechanism that keeps the eight gaps honest: a member moved off the list must declare a default, and a member added to it must be argued for here.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes, by the stated exception. No type is added, removed or changed; the schema gains `default` annotations only, which TypeScript cannot carry for an optional member.
- **Parity check**: Each annotated member already exists in both artefacts — `Sides`/`Corners`/`ItemSpacing`/`ColorObject`/`Typography` in `types/Styles.ts`, `Shadow`/`Effects` in `types/Effects.ts`, `ImageValue` in `types/Image.ts` — and none of their declarations change.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|---|---|---|
| `specs-cli` | Recompile | No surface change. Validation and emitted documents are unaffected |
| `specs-from-figma` | None required | Its own per-member collapse behaviour is now describable against the schema rather than only against itself. Reconciling the two is not this ADR's work |
| `figma-from-specs` | None | Reads values from documents, not defaults |
| `react-from-specs` | None | Reads values from documents. Where it imputes nothing for an absent member, the schema now says what that member means — nothing compares the two |
| `webcomponents-from-specs` | None | As `react-from-specs` |
| `from-specs` (shared core) | None | Carries no default resolution |
| `specs-plugin-2` | Recompile | No surface change |
| Platform mapping specifications | Available to cite | A binding may now cite a member default; DSPEC-46 forbids it redeclaring one |
| Documentation site | Regenerated | The 22 member pages that gained a default now render it. The 8 render none, which this record explains |
| The hand-written `schema/styles.md` table | **Out of scope** | Its `Default` column states the Figma → spec transform's defaults and says so. Nine of its member rows now have a schema counterpart that agrees, and `fontSize` → `16` has one that deliberately does not. Reconciling that table with the schema is ADR-113's deferred documentation work, unchanged here |

---

## Semver Decision

**Target version**: `0.40.0` — the version `release/next` carries.

**Change class**: `MINOR` — additive annotations only. No type, no validation outcome and no document's validity changes, per the constitution's additive-change class.

---

## Consequences

- A consumer can interpret `padding: { bottom: 8 }`, an inline `ColorObject`, or a `typography` object's spacing and case members without consulting a transform, for 22 of the 30 members where it previously could not.
- The required/optional boundary becomes a stated rule rather than an unexamined omission. 28 members are now documented as deliberately defaultless.
- Eight members remain undeclared, and the undeclared state keeps its ADR-113 meaning: not decided. **Out of scope for this ADR**, and each needs a different decision first — a `null` arm on four members' schemas, a defensible literal for three, and one spelling of automatic leading instead of two.
- A style key reaching `Sides`, `Corners` or `ItemSpacing` must declare the same default as that composite's members, and a test now holds it. A key whose own default is of a different JSON type than the member's — `strokes` → `null` against `ColorObject.alpha` → `1` — is not compared, because the two answer different questions.
- Declaring a member default does not make any platform's behaviour on an absent member agree with it, and does not reveal a disagreement either. That remains what ADR-113 deferred, unchanged.
- 22 more annotations to keep true, which the test converts into a build failure rather than a maintenance habit.
