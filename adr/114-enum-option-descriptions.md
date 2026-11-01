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

A generated reference page can list `AUTO` and `ABSOLUTE` — it reads them straight out of the array — but it cannot say what either does. There is no mechanism for per-option text, so this is a missing capability rather than a convention being ignored.

The consequence shows up in the property `description`, which becomes the only available home:

> `position` — "Layout positioning mode — AUTO (participates in parent auto-layout) or ABSOLUTE. Present as ABSOLUTE on every element that emits positioning offsets, including children of non-auto-layout containers; AUTO appears only inside auto-layout containers (ADR-070). Structural property — not token-bindable."

That sentence carries four separate things: the property's purpose, two option meanings, an emission rule, and a token-bindability fact. The constitution now forbids all but the first, and the reference page derives the last two into their own sections. The option meanings have nowhere else to go.

The same pressure applies wherever a closed set exists. `settings.spec.color` admits nine formats, `settings.spec.tokens` eight, `ColorObject.colorSpace` fourteen. A reader choosing between `TOKEN_FIGMA_EXTENSIONS` and `FIGMA_NAME` gets the names and nothing else.

## Decision Drivers

1. **A reader choosing between options needs to know what they do.** Listing the names is the part the schema already does.
2. **One home per fact.** The constitution's description rule exists because a reference page derives type, default, bindings and rules into their own sections; option meanings must land somewhere that is not the property description.
3. **No change to what validates.** The schema is the authoritative validation contract. A documentation change that rejects or admits different documents is not a documentation change.
4. **Standard JSON Schema.** A vendor keyword works only in tooling that knows it, and these files are published for others to consume.
5. **Generators read structure, not prose.** Whatever carries the meaning has to be machine-readable, or the reference pages cannot render it and the drift guard cannot check it.

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

Standard draft-07. `const` plus `oneOf` admits exactly the same values as the equivalent `enum`, so validation is unchanged. Each branch is a schema object, so it takes a `description` — and could later take `examples` or a `$comment` without further structure.

Costs: three lines per option where there was one value, so the 31 sets grow the files; and `oneOf` is a weaker signal of "closed set" to a human skimming than `enum` is, though not to a validator.

### B. A vendor keyword alongside the `enum`

```json
{ "enum": ["INSIDE", "OUTSIDE", "CENTER"],
  "x-enumDescriptions": { "INSIDE": "…", "OUTSIDE": "…", "CENTER": "…" } }
```

Keeps `enum` as the signal and keeps the files compact. But it is ignored by every consumer that does not know the keyword, it allows a key that matches no enum member, and it puts the option's text somewhere other than the option — the same split that lets a description drift from what it describes.

### C. Leave the schema alone; carry option meanings in the property description

No schema change, and the information is at least present. But it contradicts the constitution's description rule, keeps meaning in prose where no generator can render it per option and no check can verify it covers the set, and leaves the `position` description above as the model rather than the warning.

## Decision

**Option A.** A closed value set is declared as `oneOf` branches of `const` plus `description`, one branch per option.

The set remains closed and validates identically. The option's meaning sits on the option.

Two consequences follow directly and are part of this decision:

- A branch's `description` is subject to the constitution's description rule: it says what choosing that option does, not what the property is for.
- Where a property's `description` currently carries option meanings, those move to their branches, and the description keeps only what it is for. `position` is the worked example.

## Type ↔ Schema Impact

None. A string literal union in `types/` already expresses the closed set, and TypeScript has no place to attach per-member documentation that survives into a consumer's editor for a union member. The types are unchanged, so parity is unaffected.

The constitution's "structural enums vs. `Style`" rule is unaffected: which properties get a named type is a separate question from how that type declares its options.

## Downstream Impact

- **Reference pages** gain an Option/Meaning table wherever a set is described, generated from the branches. `build-schema-pages.mjs` currently flattens enum members into the `Type` line.
- **Validators** see no change. Any consumer compiling these schemas accepts the same documents before and after.
- **Consumers reading the schema as data** — anything iterating `enum` to build a picker — must read `oneOf[].const` instead. This is the only breaking read, and it is why the change class below is not `PATCH`.

## Semver Decision

**Target version**: `0.40.0` — the version of the active release branch this ADR merges into.

**Change class**: `MINOR` — the validation contract is unchanged, but the shape a consumer reads to enumerate a closed set changes, which is more than documentation.

## Consequences

**Positive**

- A closed set is self-documenting at the point of declaration, for every consumer of the schema rather than only for readers of the generated site.
- The property `description` is freed to do one job, which is what the constitution's rule asks of it.
- Per-option text becomes checkable: a test can assert every branch carries a `description`, the same way `StyleDefaults.test.ts` asserts every property declares a `default`.

**Negative**

- 31 declaration sites to convert, and the files get longer.
- 31 sets × their options is a real volume of text to write. The sets are not equally urgent; the seven style-key sets block work already in flight, and `settings`' nine- and fourteen-option sets are the largest and least urgent.

**Deferred**

- Writing the option descriptions themselves, which is per-set authoring rather than a structural change.
- The reference pages' Option/Meaning table.
- A test asserting every branch carries a `description`.
