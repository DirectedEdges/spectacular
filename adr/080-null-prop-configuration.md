# ADR: `null` as a Prop Configuration Value

**Branch**: `080-null-prop-configuration`
**Created**: 2026-08-31
**Status**: ACCEPTED
**Summary**: A `null` prop configuration value joins the scalars, `PropBinding`, `SlotContentRef` and `ImageBinding` a configuration already carries.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A nullable prop can be unset. `SlotProp`, `StringProp`, `NumberProp`, and `ImageProp`
default to `nullable: true`, and a slot prop paired with a visibility boolean is
explicitly marked nullable with `default: null` — the pairing is what makes "no header"
expressible at all.

`PropConfigurations` cannot say it. `PropConfigurationValue` admits a scalar, a
`PropBinding`, a `SlotContentRef`, or an `ImageBinding` — but not `null`:

```yaml
# types/PropConfigurations.ts — current
PropConfigurationValue:
  - string
  - number
  - boolean
  - PropBinding
  - SlotContentRef
  - ImageBinding
```

So a configuration can express *which* content fills a slot and never that the slot is
empty. Producers that have to record an unset nullable prop are pushed into expressing
it some other way — most commonly by keeping the paired visibility boolean alongside the
content value:

```yaml
# A configuration that shows no header, as it can be expressed today
propConfigurations:
  header:
    $slotContent: "#/components/card/slotContentExamples/cardHeader"
  headerVisible: false
```

Two things are wrong with that. The boolean is not a prop of the component being
configured — `PropPairings` folds it into the content prop and removes it from `props`,
so the configuration names a prop that the API does not have. And the content value and
the boolean disagree: the slot is bound and hidden at the same time, leaving every
consumer to decide which half to believe. A consumer reading only the props it knows
sees a bound slot, and renders content the design does not show.

The gap is narrow and structural: the prop is nullable, the configuration type is not.

---

## Decision Drivers

- **A configuration says what a prop is set to** — including `null`, when the prop is
  nullable. Nothing outside the value should have to be consulted to know that.
- **One value carries the whole meaning** — a configuration must not need a second,
  paired key to be interpreted, and must never name a prop absent from `props`.
- **No platform-specific reads** — a consumer must not resolve a configuration by
  reading `$extensions`. Producer metadata explains provenance; it never carries meaning
  a consumer needs.
- **Layering must survive the round trip** — configurations layer, so an unset must be
  expressible as a value that overrides an inherited one. Absence already means "inherit";
  it cannot also mean "unset".
- **Additive only** — no existing document may become invalid.
- **Type ↔ schema parity** — every type arm has a schema arm.

---

## Options Considered

*(Pre-decided — no alternatives evaluated.)*

The decision follows from the nullable prop itself: a prop typed `nullable: true` with
`default: null` has `null` in its value domain, and a configuration that selects a value
for that prop must be able to select that one. No alternative was weighed, because any
other encoding reintroduces the second key this ADR exists to remove.

---

## Decision

Widen `PropConfigurationValue` to admit `null`.

`null` under a prop key means the prop is **unset** in this configuration. It is a value,
not an absence: an absent key inherits, a `null` key overrides an inherited value with
"no value".

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `PropConfigurations.ts` | Added `null` arm to `PropConfigurationValue` | MINOR |
| `InstanceExample.ts` | Added `null` arm to the inline value union on `propConfigurations` | MINOR |

**Example — new shape** (`types/PropConfigurations.ts`):

```yaml
# Before
PropConfigurationValue:
  - string
  - number
  - boolean
  - PropBinding
  - SlotContentRef
  - ImageBinding

# After
PropConfigurationValue:
  - string
  - number
  - boolean
  - "null"          # the prop is unset in this configuration
  - PropBinding
  - SlotContentRef
  - ImageBinding
```

The configuration above becomes a single key, with no boolean beside it:

```yaml
# A configuration that shows no header
propConfigurations:
  header: null

# A configuration that shows one
propConfigurations:
  header:
    $slotContent: "#/components/card/slotContentExamples/cardHeader"
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added `{ "type": "null" }` arm to `#/definitions/PropConfigurationValue` | MINOR |
| `component.schema.json` | Added `{ "type": "null" }` arm to `#/definitions/InstanceExample/properties/propConfigurations/additionalProperties` | MINOR |

**Example — new shape** (`schema/component.schema.json`):

```yaml
# #/definitions/PropConfigurationValue
oneOf:
  - type: string
  - type: number
  - type: boolean
  - type: "null"        # new arm — the prop is unset in this configuration
  - $ref: "#/definitions/PropBinding"
  - $ref: "#/definitions/SlotContentRef"
  - $ref: "#/definitions/ImageBinding"
```

### Notes

**Where the value may appear.** `null` is admissible under any prop key whose prop is
nullable, in every position a prop configuration occupies:

- `Element.propConfigurations` — a nested instance
- `Variant.configuration` — a variant's own configuration
- `NestedPropConfiguration` — a path-addressed descendant (`$nested`)
- `InstanceExample.propConfigurations` — a whole-component example

The first three reference `PropConfigurations`, and inherit the widened value type.
`InstanceExample.propConfigurations` does **not**: it declares its own inline union so it
can exclude `PropBinding` (ADR-048 — an example is a documented configuration, not a live
binding). That union is widened separately and by hand. It gains `null` and keeps its
exclusion of `PropBinding`.

**Layering.** Configurations layer, and `null` layers as a value. A base that binds a
slot and a layer that sets it `null` resolves to unset; the reverse resolves to bound. A
layer that omits the key inherits whatever the base carried. This is the property that
makes an unset expressible per-variant, and it is why absence and `null` must stay
distinct.

**Validity.** `null` under a non-nullable prop is not meaningful. This ADR does not add
cross-field validation to express that — the schema types the value domain, and prop
nullability continues to be described by the prop itself.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: The `null` arm of the `PropConfigurationValue` union in
  `types/PropConfigurations.ts` maps to the `{ "type": "null" }` member of the `oneOf` at
  `#/definitions/PropConfigurationValue` in `schema/component.schema.json`. No other type
  or schema definition changes; `PropConfigurations` and `NestedPropConfiguration`
  reference the widened value type and inherit the new arm.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Can emit an unset nullable prop as a value, and stop emitting a paired visibility boolean alongside a content value | Consolidate the paired boolean into the content prop before emitting; emit `null` when unset |
| `specs-cli` | Reads configurations when producing code artifacts | Treat a `null` configuration as "prop unset" — no content — rather than skipping the key |
| `specs-plugin-2` | Reads and renders configurations | Recompile; treat `null` as unset when applying a configuration |

Consumers that layer configurations MUST distinguish an absent key from a `null` one:
absent inherits, `null` overrides with unset.

---

## Semver Decision

**Version**: `0.31.0` (release branch `release/schema-0.31.0+cli-0.28.0`) — **MINOR**.

**Justification**: The change adds an arm to a union type and a member to a schema
`oneOf`. Every document valid before remains valid, and no field is renamed, removed, or
changed in presence — additive per the constitution's versioning rule ("`MINOR` for
additive types or new optional fields").

---

## Consequences

- A configuration can state that a nullable prop is unset, in every position
  `PropConfigurations` appears.
- A content prop paired with a visibility boolean is expressible as one key. Producers
  can stop emitting the boolean, which was never a prop of the component being configured.
- Consumers no longer need `$extensions` to interpret a configuration — the value is the
  whole meaning.
- Absence and `null` are now semantically distinct in layered configurations: absent
  inherits, `null` overrides with unset. Consumers that treated a missing key and an
  empty value alike must separate them.
- Documents produced before this ADR remain valid, and may still carry a paired boolean
  beside a content value. Producers are expected to stop writing that shape; readers
  that encounter it should prefer the content value.
