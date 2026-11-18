# ADR: Conditional visibility is a prop binding, not an expression tree

**Branch**: `126-conditional-shorthand`
**Created**: 2026-11-17
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — removes `Conditional`, introduced 0.13.0)*

---

## Context

`Conditional` is the member of the `Style` union that lets a style value be derived from a prop rather than stated outright. It is spelled as a three-level expression tree:

```yaml
styles:
  visible:
    if:
      condition:
        operation: isNull
        args:
          value:
            $binding: '#/props/header'
      then: false
      else: true
```

Nine lines and five nesting levels carry one fact: this element is visible when the `header` prop has a value. It is the deepest construct a spec author ever hand-writes, and the only one whose meaning is not readable from its top line.

Three properties of the current contract make it hard to author correctly.

- **`operation` is an open string.** `ConditionExpression.operation` is typed `string`, deliberately, so consumers could add operations without a schema change. The type's own documentation says built-in operations "include `isNull`, `isNotNull`, `equals`, `notEquals`" — four names, none declared anywhere as a value the contract admits. An author who writes `isNotNull` produces a document that validates and means nothing, because the contract never said which operations are real.
- **`compareTo` describes operations the contract does not define.** `ConditionArgs.compareTo` exists "for binary operations (`equals`, `notEquals`)". Those two appear only in prose and in an `examples` block. The schema admits an operand for predicates it never names.
- **The polarity sits four lines below the test.** `operation: isNull` with `then: false` means *visible when not null*. Reading the test alone gives the opposite answer, and every occurrence in every workspace spells it this way, so the double negative is the normal case rather than an edge.

Across every library spec tree in the testing workspaces, all 176 occurrences of `Conditional` are the same expression modulo the pointer — `operation: isNull`, `then: false`, `else: true` — and all 176 are on `visible`. No spec has ever used `compareTo`, `equals`, `notEquals`, `isNotNull`, or a non-boolean `then`/`else`.

### The contract already expresses this without the tree

`Styles.visible` is typed `boolean | TokenReference | PropBinding | Conditional`, so a plain binding is already an admitted value:

```yaml
styles:
  visible:
    $binding: '#/props/header'
```

That line is determinate without a condition attached, because the prop it points at declares its own type. `Props` carries `type` and `nullable`, so the pointer's target answers the question the expression tree was spelling out:

- The target is a `boolean` prop — the element is visible when that boolean is true. There is nothing else "bind visibility to a boolean" could mean.
- The target is a nullable prop of any other type — the element is visible when the prop has a value. A string cannot drive a boolean field directly, so presence is the only available reading.

Both cases are the same rule: visible when the bound prop carries a value. That is the rule all 176 conditionals state, and it is what every code platform expresses natively — React as `{header && …}`, SwiftUI as `if let header`, Jetpack Compose as `if (header != null)`.

So the expression tree is not carrying information the contract lacks. The polarity it spells out is derivable from the declared shape of the prop the condition tests, which means the construct is a second way to say something `PropBinding` already says — and the more expensive way to say it, with an open vocabulary attached.

---

## Decision Drivers

- **One spelling per meaning** (constitution III). `visible` admitting both a plain binding and a conditional that resolves to the same rule is two ways to write one fact. Every consumer must recognize both and every author must choose between them.
- **A contract must be mechanically verifiable** (constitution IV). An open `operation` string means a document can satisfy the schema and still name a predicate the contract does not define. Validation that cannot reject a meaningless condition is not validating the condition.
- **A declared concept must be a real concept** (constitution III). `compareTo` and the four named operations are API surface for comparison predicates the contract never defines and no spec expresses.
- **Derive from declared shape, never from a name or a label.** Reading the polarity from the target prop's `type` and `nullable` keys off the contract's own declarations. This is the contract reading its own data, not a heuristic over it.
- **Conventional JSON over invented syntax.** The contract's `$`-prefixed keys exist for a stated reason: `PropBinding` is `$binding` specifically to avoid colliding with JSON Schema's `$ref` keyword. A new `$`-prefixed key with no such collision to avoid extends the convention past its justification and adds a binding family readers have to learn.
- **Naming follows code platforms** (constitution VI, rule 1). React, SwiftUI, and Jetpack Compose all express conditional presence as a test on the value itself, not as a predicate object with an operation name. Three code platforms agree, so rule 1 applies.

---

## Options Considered — A. Whether the contract needs a conditional construct for visibility

### Option A1: No construct — a plain prop binding carries it *(Selected)*

`Conditional` is removed and nothing replaces it. `visible` accepts `boolean | TokenReference | PropBinding`, and a binding means the element is visible when the bound prop carries a value: a `boolean` target by its value, any other nullable target by its presence. The rule is stated on `visible` in the schema, where the property that admits the binding is declared.

```yaml
# Before — nine lines
styles:
  visible:
    if:
      condition:
        operation: isNull
        args:
          value:
            $binding: '#/props/header'
      then: false
      else: true

# After — one line
styles:
  visible:
    $binding: '#/props/header'
```

**Pros**:

- No new type, no new key, no new binding family. The schema gets smaller rather than differently shaped.
- `visible` has exactly one way to be derived from a prop, so there is nothing for an author to choose between and nothing for a consumer to recognize twice.
- The open `operation` vocabulary and `compareTo` leave the contract with the construct that declared them, so the authoring failure they caused cannot recur.
- The surviving form is the one an author reaches for first, and the one the code platforms already express.

**Cons / Trade-offs**:

- The inverse polarity — visible when the prop *is* null — becomes inexpressible. None of the 176 occurrences use it.
- The rule becomes a property of `visible` that a reader must find on `visible`, rather than something each spec restates inline. The schema must state it in the `visible` description, and the reference documentation must carry it.
- It leans on prop declarations being correct. A content prop that should be `nullable` and is not leaves the rule nothing to read — a spec defect, but one whose symptom now appears at the element that binds to it.

---

### Option A2: A single key naming the test and its polarity *(Rejected)*

Replace the tree with one key that states the test, e.g. `visible: { $whenNotNull: '#/props/header' }`, and a `$whenNull` counterpart.

**Rejected because** it adds a third `$`-prefixed binding family to express a rule a plain `$binding` already determines. The `$` convention in this contract exists to dodge a JSON Schema keyword collision, and a null-test key collides with nothing, so the prefix would be convention carried past its reason — invented syntax where conventional JSON suffices. It also keeps two ways to derive `visible` from a prop, since `$binding` remains valid and means the same thing in the common case.

---

### Option A3: Prop binding with a sibling operation key *(Rejected)*

Keep `$binding` as the identifying key and add a sibling naming the test: `{ $binding: '#/props/header', $operation: isNull }`.

**Rejected because** it breaks identification by key identity and keeps the polarity inverted. A bare `{ $binding }` is already a valid style value, so `$binding` would no longer tell a consumer which kind of value it holds — only the presence of a second key would. And `$operation: isNull` under `visible` still reads as "visible when null" while meaning the opposite in every existing spec.

---

### Option A4: Keep the tree, close the `operation` enum *(Rejected)*

Leave the shape and change `operation` from `string` to an enum of the operations the contract defines.

**Rejected because** it is the minimum fix for the validation hole and improves legibility not at all. Nine lines stay nine lines, the polarity stays four lines below the test, and the second spelling of a rule `PropBinding` already carries stays in the contract. It is recorded here because it is the smallest change that would close the authoring trap, and should be on the record as having been weighed.

---

### Option A5: Keep the tree, document it better *(Rejected)*

Close the operation list in prose, explain the polarity in the `visible` description, cross-reference from the styles reference.

**Rejected because** it asserts in prose that a contract is closed while leaving it open. A schema whose `operation` is `type: string` admits `isNotNull` no matter what a description says, so the document still validates and still means nothing. Documentation cannot enforce a vocabulary the schema declines to declare.

---

## Options Considered — B. What becomes of non-boolean conditional style values

`Conditional` is a member of the general `Style` union, not only of `visible`, so in principle it could derive a string or a number from a prop. No spec has ever done so.

### Option B1: Remove it; add a primitive when a spec needs one *(Selected)*

The three types and three schema definitions go. Deriving a non-boolean style value from a prop, and comparing a prop to an operand, become inexpressible until an ADR introduces a primitive with the shape a real spec requires.

**Pros**:

- Removes `compareTo` and the four undeclared operation names outright rather than leaving them deprecated and still valid.
- The expressive loss is theoretical. A comparison primitive designed against a spec that needs it will fit that need better than one designed in advance against none.

**Cons / Trade-offs**:

- MAJOR-class. Removing exported types breaks compilation for consumers that name them.
- A future comparison need costs an ADR cycle rather than being already available.

---

### Option B2: Keep the tree for non-boolean values only *(Rejected)*

Scope `Conditional` out of `visible` and retain it elsewhere in the `Style` union.

**Rejected because** the tree's defect is that its grammar is open, not where it appears. Scoping it to the properties nobody uses it on preserves the undefined vocabulary in the harder-to-notice place, and leaves the contract with a construct that is live, unused, and unvalidatable.

---

### Option B3: Deprecate and keep both forms *(Rejected)*

Mark the tree deprecated for removal in a later MAJOR, keep it valid meanwhile.

**Rejected because** it widens the public API permanently in exchange for a deferral. Every consumer recognizes both forms for the whole window, and the open `operation` string stays valid throughout. The migration is one line per occurrence and all occurrences are generator output, so the usual reason to stage a removal does not apply.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conditional.ts` | Deleted — removes interfaces `Conditional`, `ConditionExpression`, `ConditionArgs` | MAJOR |
| `index.ts` | Removed exports `Conditional`, `ConditionExpression`, `ConditionArgs` | MAJOR |
| `Styles.ts` | `visible`, `Style`, and `BooleanBindableStyleValue` drop the `Conditional` member | MAJOR |
| `Styles.ts` | `visible` description states the rule a binding carries | PATCH |

**Example — new shape** (`types/Styles.ts`):

```yaml
# Before
Styles:
  visible: boolean | TokenReference | PropBinding | Conditional

Style: string | boolean | number | null | TokenReference | PropBinding | Conditional

# After
Styles:
  visible: boolean | TokenReference | PropBinding

Style: string | boolean | number | null | TokenReference | PropBinding
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Removed definitions `Conditional`, `ConditionExpression`, `ConditionArgs` | MAJOR |
| `styles.schema.json` | `visible` drops the `Conditional` branch from its `oneOf` | MAJOR |
| `styles.schema.json` | `visible` description states the rule a binding carries | PATCH |

**Example — new shape** (`schema/styles.schema.json`):

```yaml
visible:
  description: >-
    Whether the element renders. A prop binding renders the element when the
    bound prop carries a value — a boolean prop by its value, a nullable prop
    of any other type by its presence.
  oneOf:
    - type: boolean
    - $ref: 'component.schema.json#/definitions/TokenReference'
    - $ref: 'component.schema.json#/definitions/PropBinding'
```

### Notes

The rule is stated once, in the `visible` description, because that is the property whose admitted values it governs. The constitution bounds a description to what the value controls and the condition that bounds it; here the two readings of a binding *are* what the value controls, which is why the second sentence earns its place rather than explaining a consequence.

`PropBinding` is unchanged. This ADR removes a union member and adds nothing.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: Three removed types correspond one-to-one with three removed schema definitions — `Conditional` ↔ `#/definitions/Conditional`, `ConditionExpression` ↔ `#/definitions/ConditionExpression`, `ConditionArgs` ↔ `#/definitions/ConditionArgs`. `Styles.visible`, `Style`, and `BooleanBindableStyleValue` each drop one union member, matching the branch removed from `visible`'s `oneOf` and the `Style` definition.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile | A conditional expression becomes a schema violation rather than a document that validates and resolves to nothing. |
| `specs-from-figma` | Emit the binding | The generator emits a plain binding for the visibility pairing it already detects, instead of constructing the expression. |
| `figma-from-specs` | Resolve the gate from the binding | Already resolves a content-prop pointer to its paired boolean component property for the conditional form; does the same from a binding. |
| `from-specs` | Drop the conditional reading | The polarity derivation from the bound prop's declared type stays; the expression-tree parse beside it goes. |
| `react-from-specs` | Recompile | Consumes the shared core's reading. |
| `webcomponents-from-specs` | Recompile | Consumes the shared core's reading. |
| `specs-plugin-2` | Recompile | Same shape change as the generator it embeds. |

Existing spec trees carry the expression at every occurrence. All of it is generator output and regenerates; a hand-authored occurrence is a one-line replacement.

### Confirmation that the contract is sufficient

The option above rests on a claim about the contract — that a binding on `visible` is determinate from the target prop's declared type. Consumer behavior does not drive the decision (constitution III), but it does show the claim is not speculative:

- The shared core already derives exactly this rule from a plain binding, keyed off the target prop's declared `type`: a `boolean` target yields "render when true", any other target yields "render when not null". React and Web Components both emit guards from that derivation, so the one-line form already produces a working guard on both platforms today.
- Figma render already binds `visible` directly when the pointer names a boolean prop. When the pointer names a content prop, Figma's `visible` field has no boolean to reference, so render resolves the content prop to its paired boolean gate — the lookup it performs for the conditional form, and the lookup it would perform from a binding under this ADR. This is the one consumer that needs more than a recompile, and the work is moving a lookup it already has.
- There is no iOS or Android transform to check. The platform claim for Swift and Kotlin is about idiom under constitution VI — `if let` and `!= null` — not about an implementation that exists.

---

## Semver Decision

**Target version**: `0.41.0` — the version of `packages/schema` on `release/next`.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: Constitution III and the versioning constraint both make removing an exported type and restructuring a schema definition breaking. Three exported types and three schema definitions are removed, and three type unions drop a member.

---

## Consequences

- Conditional visibility is one line whose meaning is readable from it, and it is the same line an author writes to bind any other value to a prop.
- The contract gains no new syntax. `$binding` remains the only way a style value points at a prop.
- A conditional expression fails validation instead of producing a document that validates and resolves to nothing — the failure that cost a component authoring session two rounds.
- `compareTo` and the operation names `isNotNull`, `equals`, and `notEquals` leave the contract. None was ever declared as an admitted value, and no spec used them.
- The inverse polarity, and comparison predicates, and non-boolean derived style values are no longer expressible. Each requires an ADR carrying the shape a real spec needs.
- The rule now lives on `visible` rather than in each spec, so the `visible` description and the styles reference become the place a reader learns it. The prop-consolidation guide, which currently holds the only accurate statement of which operation was recognized, is rewritten against the new shape.
