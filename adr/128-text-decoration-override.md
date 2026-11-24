# ADR: Overriding a Member of a Bound Typography Token

**Branch**: `128-text-decoration-override`
**Created**: 2026-11-23
**Status**: DRAFT
**Summary**: An `OverriddenTypographyReference` joins the token and inline forms of `typography`, carrying the members that diverge from the referenced style.
**Decides**: the shape a `typography` value takes when it references a type token and one of that token's members is locally replaced; what presence in the override block asserts; which members may appear; whether the mechanism reaches other composite token-bindable values; the vocabulary for both the key and the new named type
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**Related**: [ADR-119 — Overrides on Instance Elements](119-instance-overrides) (a different override axis — see Decision 5), [ADR-113 — Style defaults belong to the schema](113-style-defaults-in-the-schema), [ADR-063 — Image fill style references](063-image-fill-references)

---

## Context

A text element's type treatment is one property, `styles.typography`, and the contract admits it in exactly two forms:

```ts
// types/Styles.ts
typography: TokenReference | Typography;
```

```json
// schema/styles.schema.json — #/definitions/TypographyStyleValue
"oneOf": [
  { "$ref": "#/definitions/TokenReference" },
  { "$ref": "#/definitions/Typography" },
  { "type": "null" }
]
```

The union is exclusive and both object arms are closed (`additionalProperties: false`). A spec therefore says either *this text uses the `Type/Body/Default` token* or *this text has these thirteen inline members* — never both. `effects` carries the identical shape (`TokenReference | Effects`), so the form generalises beyond typography.

That exclusivity holds a hidden assumption: a referenced type token fully determines the text's treatment. In the authoring tools it does not.

### What the authoring tool reports

A text layer can carry a named text style **and** a locally replaced member at the same time, without the style binding breaking. Applying a strikethrough is the case that surfaced this: the layer keeps its text-style binding, and the resolved text decoration is the local one.

Both of the authoring surfaces the contract is captured from report this, and the REST shape is documented:

- The resolved member values and the style binding arrive together on the node. `TypeStyle` carries every resolved typography member — `textDecoration`, whose documented values are `NONE`, `UNDERLINE` and `STRIKETHROUGH`, among them — while the node's style map carries the text-style id.
- `TypeStyle` also carries **`isOverrideOverTextStyle`**, documented as "Whether overrides exist over a text style". It is one boolean for the whole node: it says some member was replaced, and does not name which.
- The style's own definition is a node in the library file, reachable by explicit id. The published-style listing carries `key`, `name`, `description`, `remote` and `style_type` and no member values, so the definition's members come from resolving that node, not from the style listing.

Two consequences follow, and they are the reason this is a contract decision rather than a capture bug:

- **A member-level answer requires the definition.** Whether a resolved `STRIKETHROUGH` is a local replacement or something the token itself carries cannot be read off the layer. The unattributed boolean narrows the question; only the definition's own members answer it.
- **The spec has nowhere to put the answer.** Even once a producer knows that one member diverges, `TypographyStyleValue` admits no value that says "this token, with this member replaced". The honest options available today are both lossy: emit the token and discard the divergence, or discard the token and emit all thirteen resolved members inline. The first under-describes the text; the second destroys the token binding that the authoring file still holds, so a render back to the file would detach a style that was never detached.

### How narrow the surface is

The authoring tool's type settings offer six controls alongside a bound text style, and only one of them is a member of the composite the token resolves to. The rest are already represented elsewhere in the contract, or not at all:

| Control | Where the contract carries it | A member of `Typography`? |
|---|---|---|
| Alignment | `Styles.textAlignHorizontal` / `textAlignVertical` | No |
| **Decoration** | `Typography.textDecoration` | **Yes** |
| List style | not captured | No |
| Truncate text | `Styles.textOverflow` | No |
| Max lines | `Styles.maxLines` | No |
| Position (subscript / superscript) | `fontVariantPosition` — present in the authoring tool's text-style payload, absent from `Typography` | No |

Four of the six raise no override question at all. They are their own `Styles` properties, so the spec never claimed the type token owned them, and a locally set value is simply that property's value. Two more are not captured in any form — a separate gap, recorded in Consequences and not addressed here.

So the surface this ADR opens is, on present evidence, a **single member**: `textDecoration`. That bounds what the override block will hold in practice and it shapes two of the decisions below — Decision 1 Option F, which is at its most defensible against a one-member surface, and Decision 3, which declines to encode the set anyway. It is evidence about one tool's behaviour at one moment, not a contract fact, which is precisely why it is recorded here rather than in the schema.

### Why this is not the override surface already in flight

ADR-119 adds `Element.overrides` for a different boundary. There, an override reaches **past an instanced component's public API into the elements it owns**, keyed by element name, and the thing being overridden is another element's styles. Here the boundary is a **token reference**, the key is a member of the composite the token resolves to, and the element is the one the spec already describes. The two can coexist on one element without interacting: an instance override says *which element*, this says *which member of this element's type token*. Decision 5 takes the vocabulary question that follows from both using the word "override"; Decision 1 Option E evaluates reusing ADR-119's surface and records why it does not fit.

---

## Decision Drivers

- **A token binding is a fact worth keeping.** The authoring file holds the binding whether or not a member was replaced, so a contract that forces a producer to choose between the token and the divergence loses information that was present at capture.
- **Round-trip fidelity in both directions.** The spec → file direction must be able to re-apply the token *and* set the replaced member. A shape that carries only resolved members would detach a bound style on write; a shape that carries only the token would silently drop the replacement.
- **The contract describes shape, not one tool's permissions.** Which members a given authoring tool allows to be replaced without breaking a style binding is that tool's behaviour and may change. The contract must admit what the member's own type admits and leave the permitted set to the producer (*contract, not catalog*).
- **Closed unions must stay unambiguous.** `TypographyStyleValue` is a `oneOf`. A value matching two arms fails validation, so any new form must match exactly one.
- **`TokenReference` is universal.** It is the token form for colours, dimensions, strings, numbers, booleans, shadows, gradients, typography, effects and images alike. A member added there is added to all of them, so a concept meaningful only for composites does not belong on it.
- **Absence must mean something checkable.** `Styles` already means post-processed values — ADR-113 settled that an absent property is a statement, not a gap. A new block has to declare what its absence asserts.
- **One concept, one spelling, across two override axes.** ADR-119 is introducing `overrides` for instance internals in the same release line. Two unrelated meanings under one word, or two words for one family, both cost a reader.
- **Minimal, stable API** (Constitution III). A new exported type must name a genuine shared concept, and no consumer's internals may drive the shape.
- **Additive and optional.** No existing document may become invalid and no existing field may change meaning — MINOR class (Constitution: Versioning).

---

## Options Considered

Five independent decisions: the **shape** the value takes, the **semantics** of membership in the override block, which **members** may appear, the mechanism's **reach** across other composites, and the **vocabulary** for the key and the new type. The Decision section records only what these resolve.

### Decision 1 — Shape

#### Option A: A third arm — the token reference with an `$overrides` payload *(Selected)*

`TypographyStyleValue` gains a third object arm: a named type carrying `$token` and `$type` exactly as `TokenReference` does, plus `$overrides` holding the members that diverge, typed as `Typography`.

```yaml
# styles.typography — the token alone (unchanged, and still the common case)
typography:
  $token: 'Type/Body/Default'
  $type: typography

# styles.typography — the token, with one member replaced locally
typography:
  $token: 'Type/Body/Default'
  $type: typography
  $overrides:
    textDecoration: STRIKETHROUGH
```

**Pros**:
- It keeps both facts, which is the whole point. The token survives for the consumer that resolves tokens, and the divergence survives for the one that renders text.
- It matches exactly one arm of the `oneOf`, by construction. Both existing arms are closed, so a value carrying `$token` is rejected by the `Typography` arm and a value carrying `$overrides` is rejected by the `TokenReference` arm. The union stays unambiguous with no restructuring.
- `TokenReference` is untouched, so nothing is added to the token form used by colours and dimensions, where a member payload would be meaningless.
- Both round trips are expressible. A writer applies the token, then sets the members in `$overrides`; a reader that cannot resolve tokens still has the replaced member and can fall back for the rest.
- `$overrides` is typed as the existing `Typography` composite, so a member valid inline is valid as an override and there is no second member vocabulary to keep in parity.
- Additive: an optional third arm on one value definition. No existing document's validity changes.

**Cons / Trade-offs**:
- Three object forms for one property is more surface than two, and a consumer that switches on "is this a token or a composite?" has a third case to add — a compile error in TypeScript, but a silent fall-through in a hand-written validator.
- The nested `$overrides` object is one level deeper than the flat inline composite, so the two forms of the same member are not reachable by the same path.
- An override block whose members happen to equal the token's own values is expressible and meaningless. Producers must not emit one; nothing in the schema prevents a hand-authored spec from carrying one.

---

#### Option B: `$extensions['com.figma']` on the token value *(Rejected)*

Carry the replaced members inside the existing extension slot, beside the `id`, `name` and `rawValue` already recorded there.

```yaml
typography:
  $token: 'Type/Body/Default'
  $type: typography
  $extensions:
    com.figma:
      id: '13349:578'
      overriddenMembers:
        textDecoration: STRIKETHROUGH
```

**Rejected because**: the member is not Figma provenance. `$extensions['com.figma']` is documented as extraction provenance that platform consumers are not required to read — and a struck-through line of text is exactly what every platform consumer must read. Putting it there would make a rendering-critical fact optional by declaration, and would oblige the code emitters to read a Figma extension to emit correct CSS, which the emitters are barred from doing. It also mis-states the fact's origin: the divergence is a property of the design, not of the tool the design was captured from, and the same situation would arise from any authoring surface with named styles.

---

#### Option C: The replaced members flat beside `$token` *(Rejected)*

One object carrying `$token`, `$type` and the diverging members as siblings.

```yaml
typography:
  $token: 'Type/Body/Default'
  $type: typography
  textDecoration: STRIKETHROUGH
```

**Rejected because**: it puts two namespaces in one object with no boundary between them. Every `Typography` member becomes a potential sibling of the DTCG-reserved keys, so the contract can no longer add a `$`-prefixed key or a typography member without checking it against the other set. It reads as a DTCG alias object with undeclared extra keys, which is precisely what DTCG's `$extensions` exists to avoid. The flatness also loses the one thing the reader needs: with `$overrides` the members present are *by definition* the divergent ones, while flat siblings leave a reader unable to tell a replacement from a redundant restatement without resolving the token.

---

#### Option D: A sibling property on `Styles` *(Rejected)*

Leave `typography` carrying the token and add a second property beside it — `typographyOverrides` — holding the divergent members.

```yaml
styles:
  typography:
    $token: 'Type/Body/Default'
    $type: typography
  typographyOverrides:
    textDecoration: STRIKETHROUGH
```

**Rejected because**: it is a property that is meaningless alone and the schema cannot say so. Nothing stops `typographyOverrides` appearing with an inline `typography` composite, or with no `typography` at all, and JSON Schema cannot express "only valid when its neighbour is a token reference" without a conditional block over the whole `Styles` object. It also multiplies by composite and by context: `effects` would want its own sibling, and `TextContentStyles` — which deliberately lists `typography` once, as the composite — would have to grow a parallel property too. The relationship belongs inside the value it qualifies, where the value's own type can enforce it.

---

#### Option E: Reuse ADR-119's `Element.overrides` *(Rejected)*

Express the divergence as an override entry on the element, through the surface ADR-119 introduces.

**Rejected because**: ADR-119's `overrides` is keyed by **element name** and patches the elements an *instanced component* owns. The thing diverging here is a member of a composite token on an element the spec already describes directly — there is no instance boundary being crossed and no second element to name. Routing it through that surface would require an element to hold an override entry addressed to itself, which inverts the property's meaning, and would make a plain text element's own type treatment depend on a property documented as reaching inside instances. The two surfaces answer different questions and should stay separable, not least so an element can carry both.

---

#### Option F: A dedicated property per overridable member *(Rejected)*

Add `textDecorationOverride` (and, in time, one sibling per member that can diverge) to `Styles`.

**Rejected because**: the asymmetry of being wrong decides it, not the size of the surface. This is the option a one-member surface argues for, and Context grants that the surface does look like one member — so the rejection has to answer that case rather than the general one.

It fails on cost of error. If the surface is one member and the contract is general, we carry a `$overrides` object that usually holds one key — an aesthetic cost, paid in an existing type, reversible by never using the others. If the surface widens by one member and the contract named `textDecorationOverride`, the fix is a second property and a precedence rule between them, or a breaking change. One mistake is free to unmake and the other is not, and nothing in the evidence rules out the widening: the set is the authoring tool's behaviour, observed once, not a contract fact (Decision 3).

Two further costs are independent of the surface's size. It states the fact in a second vocabulary — `textDecoration` already exists inside `Typography` with a declared type and value set — so every consumer carries two spellings of one property and a rule about which wins. And it puts the override at the wrong altitude: a member of the type token's value becomes a sibling of `typography` itself, where nothing connects the two and the schema cannot say that one qualifies the other.

---

#### Option G: Drop the token and emit the resolved composite *(Rejected)*

The zero-change option: when any member diverges, abandon the token reference and emit all thirteen resolved members inline. Valid against today's schema.

**Rejected because**: it discards the binding the authoring file still holds, which inverts the observed fact — the style did not break, and the spec would claim it did. The round trip makes the cost concrete: writing that spec back detaches a style that was attached, and a subsequent capture then reports inline typography with no token, so the loss compounds rather than staying stable. It also degrades the token-consuming platforms to raw values for a text run whose treatment is, in all but one member, exactly the token's.

---

### Decision 2 — What presence in the override block asserts

#### Option A: Divergence from the referenced style's own definition *(Selected)*

A member appears in `$overrides` if and only if its resolved value differs from the value the referenced style's definition declares for it. Absence asserts agreement with the token.

**Pros**:
- It is the only reading under which the block is checkable. A consumer that resolves the token can verify every entry, and a reader can take an entry's presence as the statement that the rendered text differs from its token — which is the question an author asks.
- It keeps `Styles` consistent with itself. ADR-113 settled that a style map is a statement about what matters rather than a transcript of the file, and a block that listed members agreeing with their token would be the one map in the contract carrying values known to change nothing.
- It makes the common case empty. Text that uses its token unmodified carries no `$overrides` at all, so the new arm appears only where it says something.

**Cons / Trade-offs**:
- It obliges the producer to resolve the style's definition, which is a strictly larger capability than reading the node. Where a definition is not resolvable — a style owned by a library the producer cannot read is the case to expect — divergence cannot be computed, and the producer emits the token alone, exactly as today. So absence carries a blind spot: "no divergence" and "divergence not determinable" look alike in the document. *(Whether a remote style's definition is reachable in practice is a producer-side question this ADR does not answer; it is noted because it bounds what absence proves.)*
- Determinism holds per run but not across producers with different access to the library.

---

#### Option B: Locally set, as the authoring tool reports it *(Rejected)*

A member appears if the authoring tool reports it as locally set on the node — the unattributed override signal, taken at face value and combined with each member's non-default resolved value.

**Rejected because**: the signal does not support the claim. It is one boolean for the whole node and names no member, so "locally set" would have to be inferred from a member's value being non-default — which is a different proposition and wrong in both directions. A token that itself carries a strikethrough, on a node where something else entirely was replaced, would be reported as overriding its own value; and a member replaced with a value equal to the default would not be reported at all. The result is a block whose entries a consumer cannot verify and cannot trust, for the sake of avoiding one fetch. The boolean's legitimate use is as a cheap gate — when it is false there is nothing to resolve — and that is a producer optimisation, not a contract semantics.

---

### Decision 3 — Which members may appear

#### Option A: Any member the composite declares *(Selected)*

`$overrides` is typed as `Typography`. Every member is admissible, with the type and value set it already has.

**Pros**:
- The permitted set is a property of the authoring tool, not of the contract. Which members a tool lets a designer replace without breaking a style binding is behaviour that can change under us, and a contract that enumerated today's set would be wrong the first time it widens — and would be a catalogue of one tool's permissions in a tool-neutral schema.
- Narrowness sharpens that argument rather than softening it. A set of one is the most obviously tool-specific set there could be, and generality is free here: `$overrides` reuses `Typography`, so admitting thirteen members adds no surface, no new definition and no second vocabulary.
- No second member vocabulary. A value valid inline is valid as an override, which keeps the two forms of `Typography` in parity for free and gives the emitters one mapping to maintain.
- The producer is the right place for the narrowing. It emits what it finds diverging; a member that cannot diverge simply never appears.

**Cons / Trade-offs**:
- In practice the block holds one key. On present evidence `textDecoration` is the only member that can reach it, so the twelve others buy insurance against a widening rather than expressiveness anyone can use today.
- The type admits documents a given tool could not have produced, so the schema will not catch a hand-authored override of a member that tool treats as style-owned.
- No declared answer to "may I override this?" at authoring time. ADR-119's `overridable` annotation answers a related question for a different axis, and whether one annotation can serve both is not settled here.

---

#### Option B: An enumerated permitted set *(Rejected)*

Narrow `$overrides` to a named subset of `Typography` — the members the authoring tool is known to allow.

**Rejected because**: the set is unknown and tool-specific. Strikethrough is the one member confirmed to behave this way; proposing the rest would be inventing a catalogue, and the ADR corpus has no source for it. A narrowed type would also duplicate part of `Typography`'s property list into a second definition that has to be kept in step with the first — the drift Constitution I exists to prevent — to gain validation of the half of the check that matters least.

---

### Decision 4 — Reach across other composite values

#### Option A: Typography only, one named arm per composite as each is adopted *(Selected)*

This ADR adds the arm to `TypographyStyleValue` and nothing else. `EffectsStyleValue` has the identical `TokenReference | Effects` shape and would take the same treatment, by its own ADR, if the same situation is confirmed for effect styles.

**Pros**:
- It decides what there is evidence for. The behaviour is confirmed for text styles; whether a bound effect style admits a member replacement the same way is not something this ADR has established, and a mechanism extended on the assumption would be a guess embedded in the contract.
- Each adoption stays checkable. One named definition per composite, each with its `$overrides` typed as that composite, keeps the member vocabulary exact — an effects override typed as `Typography` would be nonsense.
- The pattern is set here, so a later adoption is a mechanical repeat rather than a fresh shape decision.

**Cons / Trade-offs**:
- One new named definition and type per composite that adopts it, where a single generic form would add one. Two adoptions is the point at which that starts to look like duplication.
- Until effects adopts it, two values with the same union shape behave differently, which a reader has to learn.

---

#### Option B: A generic `$overrides` on `TokenReference` itself *(Rejected)*

Add the member to `TokenReference`, so any token reference in the contract can carry overrides.

**Rejected because**: `TokenReference` is the token form for every style value — colours, dimensions, strings, numbers, booleans, shadows, gradients, images included. Most of those resolve to a scalar with no members to override, so the key would be meaningless on the large majority of its uses and could not be typed: the payload would have to be a loose object, abandoning the member-level typing that makes Option A checkable. It would also widen the one definition every token-bound value in the contract depends on, to serve a case confined to composites.

---

#### Option C: Typography and effects together now *(Rejected)*

Add the arm to both composite values in this ADR, on the symmetry of their shapes.

**Rejected because**: the shapes are symmetric but the evidence is not. Nothing here establishes that a bound effect style reports a member replacement while staying bound, so half the change would rest on an inference from the other half. If the behaviour is confirmed, the adoption is small and its own ADR can carry the evidence.

---

### Decision 5 — Vocabulary

#### Option A: `$overrides` for the key, `OverriddenTypographyReference` for the type *(Selected)*

The key is `$overrides`, sigil-prefixed like the `$token` and `$type` it sits beside. The new named type is `OverriddenTypographyReference`, mirroring `TokenReference`'s construction.

**Pros**:
- The sigil is the namespace boundary Option C of Decision 1 lacked. `$`-prefixed keys are established across this contract for structural keys — `$token`, `$type`, `$ref`, `$nested`, `$text`, `$glyph`, `$slotContent`, `$custom`, `$extensions` — so a reader already reads `$x` as "the contract's own key, not a value's", and no `Typography` member can ever collide with it.
- "Override" is the right word for both axes, and the position disambiguates them. ADR-119's `overrides` sits on an `Element` and takes element names; this `$overrides` sits inside a style value and takes that value's members. One family — a local value replacing a referenced one — distinguished by where it appears rather than by inventing a second word for the same idea.
- The type name says what it is in full words, per Constitution III and the no-abbreviations rule, and gives the later composites an obvious form (`OverriddenEffectsReference`).

**Cons / Trade-offs**:
- Two properties named for overrides, in one release line, that a reader must not conflate. The docs have to state the distinction explicitly rather than relying on the names.
- `$overrides` is plural and will usually hold one member.

---

#### Option B: A neutral word — `$delta`, `$patch` or `$local` *(Rejected)*

Avoid the collision by naming the key for its mechanism rather than its meaning.

**Rejected because**: it names the implementation, not the fact. A reader asking "what is different about this text?" is asking about an override; `$delta` answers in the vocabulary of diffing and `$patch` in the vocabulary of applying, neither of which is what the spec is describing. It would also split one concept across two words for no gain — the two override axes are genuinely the same kind of thing, and the collision is a documentation cost, not a semantic one.

---

#### Option C: Name it for the member set — `$overriddenMembers` *(Rejected)*

Spell out that the payload is members of the composite.

**Rejected because**: the type already says it — the payload is typed `Typography`, so a reader and a compiler both know what the keys are. The longer name restates the structure at every use site, and the generated reference page derives the payload type into its own section regardless, which is the same test the Constitution applies to descriptions.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Added interface `OverriddenTypographyReference` — `$token`, `$type`, optional `$extensions`, required `$overrides: Typography` | MINOR |
| `Styles.ts` | Widened `Styles.typography` to `TokenReference \| OverriddenTypographyReference \| Typography` | MINOR |
| `Styles.ts` | Widened `TextContentStyles.typography` to the same union | MINOR |
| `index.ts` | Export `OverriddenTypographyReference` | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  typography: TokenReference | Typography

# After
Styles:
  typography: TokenReference | OverriddenTypographyReference | Typography

OverriddenTypographyReference:          # new — all members as in TokenReference, plus:
  $token: string
  $type: 'typography'
  $extensions?: { ... }                 # as TokenReference
  $overrides: Typography                # required — the members that diverge from the token
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added definition `OverriddenTypographyReference`, `additionalProperties: false`, `required: ['$token', '$type', '$overrides']` | MINOR |
| `styles.schema.json` | Added it as a third `oneOf` arm of `TypographyStyleValue` | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# #/definitions/OverriddenTypographyReference
type: object
description: A type token whose referenced style declares a different value for one or more of the members in $overrides.
required: ['$token', '$type', '$overrides']
additionalProperties: false
properties:
  $token: { type: string }
  $type: { const: typography }
  $extensions: { $ref: '#/definitions/TokenReference/properties/$extensions' }
  $overrides:
    $ref: '#/definitions/Typography'
    description: The members whose resolved value differs from the referenced style's own.
examples:
  - $token: 'Type/Body/Default'
    $type: typography
    $overrides: { textDecoration: STRIKETHROUGH }

# #/definitions/TypographyStyleValue — third arm added
oneOf:
  - { $ref: '#/definitions/TokenReference' }
  - { $ref: '#/definitions/OverriddenTypographyReference' }    # NEW
  - { $ref: '#/definitions/Typography' }
  - { type: 'null' }
```

### Notes

- **`$overrides` is required on the new arm, not optional.** An instance of this type with no overrides is a `TokenReference`, and making the member optional would let one value match two `oneOf` arms — which fails validation rather than degrading gracefully. Requiring it is what keeps the union unambiguous.
- **`$type` is narrowed to `typography`** on this arm, where `TokenReference.$type` admits ten values. The payload is typed `Typography`, so no other token type is coherent here.
- **An empty `$overrides` object is admissible and meaningless.** `Typography` has no required members, so `{}` validates. Producers emit the member set they found diverging and therefore never emit an empty one; the schema does not forbid it, consistent with how the contract treats other producer-side relevance rules (ADR-113, and ADR-119 Decision 6).
- **`TokenReference` is unchanged.** The `$extensions` shape is referenced rather than redeclared so the two cannot drift.
- Nested member values keep their existing types, token references included — a member may itself be variable-bound, exactly as it may inline.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes. One new interface in `types/Styles.ts`, one new definition in `schema/styles.schema.json`, and the same third arm added to the union in both.
- **Parity check**: `OverriddenTypographyReference` ↔ `#/definitions/OverriddenTypographyReference`; `Styles.typography` and `TextContentStyles.typography` ↔ `#/definitions/TypographyStyleValue`'s `oneOf`. The new definition is named and therefore carries a named type, per Constitution I's both-ways rule.
- **`oneOf` exclusivity holds by construction.** `TokenReference` and `Typography` both set `additionalProperties: false`, so a value carrying `$overrides` is rejected by the first and a value carrying `$token` by the third. Every admissible value matches exactly one arm. This is the property that makes the change additive rather than a restructuring, and any later edit loosening `additionalProperties` on either existing arm would break it.
- No existing document's validity changes; no existing field changes type or meaning.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-schema` | Types, schema, CHANGELOG | New arm; `styles.md` properties table and the generated style pages pick up the third form |
| `specs-from-figma` | Update value mapping | Produce the new form where a bound text style and a divergent member coexist; requires resolving the referenced style's own members (Decision 2) |
| `figma-from-specs` | Update value mapping | Apply the token, then set the members in `$overrides` on the node — the direction that today would detach a bound style |
| `react-from-specs` | Update value mapping | Emit the token's treatment plus declarations for the divergent members |
| `webcomponents-from-specs` | Update value mapping | As React — the same reading, mirrored |
| `from-specs` | Update value mapping | Shared spec reading: the third form is recognised once, for both emitters |
| `specs-cli` | Update value mapping, recompile | The CSS transform emits the divergent declarations; `mappings/bindings/css.json` and `figma.json` state a disposition for the new form per DSPEC-41 |
| `specs-plugin-2` | Recompile | Bundles the render direction |

A consumer that switches exhaustively on the typography union gets a compile error and adopts deliberately. A consumer that tests for `$token` and otherwise assumes an inline composite reads the new form as a token reference and silently drops the divergence — the failure mode to call out in the CHANGELOG.

---

## Semver Decision

**Target version**: `0.41.0` — the version of `packages/schema` on the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Every change is additive — one new exported type, one new schema definition, and a widened union that admits a form no existing document uses. No exported type or field is removed, renamed, or retyped, and no existing document's validity changes. Additive types and new optional forms are MINOR per the constitution's Versioning rule.

---

## Consequences

- A spec can state that text uses a type token **and** that a member of it is locally replaced. Today it must discard one of the two facts.
- The spec → file direction stops detaching bound text styles for a locally replaced member, and the file → spec → file round trip becomes stable for this case rather than compounding the loss on each pass.
- Producing the new form requires resolving a referenced style's own member values, which is a larger capability than reading the node. Where a definition is unreachable, output is unchanged from today, and an absent `$overrides` therefore does not prove the absence of divergence.
- `TypographyStyleValue` has three object forms. A consumer narrowing on the union must handle the third; one that tests only for `$token` degrades silently.
- The pattern is set for `EffectsStyleValue`, which has the identical union shape, without this ADR extending to it. A later ADR adopting it adds one definition and one arm.
- Two properties in the contract are named for overrides — `Element.overrides` (ADR-119, instance internals, keyed by element) and `$overrides` (this ADR, token members, inside a style value). The docs must state the distinction where both are reachable.
- Which members an authoring tool permits to diverge is not declared in the contract. An author has no schema-level answer to "may I override this?", and a hand-authored override of a member the tool treats as style-owned validates.
- `textDecoration` is expected to be the only member that reaches the block. The arm is general, so a widening costs nothing; a widening is also the only thing that makes the generality visible.
- Two text properties the authoring tool offers beside a bound style remain uncaptured, and this ADR does not change that: **list style** (ordered, unordered, none) and **`fontVariantPosition`** (subscript, superscript). Neither is a `Typography` member today, so neither is an override question — each is a capture gap, and adding either is its own additive change to the composite.
