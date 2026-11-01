# ADR: Describe Enum Options Where They Are Declared

**Branch**: `platform-bindings`
**Created**: 2026-11-01
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The schema declares 31 closed value sets. Every one is a bare `enum` array, and **none carries any description of what an individual option means.**

```json
"PositionStyleValue": {
  "oneOf": [
    { "enum": ["AUTO", "ABSOLUTE"] },
    { "type": "null" }
  ]
}
```

A generated reference page can list `AUTO` and `ABSOLUTE` — it reads them out of the array — but cannot say what either does. There is no mechanism for per-option text.

The consequence lands in the property `description`, the only available home:

> `position` — "Layout positioning mode — AUTO (participates in parent auto-layout) or ABSOLUTE. Present as ABSOLUTE on every element that emits positioning offsets, including children of non-auto-layout containers; AUTO appears only inside auto-layout containers (ADR-070). Structural property — not token-bindable."

One sentence carrying the property's purpose, two option meanings, an emission rule, and a token-bindability fact. The constitution's description rule now forbids all but the first, and the reference page derives the last two into their own sections. The option meanings have nowhere else to go.

The same pressure exists wherever a closed set does: `settings.spec.color` admits nine values, `settings.spec.tokens` eight, `ColorObject.colorSpace` fourteen. A reader choosing between `TOKEN_FIGMA_EXTENSIONS` and `FIGMA_NAME` gets two names and nothing else.

### This is a known gap in JSON Schema, with a settled answer

JSON Schema has no per-enum-member annotation keyword, in any draft. The specification project tracked the request as [json-schema-spec#57](https://github.com/json-schema-org/json-schema-spec/issues/57) and **closed it in 2016 by endorsing an existing pattern rather than adding a keyword**: `oneOf` branches of `const` plus `title`.

```json
{ "oneOf": [
  { "const": "foo", "title": "Pick Foo" },
  { "const": "bar", "title": "Pick Bar" }
] }
```

Three alternatives were raised in that discussion and rejected on the record:

| Proposal | Why it was rejected |
|---|---|
| A parallel `enumNames` array | Ordering mismatches, and unmaintainable as the set grows |
| A tuple replacing `enum` | Combines validation with annotation, which the spec keeps separate |
| An object keyed by value | JSON guarantees no property ordering |

The issue's closing argument was that labelling for display belongs to a separate UI-schema layer, not to the validation specification. That argument is what Option D below takes seriously.

The `oneOf`/`const` pattern is what the ecosystem settled on: JSON Forms renders it identically to an `enum` and documents it as the way to label options, and the same pattern appears in JSON Editor and in .NET schema tooling for documented numeric enumerations.

## Decision Drivers

1. **A reader choosing between options needs to know what each does.** Listing names is the part already done.
2. **One home per fact.** The constitution's description rule exists because reference pages derive type, default, bindings and rules into their own sections; option meanings must land somewhere that is not the property description.
3. **Validation behaviour must not change by accident.** The schema is the authoritative validation contract.
4. **Standard JSON Schema.** A vendor keyword works only in tooling that knows it, and these files are published for others to consume.
5. **Machine-readable.** Whatever carries the meaning must be readable by the generator, or the pages cannot render it and no check can verify the set is covered.

## Options Considered

### A. `oneOf` branches of `const` plus `description`

```json
"StrokeAlign": {
  "oneOf": [
    { "const": "INSIDE",  "description": "Stroke is drawn within the element's bounds" },
    { "const": "OUTSIDE", "description": "Stroke is drawn beyond the element's bounds" },
    { "const": "CENTER",  "description": "Stroke straddles the boundary" }
  ]
}
```

The pattern the specification project endorsed. Standard in every draft, no vendor keyword, and each branch is a full schema object — so it also accepts `title` for a short label, `examples`, `deprecated`, or a `$comment`, none of which a bare `enum` member can carry.

Costs: three lines per option where there was one value; and `oneOf` reads as a weaker "closed set" signal to a human skimming than `enum` does, though not to a validator.

### B. A vendor keyword beside the `enum`

```json
{ "enum": ["INSIDE", "OUTSIDE", "CENTER"],
  "x-enumDescriptions": { "INSIDE": "…", "OUTSIDE": "…", "CENTER": "…" } }
```

Real prior art — variants of this are widespread in OpenAPI tooling. Keeps `enum` as the signal and keeps files compact.

But it is ignored by any consumer that does not know the keyword, nothing stops a key that matches no member, and it separates the text from the thing it describes. That separation is the same failure the spec project cited against `enumNames`, only keyed instead of ordered.

### C. A parallel `enumNames` array

Rejected on the record by the specification project for ordering fragility. Listed here so the ADR does not look like it skipped the obvious one.

### D. Keep `enum`; carry option meanings in a sibling artifact the generator merges

This takes the closing argument of issue #57 seriously: labelling is a documentation concern, so put it in a documentation layer. This repo already works this way elsewhere — `mappings/bindings/*.json` is declared data outside the schema, generated into pages and checked against implementations.

```json
// enum-descriptions.json
{ "styles/StrokeAlign": { "INSIDE": "…", "OUTSIDE": "…", "CENTER": "…" } }
```

Keeps the schema untouched and therefore cannot change validation at all. A completeness check is straightforward — every member described, no described member absent — and that check is the same shape as `build-mappings.mjs`'s existing key-table guard.

The cost is that the schema stops documenting itself. A third party who takes `styles.schema.json` and nothing else gets the values with no meanings, and this package publishes `schema/` precisely so others can consume it standalone. Two files to keep in sync is a smaller cost than that.

### E. Leave option meanings in the property description

No schema change, and the text is at least present. But it contradicts the constitution's description rule, no generator can render it per option, no check can verify it covers the set, and it leaves the `position` description above as the model rather than the warning.

## Decision

**Option A.** A closed value set is declared as `oneOf` branches of `const` plus `description`, one branch per option.

The set stays closed, and the option's meaning sits on the option.

Two things follow directly and are part of this decision:

- A branch's `description` is subject to the constitution's description rule: it says what choosing that option does, not what the property is for.
- Where a property's `description` currently carries option meanings, those move to their branches and the description keeps only the property's purpose. `position` is the worked example.

### `title` is optional, and earns its place in two of three positions

`title` is a standard annotation and the keyword the specification project's own example used. A branch is a full schema object, so it takes both. They answer different questions: `title` is what to call the option, `description` is what choosing it does. Where the value already says what to call it, `title` is a second copy and the constitution's delete-and-reread test removes it.

**On a `const` branch — use it where the value does not say what it means.**

```json
"variantDepth": {
  "oneOf": [
    { "const": 1,    "title": "Direct children only" },
    { "const": 2,    "title": "Two levels" },
    { "const": 3,    "title": "Three levels" },
    { "const": 9999, "title": "Unlimited", "description": "A sentinel, not a depth. Traverses to the leaves." }
  ]
}
```

`settings.spec.variantDepth` is declared `[1, 2, 3, 9999]` today. Nothing about `9999` says "unlimited", and a reader has no way to learn it from the schema. `ColorObject.colorSpace` is the other clear case: fourteen CSS Color 4 identifiers where `a98-rgb`, `prophoto-rgb` and `xyz-d50` are precise but not readable.

The opposite case is most of `Styles`. `INSIDE` titled "Inside" and `SPACE_BETWEEN` titled "Space Between" add a word and no information — the constitution's naming rule already requires unabbreviated SCREAMING_CASE, which is why these values read as labels already. **So `title` is optional per branch, not required, and the test is whether the value already carries the label.**

**On a branch that is not a `const` — use it to name the form.** This is the use the first draft of this ADR missed, and it is the more valuable one.

```json
"ColorStyleValue": {
  "oneOf": [
    { "type": "string",  "title": "Literal", "description": "A colour in the notation selected by settings.spec.color" },
    { "$ref": "#/definitions/ColorObject", "title": "Component values" },
    { "$ref": "#/definitions/TokenReference", "title": "Token" },
    { "$ref": "#/definitions/GradientValue", "title": "Gradient" },
    { "type": "null", "title": "None", "description": "No fill is applied" }
  ]
}
```

A `$ref` branch names itself — the reference page reads `ColorObject` off the pointer. A **bare** branch does not: `{type: "string"}` and `{type: "null"}` render as `string` and `null` with no meaning available anywhere. This is already costing us. `build-schema-pages.mjs` hardcodes the phrase "`null` (nothing)" when rendering a null default, because the schema has no way to say what null means for that property. A branch annotation makes that derived instead of invented, and generalises to every union with a bare branch.

**On the property itself — no.** A `title` of "Size" on a property named `size` is a second copy of the key, and the reference page already heads the page with the key name. The property keeps `description` only.

### One caveat on the `$ref` branch form

Under draft-07, which all nine of these files declare, **a subschema containing `$ref` is a reference object and every sibling keyword is silently ignored.** So `{ "title": "Token", "$ref": "#/definitions/TokenReference" }` is, strictly read, a `$ref` and nothing else.

In practice this is already how this schema works and has to keep working: **124 of its 279 `$ref` occurrences carry a `description` sibling**, and the entire generated reference is built from them. The reliance is safe because it is annotation-only — our generators read the raw JSON, where the keywords are plainly present — and because no sibling here ever carries a *constraint*, which is where strict draft-07 behaviour would actually change what validates.

Two consequences of that, both accepted:

- A third-party validator following draft-07 strictly will not surface these titles. That is true of the 124 descriptions already in the files, so this decision does not introduce the exposure.
- Putting a constraint beside a `$ref` stays forbidden. Annotations only.

## How this composes with unions that are not pure enums

Most closed sets in this schema do not stand alone — they sit inside a union with a token reference, a null, or another type. The pattern composes, **but only while the branches stay mutually exclusive**, and getting that wrong fails in a way worth stating plainly.

### The hazard: an open branch of the same type

`strokeAlign` is `MixedStringStyleValue` — `oneOf: [ {type: string}, TokenReference, null ]`. Adding `const` branches beside the open string branch produces a schema that **inverts**. Checked with Ajv:

| Value | Against `oneOf: [{type: string}, {const: "INSIDE"}, …]` |
|---|---|
| `"INSIDE"` | **INVALID** — matches two branches, and `oneOf` demands exactly one |
| `"WHATEVER"` | **VALID** — matches only the open string branch |

The legal values are rejected and the illegal ones pass. So the open string branch is not something to add alongside; it is the thing the const set replaces. That closes the set, which changes what validates, which is why these belong with the other restrictive constraints rather than being treated as documentation.

Nesting the set as its own `oneOf` inside the outer one also works and keeps the grouping visible. Both forms verified: `"INSIDE"` valid, `"WHATEVER"` invalid, `null` valid.

### Where branches differ by type, it already works here

`MixedNumberStyleValue` is the precedent, already in the schema:

```json
"oneOf": [
  { "type": "number" },
  { "type": "string", "const": "mixed" },
  { "$ref": "#/definitions/TokenReference" },
  { "type": "null" }
]
```

A `const` branch coexisting with `number`, an object and `null`, with no exclusivity problem, because a string is not a number. Every union whose branches differ by JSON type converts safely and mechanically.

**A defect this surfaces.** `MixedStringStyleValue` is named for a `"mixed"` sentinel it never declares — its open `{type: string}` absorbs the sentinel and every real value alike, while `MixedNumberStyleValue` declares the same sentinel explicitly. Closing a `MixedString*` set therefore means declaring `"mixed"` as one of its branches. Omitting it would reject real documents.

### Where there is no closed set, nothing changes

`ColorStyleValue` is `string | ColorObject | TokenReference | GradientValue | null`, and the string branch is **one value in nine notations** — `HEX`, `RGBA`, `OKLCH` and so on, selected by `settings.spec.color`. Nine notations for one value is not nine values. That is a `format` or `pattern` question, not an enum one, and this ADR does not touch it.

The enum inside that neighbourhood is `ColorObject.colorSpace`, a plain property with fourteen members and no competing branch. It converts cleanly.

So the 31 sets divide three ways: plain properties that convert mechanically, unions whose branches differ by type that also convert mechanically, and the handful where a closed set must displace an open string branch of the same type — which are a validation change and are sequenced as one.

## Type ↔ Schema Impact

None. A string literal union in `types/` already expresses the closed set, and TypeScript offers no place to attach per-member documentation that survives into a consumer's editor for a union member. The types are unchanged, so parity is unaffected.

The constitution's "structural enums vs. `Style`" rule is unaffected: which properties get a named type is a separate question from how that type declares its options.

## Downstream Impact

- **Reference pages** gain an Option/Meaning table wherever a set is described, generated from the branches. `build-schema-pages.mjs` currently flattens enum members into the `Type` line.
- **The `Type` section and the null-default phrasing** become derived rather than invented. The generator hardcodes "`null` (nothing)" today because no branch can say what null means; a branch `title` and `description` replace that with the schema's own words.
- **Validators** see no change for the sets that convert mechanically. The sets that displace an open string branch do change what validates — they close something currently open — and must be checked against the full corpus before landing.
- **Consumers reading the schema as data** — anything iterating `enum` to build a picker — must read `oneOf[].const` instead. This is the only breaking read, and it is why the change class below is not `PATCH`.

## Semver Decision

**Target version**: `0.40.0` — the version of the active release branch this ADR merges into.

**Change class**: `MINOR` — the validation contract is unchanged for the mechanical conversions, but the shape a consumer reads to enumerate a closed set changes, which is more than documentation.

## Consequences

**Positive**

- A closed set documents itself at the point of declaration, for every consumer of the schema rather than only for readers of the generated site.
- The property `description` is freed to do one job, which is what the constitution's rule asks of it.
- Per-option text becomes checkable: a test can assert every branch carries a `description`, as `StyleDefaults.test.ts` asserts every property declares a `default`.
- Branches can later carry `deprecated` or `examples` per option, which a bare `enum` member cannot.
- A union's non-`const` branches become nameable, which removes a hardcoded phrase from the page generator and gives every bare `string` or `null` branch a meaning it has nowhere today.

**Negative**

- 31 declaration sites to convert, and the files get longer.
- 31 sets times their options is a real volume of text to write, and the sets are not equally urgent.
- `oneOf` is a less obvious "closed set" to a human reader than `enum`.

**Deferred**

- Writing the option descriptions themselves, which is per-set authoring rather than a structural change.
- The reference pages' Option/Meaning table.
- A test asserting every branch carries a `description`.
- Declaring the `"mixed"` sentinel on `MixedStringStyleValue`, which is a defect this work surfaces rather than creates.
