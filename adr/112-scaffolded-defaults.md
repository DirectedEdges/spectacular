# ADR: Settings defaults adopt their scaffolded values

**Branch**: `112-scaffolded-defaults`
**Created**: 2026-10-22
**Status**: ACCEPTED
**Summary**: `spec.format`, `spec.keys`, `spec.color`, `curation.preserveManualSelections` and `spec.collapsePrimitiveWrapper` default to the values every scaffolded workspace writes.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; changes default values introduced by ADR-071, ADR-093)*

---

## Context

A `Settings` member's default is stated twice in this package, and the two statements are the whole contract for what a run produces when nobody chooses: `DEFAULT_SETTINGS` in `types/Settings.ts` supplies the resolved value, and the `"default"` keyword in `schema/settings.schema.json` publishes it. A consumer that leaves a member unset resolves to that value, and a tool reading the schema reports it as the answer.

For five members, no surface in the ecosystem actually resolves to that value in practice. The scaffolded workspace writes a different one explicitly, and has done so since the split-config layout landed:

| Member | Declared default | Value shipped in a scaffolded workspace |
|---|---|---|
| `spec.format` | `JSON` | `YAML` |
| `spec.keys` | `SAFE` | `CAMEL` |
| `spec.color` | `HEX` | `HEXA` |
| `curation.preserveManualSelections` | `false` | `true` |
| `spec.collapsePrimitiveWrapper` | `false` | `true` |

Nothing errors, because the written value is explicit. What breaks is the contract's single answer:

- A consumer reading the published settings documentation is told one value; a consumer reading their own workspace file sees another.
- The declared default is the value a run is given when nobody chooses — and for these five, nobody chooses it. A default that no surface resolves to describes nothing.
- A consumer that resolves `Settings` itself (rather than reading a file) gets a different result from one that was scaffolded, for the same library and the same intent.

This is a disagreement inside the published contract, not an authoring mistake in any one consumer. The schema states which value is normal; five of those statements are wrong about what normal is.

**Out of scope.** Four further members diverge between the declared default and a scaffolded workspace — `spec.roles`, `spec.promotePrimitives`, `spec.defaultSlotContent`, `spec.roleValidation`. Their defaults stand, for the reason given under Decision 2. How a scaffolded workspace presents them is a question about the scaffold, not about the contract, and is decided outside this ADR (DirectedEdges/spectacular#749).

---

## Decision Drivers

- **One stated answer per member.** The type's resolved value and the schema's `"default"` keyword are the contract's only statement of what a member resolves to when unset. Two answers for one member is a defect in the contract regardless of which consumer is reading.
- **A default describes the normal case, not the historical one.** The value is a claim about what a run should produce absent a choice. A value that every surface overrides is not that claim.
- **Contract coherence, not one consumer's convenience** (Principle III). The justification must hold for every consumer equally — a change argued from one package's internals would be inadmissible, and so would one argued from a single library's data.
- **Type ↔ schema parity** (Principle I). `DEFAULT_SETTINGS` and the matching `"default"` keywords move in the same change or not at all.
- **No logic added** (Principle II). `DEFAULT_SETTINGS` is one of three permitted runtime exports; changing a value in it adds no behaviour to this package.
- **Upgrade cost must be legible** (CHANGELOG standard). A consumer with an unset member receives different output after this change, and the classification must say so rather than understate it.

---

## Options Considered

### Decision 1 — Which side moves

#### Option A: The declared default adopts the shipped value *(Selected)*

`DEFAULT_SETTINGS` and the schema's `"default"` keywords change to the value a scaffolded workspace already writes. A workspace that sets the member explicitly is unaffected; a consumer that resolves `Settings` without setting it now gets the same answer a scaffolded workspace gets.

**Pros**:
- Satisfies **one stated answer per member**: the type, the schema, the published documentation and a scaffolded workspace all report the same value, with nothing left to keep in step by hand.
- Satisfies **a default describes the normal case**: the adopted values are the ones every workspace has been running on, so the contract's claim about the normal case becomes true rather than aspirational.
- Holds under **contract coherence**: the argument is that a default nobody resolves to is not a default, which is a statement about the contract and applies to every consumer equally.

**Cons / Trade-offs**:
- Behaviour-changing for any consumer that resolves these members without setting them — the reason this is classified `MAJOR` rather than `PATCH`.
- A consumer that deliberately relied on the old default for an unset member must now set it explicitly.

---

#### Option B: The declared default stands and each consumer declares an opinion *(Rejected)*

The schema keeps `JSON` / `SAFE` / `HEX` / `false` / `false`. Each consumer that wants another value writes it explicitly and says, in its own surface, that it is doing so.

**Rejected because**: it violates **a default describes the normal case**. Five members would keep a declared default that no surface resolves to, and the explanation of the real answer would live outside the contract, once per consumer. The published documentation and a reader's own file would still give different answers; the difference would merely be annotated rather than removed.

---

#### Option C: Every consumer adopts the declared default *(Rejected)*

The scaffold, the plugin panel and every other surface drop their values and resolve to `JSON` / `SAFE` / `HEX` / `false` / `false`.

**Rejected because**: it satisfies **one stated answer** but fails **a default describes the normal case** in the other direction. The declared values were the first ones written, not the ones chosen since; adopting them everywhere changes the output of every workspace to a shape none of them asked for, trading a documentation defect for an output regression.

---

### Decision 2 — Which members move

#### Option A: The five with a standing shipped value *(Selected)*

`spec.format`, `spec.keys`, `spec.color`, `curation.preserveManualSelections` and `spec.collapsePrimitiveWrapper`.

**Pros**:
- Each of the five has a value that a scaffolded workspace writes and that a run therefore actually uses, which is what makes it a candidate under **a default describes the normal case**.
- Holds under **contract coherence**: membership is decided by whether a member's declared default is contradicted in practice, not by which values anyone prefers.

**Cons / Trade-offs**:
- Leaves four members whose declared default and scaffolded value still differ, so the divergence is reduced rather than eliminated. The next section is why that is the correct stopping point.

---

#### Option B: All nine divergent members *(Rejected)*

Add `spec.roles`, `spec.promotePrimitives`, `spec.defaultSlotContent` and `spec.roleValidation` to the five.

**Rejected because**: it fails **a default describes the normal case**. Each of these four is the on-switch for a feature that reads something a workspace must first declare — Dev Mode annotations for `roles`, a primitives convention for `promotePrimitives`, a slot convention for `defaultSlotContent`. With nothing declared, the member is on and finds nothing, so the value a workspace carries is not evidence that the behaviour is the normal case; it is evidence that the switch is inert. `roleValidation` is the severity of a check that `roles` gates, so it cannot be normal while `roles` is not.

---

#### Option C: Only the three serialization members *(Rejected)*

`spec.format`, `spec.keys` and `spec.color` alone.

**Rejected because**: it fails **one stated answer per member** for `curation.preserveManualSelections` and `spec.collapsePrimitiveWrapper`, which meet the same test as the three and for the same reason. Both describe how a run treats what it already has — an existing hand-edited selection, an existing single-child wrapper — and neither depends on a convention being declared first, so neither is inert. Drawing the line at serialization would make membership a matter of which concern a member sits under rather than whether its default is true.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Settings.ts` | `DEFAULT_SETTINGS.spec.format` value `JSON` → `YAML` | MAJOR |
| `Settings.ts` | `DEFAULT_SETTINGS.spec.keys` value `SAFE` → `CAMEL` | MAJOR |
| `Settings.ts` | `DEFAULT_SETTINGS.spec.color` value `HEX` → `HEXA` | MAJOR |
| `Settings.ts` | `DEFAULT_SETTINGS.curation.preserveManualSelections` value `false` → `true` | MAJOR |
| `Settings.ts` | `DEFAULT_SETTINGS.spec.collapsePrimitiveWrapper` value `false` → `true` | MAJOR |
| `Settings.ts` | Doc comments on `Settings.spec.format`, `Settings.spec.keys`, `Settings.spec.color`, `Settings.curation.preserveManualSelections`, `Settings.spec.collapsePrimitiveWrapper` restate the new default | PATCH |
| `Settings.ts` | `ColorFormat` doc comment no longer calls `HEX` the default | PATCH |

No type signature changes. Every member's declared type, optionality and position are untouched; only the value supplied for an unset member moves.

**Example — new shape** (`types/Settings.ts`):
```yaml
# Before
DEFAULT_SETTINGS:
  curation:
    preserveManualSelections: false
  spec:
    format: JSON
    keys: SAFE
    color: HEX
    collapsePrimitiveWrapper: false

# After
DEFAULT_SETTINGS:
  curation:
    preserveManualSelections: true
  spec:
    format: YAML
    keys: CAMEL
    color: HEXA
    collapsePrimitiveWrapper: true
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `settings.schema.json` | `#/.../spec/properties/format/default` `"JSON"` → `"YAML"` | MAJOR |
| `settings.schema.json` | `#/.../spec/properties/keys/default` `"SAFE"` → `"CAMEL"` | MAJOR |
| `settings.schema.json` | `#/.../spec/properties/color/default` `"HEX"` → `"HEXA"` | MAJOR |
| `settings.schema.json` | `#/.../curation/properties/preserveManualSelections/default` `false` → `true` | MAJOR |
| `settings.schema.json` | `#/.../spec/properties/collapsePrimitiveWrapper/default` `false` → `true` | MAJOR |
| `settings.schema.json` | The five `description` strings restate the new default where they name it | PATCH |

**Example — new shape** (`schema/settings.schema.json`):
```yaml
# #/properties/spec/properties/format
format:
  type: string
  enum: [JSON, YAML]
  default: YAML        # was JSON
  description: "Serialization format. Defaults to YAML."
```

No property is added, removed, renamed or re-nested, and no `required` array changes. `enum` members are untouched — each adopted value was already a legal value of its member.

### Notes

- The five adopted values are legal members of their existing enums or booleans, so no validation outcome changes: a document that validated before validates after.
- `spec.layout`, `spec.tokens`, `spec.variantDepth` and `spec.details` are not in scope — a scaffolded workspace writes the declared default for each, so the contract already states one answer.
- The four members named under Decision 2 Option B keep their defaults. Their declared default and a scaffolded workspace's value still differ, deliberately.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: each `DEFAULT_SETTINGS` value has exactly one `"default"` keyword counterpart, and the five pairs move together.

| `DEFAULT_SETTINGS` path | `settings.schema.json` pointer |
|---|---|
| `spec.format` | `#/properties/spec/properties/format/default` |
| `spec.keys` | `#/properties/spec/properties/keys/default` |
| `spec.color` | `#/properties/spec/properties/color/default` |
| `curation.preserveManualSelections` | `#/properties/curation/properties/preserveManualSelections/default` |
| `spec.collapsePrimitiveWrapper` | `#/properties/spec/properties/collapsePrimitiveWrapper/default` |

The `Settings` interface and the `ResolvedSettings` interface are unchanged, so the rule that every member with a default in `DEFAULT_SETTINGS` is required in `ResolvedSettings` continues to hold without edit.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | A run that resolves an unset member now gets the adopted value. The scaffolded workspace already writes four of the five, and `curation.preserveManualSelections` becomes redundant there rather than contradictory. | Recompile. Reconcile the scaffolded workspace and the published settings pages against the new defaults. |
| `specs-from-figma` | Receives resolved settings rather than defaulting them, so the values it is handed change while its handling does not. | Recompile. Re-baseline any fixture whose expected output assumed `JSON`, `SAFE`, `HEX` or an uncollapsed single-child wrapper. |
| `figma-from-specs` | Reads a spec that may now arrive in a different serialization and key casing when produced from unset settings. | Recompile. Confirm round-trip fixtures do not assume the former defaults. |
| `react-from-specs` | Consumes the spec, not the settings; key casing reaches it through the spec it is given. | Recompile. Re-baseline emitted output where a fixture assumed `SAFE` keys. |
| `webcomponents-from-specs` | Same as `react-from-specs`. | Recompile. Re-baseline emitted output where a fixture assumed `SAFE` keys. |
| `from-specs` | Shared core over the spec shape; no settings resolution of its own. | Recompile. |
| `specs-plugin-2` | The panel supplies its own defaults, which currently match the former declared values for `format`, `keys`, `color` and `collapsePrimitiveWrapper`. After this change the panel's untouched state resolves differently from an unset workspace. `curation` has no panel counterpart. | Align the panel's default state with the new declared defaults, so an untouched panel and an unset workspace resolve the same. |

---

## Semver Decision

**Target version**: `0.39.0` — the version `packages/schema/package.json` carries on `release/next`.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: Constitution VI classes `MAJOR` by change to a type signature, field name, field presence or schema structure, and none of those moves here — the change is a value inside a permitted runtime export and the matching `"default"` keyword. It is nonetheless `MAJOR`-class, because the declared default is the value a consumer receives when it chooses nothing, so moving it changes the output of every consumer that left the member unset without any change on their part. The CHANGELOG standard requires the entry to let a consumer evaluate upgrade cost; classing a silent output change as `PATCH` or `MINOR` would understate it. The constitution's Gate 1 (types, constants and schema only), Gate 2 and Gate 3 (parity in both directions), and Gate 5 (no new runtime dependencies) are satisfied.

---

## Consequences

- A member's default has one statement: the type's resolved value, the schema's `"default"` keyword, the published settings page and a scaffolded workspace all report it, with nothing to reconcile by hand.
- A consumer that resolves `Settings` without setting these five members produces YAML with camelCase keys and 8-digit hex colors, keeps hand-edited curation selections across a changed Figma signal, and collapses an eligible single-child wrapper.
- A consumer that relied on an unset member resolving to `JSON`, `SAFE`, `HEX` or `false` must set the member explicitly to keep its former output.
- The scaffolded workspace stops writing four values that merely restated the default, so a reader of that file sees choices rather than restatements.
- `specs-plugin-2` carries a default state that disagrees with the contract until it is aligned, which is the one divergence this ADR creates rather than closes.
- Four members — `spec.roles`, `spec.promotePrimitives`, `spec.defaultSlotContent`, `spec.roleValidation` — keep a declared default that a scaffolded workspace overrides. That remains true by decision, and the reason is recorded here rather than left to be rediscovered.
