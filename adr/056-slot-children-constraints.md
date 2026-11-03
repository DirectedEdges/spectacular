# ADR 056: Rename `SlotProp.minItems`/`maxItems` to `minChildren`/`maxChildren`

**Branch**: `adr/056-slot-children-constraints`
**Created**: 2026-06-12
**Status**: ACCEPTED
**Summary**: `SlotProp.minChildren` and `maxChildren` replace `minItems` and `maxItems`, aligning with Figma's slot settings.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`SlotProp` (introduced in ADR-014) carries optional `minItems` and `maxItems` fields populated by the `slotConstraints` processing config. The names were chosen to echo JSON Schema's array vocabulary.

Figma's native `SLOT` property type now exposes a `slotSettings` object directly on `componentPropertyDefinitions` entries. Its shape is:

```json
{
  "type": "SLOT",
  "slotSettings": {
    "minChildren": 1,
    "maxChildren": 1,
    "allowPreferredValuesOnly": true,
    "stretchChildOnInsert": false,
    "displayEmptyByDefault": false
  },
  "preferredValues": [
    { "type": "COMPONENT_SET", "key": "48b446783d63308a34b5efc506fb4f0e407a8a2a" }
  ]
}
```

Figma uses `minChildren`/`maxChildren` — not `minItems`/`maxItems`. Additionally, `allowPreferredValuesOnly: true` combined with the `preferredValues` array provides a richer, first-class source for `anyOf` (the permitted component types), replacing the code-only prop convention.

The mismatch between the current schema field names (`minItems`/`maxItems`) and the Figma-native names (`minChildren`/`maxChildren`) is unnecessary friction: it requires a translation layer in specs-from-figma, creates confusion when reading Figma output alongside spec output, and diverges from UI design vocabulary where "children" is the universal term for nested content across platforms (React `children`, SwiftUI child views, Jetpack Compose content lambdas, web slots).

---

## Decision Drivers

- **Align with Figma-native names**: `minChildren`/`maxChildren` match the Figma API, eliminating a translation layer in specs-from-figma
- **Platform generality**: "children" is the idiomatic term for slot content across React, SwiftUI, Compose, and web — "items" is an array-centric term that implies ordered list semantics
- **Types and schema in sync**: the rename must be applied symmetrically to `types/Props.ts` and `schema/component.schema.json`
- **No runtime logic in this package**: only type declarations and schema

---

## Options Considered

### Option A: Rename to `minChildren`/`maxChildren` *(Selected)*

Rename both fields in `SlotProp` and the JSON schema. A MAJOR bump is required because the old field names are removed.

**Pros**:
- Direct 1:1 correspondence with Figma's `slotSettings.minChildren`/`maxChildren` — specs-from-figma can write through without translation
- "Children" is the canonical term in every major UI framework for content passed into a component — more portable than "items"
- Removes the translation layer that would otherwise be needed when reading `slotSettings` from `componentPropertyDefinitions`

**Cons / Trade-offs**:
- MAJOR bump: any serialized spec using `minItems`/`maxItems` must be migrated. In practice, `slotConstraints` is a new opt-in feature with limited adoption, making the blast radius small.

---

### Option B: Keep `minItems`/`maxItems`, add translation in specs-from-figma *(Rejected)*

Leave the schema unchanged; have specs-from-figma silently map `minChildren` → `minItems` when reading `slotSettings`.

**Rejected because**: it introduces a permanent mismatch between the schema vocabulary and the upstream source (Figma API), complicates debugging, and delays the naming problem rather than solving it. The feature is new enough that a MAJOR rename is cheap now.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Rename `minItems?: number` → `minChildren?: number` on `SlotProp` | MAJOR |
| `Props.ts` | Rename `maxItems?: number` → `maxChildren?: number` on `SlotProp` | MAJOR |

**Example — new shape** (`types/Props.ts`):
```ts
// Before
export interface SlotProp {
  type: 'slot';
  default?: string | null;
  nullable?: boolean;
  minItems?: number;   // @since 0.14.0
  maxItems?: number;   // @since 0.14.0
  anyOf?: string[];
  $extensions?: PropExtensions;
}

// After
export interface SlotProp {
  type: 'slot';
  default?: string | null;
  nullable?: boolean;
  minChildren?: number;   // @since 0.25.0
  maxChildren?: number;   // @since 0.25.0
  anyOf?: string[];
  $extensions?: PropExtensions;
}
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Rename property `minItems` → `minChildren` under `#/definitions/SlotProp` | MAJOR |
| `component.schema.json` | Rename property `maxItems` → `maxChildren` under `#/definitions/SlotProp` | MAJOR |

**Example — new shape** (`schema/component.schema.json`):
```json
"SlotProp": {
  "properties": {
    "minChildren": {
      "type": "integer",
      "minimum": 0,
      "description": "Minimum number of children this slot accepts"
    },
    "maxChildren": {
      "type": "integer",
      "minimum": 0,
      "description": "Maximum number of children this slot accepts"
    }
  }
}
```

### Notes

- `anyOf` is unchanged — it is not a Figma-native field name and remains appropriate for the spec vocabulary (permitted component types).
- The `@since` JSDoc annotation on the renamed fields advances to `0.25.0` (the next schema version).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — both `minChildren` and `maxChildren` are renamed in both `types/Props.ts` and `schema/component.schema.json`.
- **Parity check**: `SlotProp.minChildren` → `#/definitions/SlotProp/properties/minChildren`; same for `maxChildren`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Writes `minItems`/`maxItems` onto `SlotProp` in `SlotConstraints.promote()` | Update to write `minChildren`/`maxChildren`; update `CONSTRAINT_SUFFIXES` and `parseConstraintKey` to match code-only prop naming convention |
| `specs-cli` | Reads `SlotProp` for schema validation and output serialization | Recompile against updated schema package — no logic changes required |
| Serialized spec files | Any `.yaml`/`.json` spec using `minItems` or `maxItems` on a slot prop fails schema validation | Rename fields in spec files |
| `specs-plugin-2` | Uses `specs-from-figma` types at build time | Rebuild against updated `specs-from-figma` |

### specs-from-figma implementation notes

Beyond the field rename, specs-from-figma gains a new reading path for slot constraints:

**Reading priority for `minChildren`/`maxChildren`**:
1. If the slot's `componentPropertyDefinitions` entry has `slotSettings.minChildren`/`maxChildren` defined, use those values directly (no code-only prop required).
2. Otherwise, fall back to code-only props named `{slotName} minChildren` / `{slotName} maxChildren`.

**Reading priority for `anyOf`**:
1. If `slotSettings.allowPreferredValuesOnly === true`, resolve `anyOf` from `preferredValues` — look up each entry's `key` to its component (or component set) name asynchronously, using the same runtime-agnostic resolution pattern as `instanceOf` (plugin: `figma.importComponentByKeyAsync`; REST: indexer key lookup).
2. Otherwise, fall back to code-only prop `{slotName} anyOf` if present.

The code-only prop convention (`minItems`/`maxItems` suffixes) must also be updated to `minChildren`/`maxChildren` to remain consistent with the renamed schema fields. Existing libraries using the old code-only prop names will need to update their prop names in Figma. Libraries that upgrade to native `slotSettings` require no code-only props at all.

---

## Semver Decision

**Version bump**: `0.24.0 → 0.25.0` (`MAJOR`)

**Justification**: Two existing optional fields (`minItems`, `maxItems`) are removed and replaced by new fields with different names. Per constitution section III, removing any field — optional or not — is a MAJOR change because existing serialized specs referencing those fields become invalid.

---

## Consequences

- specs-from-figma reads `slotSettings` natively from `componentPropertyDefinitions`, with no translation layer for field names.
- Libraries using Figma's native slot settings (`minChildren`/`maxChildren` via `slotSettings`) can drop the code-only prop convention entirely.
- Libraries still using code-only props must rename their props from `{slot} minItems` / `{slot} maxItems` to `{slot} minChildren` / `{slot} maxChildren`.
- Downstream consumers reading `SlotProp` must rename field access; schema validation will catch mismatches at generate time.
- `anyOf` is now populated from `preferredValues` (native Figma source) when `allowPreferredValuesOnly` is true — more reliable than a free-text code-only prop.
