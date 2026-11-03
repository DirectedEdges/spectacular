# ADR 055: Variant State Classification via `processing.states`

**Branch**: `055-processing-states`
**Created**: 2026-06-05
**Status**: ACCEPTED
**Summary**: A `processing.states` list of `VariantStateEntry` classifies variant props as browser-driven or consumer-controlled.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`specs-schema` defines `Config.processing` as the block of library-structural facts that govern how Figma data is read and processed. It already captures subcomponent scoping, variant depth, glyph naming patterns, and instance example detection.

Figma variant props come in two semantically distinct categories that no current schema field distinguishes:

- **Browser-driven states** — props like `state` (values: `hover`, `pressed`) and `focused` that map directly to CSS pseudo-classes (`:hover`, `:active`, `:focus-within`). The browser controls these; no consumer ever passes `state="hover"` as a component prop.
- **Consumer-controlled states** — props like `disabled`, `readOnly`, and `validation` that the consuming application sets. These map to HTML attributes (`[readonly]`) or ARIA attributes (`[aria-disabled="true"]`, `[aria-invalid="true"]`) that the component implementation must bridge.

Without a schema-level classification, every downstream consumer must independently heuristic-guess which props fall into which category. This produces inconsistent results — the `css` transformer might emit `[data-state="hover"]` while a contract generator includes a `state` prop that no consumer should ever set. The classification is a fact about the library's design language and belongs in `processing` alongside other such structural facts.

ADR 053 established `config.transformers` for per-transformer invocation options. That namespace was considered for `states` but is intentionally scoped to the `specs transform` command and is not consumed by `specs-from-figma` or `specs-plugin-2`. Because the `states` classification is useful to the plugin (UI surfaces, annotation of generated output) and any future emitter, it must live in a config block that all consumers read — `processing`.

---

## Decision Drivers

- **Additive only**: changes must not break existing configs or downstream consumers — MINOR bump, no MAJOR
- **Types and schema in sync**: every new type field must have a schema counterpart and vice versa
- **No runtime logic in this package**: only type declarations and `DEFAULT_CONFIG`
- **Multi-consumer applicability**: the classification must be readable by `specs-cli`, `specs-from-figma`, and `specs-plugin-2` without special-casing
- **Deterministic, not heuristic**: downstream consumers must not guess — the config is the sole authority

---

## Options Considered

### Option A: `config.processing.states` *(Selected)*

Add `states?: VariantStateEntry[]` to `Config.processing`. Each entry names a variant prop, maps its values to CSS selector strings (or `null` for the default/base state), and declares whether the prop should be retained in generated contracts.

**Pros**:
- `processing` is already the home for library-structural facts read by all consumers including the plugin
- Absence of a `states` entry for a prop is a clear, safe default: treat as a `data-*` attribute, retain in contract
- The classification is a fact about the library's design language — not about any specific output format — so it fits `processing` semantically
- Opens the door for `specs generate` to annotate `api.yaml` with semantic role in a future ADR

**Cons / Trade-offs**:
- `processing` currently contains only generate-time configuration; `states` does not influence `specs generate` today (only `specs transform`). This is a mild conceptual stretch, resolved by the forward-looking annotation opportunity above.

---

### Option B: `config.transform.states` *(Rejected)*

Place `states` inside the `transform` block established by ADR 053.

**Rejected because**: `config.transform` is consumed only by `specs-cli`'s `transform` command. It is not read by `specs-from-figma` or `specs-plugin-2`. A classification needed by the plugin cannot live here.

---

### Option C: Top-level `config.states` *(Rejected)*

Add `states` as a new peer of `processing`, `format`, and `include`.

**Rejected because**: introduces a fourth top-level key with no structural precedent in the existing config model. The classification is a structural fact about how the library uses variant props, placing it correctly within `processing`'s existing role.

---

## Decision

### New types

| File | Change | Bump |
|------|--------|------|
| `types/Config.ts` | Add exported type alias `StateConceptName` | MINOR |
| `types/Config.ts` | Add exported interface `VariantStateEntry` | MINOR |
| `types/Config.ts` | Add optional field `states?: VariantStateEntry[]` to `Config.processing` | MINOR |
| `types/Config.ts` | Add optional field `states?: VariantStateEntry[]` to `ResolvedConfig.processing` | MINOR |
| `types/index.ts` | Export `StateConceptName`, `VariantStateEntry` | MINOR |

**New types** (`types/Config.ts`):

```typescript
/**
 * A recognized semantic state concept name used as the key in `Config.processing.states`.
 * Documented as a type alias for authoring guidance; keys in the schema accept any string
 * so the concept vocabulary can grow without a schema version bump.
 * Unrecognized concept names fall through to data-* attribute treatment.
 *
 * @since 0.24.0
 */
export type StateConceptName =
  // Browser pseudo-classes — default contract: omit (browser-driven, not consumer props)
  | 'hover'             // :hover
  | 'active'            // :active
  | 'focus'             // :focus-visible
  | 'focus-visible'     // :focus-visible (alias for focus)
  | 'focus-within'      // :focus-within
  | 'placeholder-shown' // :placeholder-shown (input with no typed value)
  // ARIA / HTML attribute states — default contract: keep (consumer sets; component bridges)
  | 'disabled'          // :disabled, [aria-disabled="true"]
  | 'readonly'          // [readonly], [aria-readonly="true"]
  | 'required'          // [required], [aria-required="true"]
  | 'invalid'           // [aria-invalid="true"]
  | 'valid'             // [aria-invalid="false"]
  | 'selected'          // [aria-selected="true"]
  | 'checked'           // :checked, [aria-checked="true"]
  | 'indeterminate'     // :indeterminate, [aria-checked="mixed"]
  | 'expanded'          // [aria-expanded="true"]
  | 'collapsed'         // [aria-expanded="false"]
  | 'pressed'           // [aria-pressed="true"] (toggle button — NOT :active)
  | 'busy'              // [aria-busy="true"]
  | 'current';          // [aria-current="true"]

/**
 * Maps a concept key to the Figma variant prop (and optional variant value) that represents it
 * in this library. Used as the value type in `Config.processing.states`.
 *
 * The concept key drives both the CSS selector and the default contract behavior —
 * authors need only declare which prop (and value) represents each concept.
 *
 * @since 0.24.0
 */
export interface VariantStateEntry {
  /** The Figma variant prop name that carries this concept (e.g. `state`, `disabled`, `readOnly`). */
  prop: string;
  /**
   * The specific variant value on the prop that activates this concept.
   * Omit for boolean props — defaults to `"true"`.
   * Example: `value: "pressed"` maps `state=pressed` to the `active` concept (→ `:active`).
   */
  value?: string;
  /**
   * Override the concept's default contract behavior.
   * - `'omit'` — exclude from generated Props interfaces (browser-driven).
   * - `'keep'` — retain in generated Props interfaces (consumer-controlled).
   * Rarely needed — the concept key already encodes the canonical default.
   *
   * @since 0.24.0
   */
  contract?: 'omit' | 'keep';
}
```

### Concept table

The exhaustive set of states deterministically modelable from component variant data and the CSS/ARIA spec. The transform resolves each `concept` string to its canonical CSS selector and applies the default `contract` when none is declared.

| Concept | CSS selector | Default `contract` | Notes |
|---|---|---|---|
| `hover` | `:hover` | `omit` | Browser pseudo-class |
| `active` | `:active` | `omit` | Browser pseudo-class — pointer held down |
| `focus` | `:focus-visible` | `omit` | Keyboard-visible focus ring |
| `focus-visible` | `:focus-visible` | `omit` | Alias for `focus` |
| `focus-within` | `:focus-within` | `omit` | Any descendant focused |
| `placeholder-shown` | `:placeholder-shown` | `omit` | Input with no typed value |
| `disabled` | `:disabled, [aria-disabled="true"]` | `keep` | Consumer sets; component bridges to attribute |
| `readonly` | `[readonly], [aria-readonly="true"]` | `keep` | Consumer sets; component bridges to attribute |
| `required` | `[required], [aria-required="true"]` | `keep` | Consumer sets; component bridges to attribute |
| `invalid` | `[aria-invalid="true"]` | `keep` | Consumer controls validation state |
| `valid` | `[aria-invalid="false"]` | `keep` | Consumer controls validation state |
| `selected` | `[aria-selected="true"]` | `keep` | Listbox / tab / option item |
| `checked` | `:checked, [aria-checked="true"]` | `keep` | Checkbox / radio |
| `indeterminate` | `:indeterminate, [aria-checked="mixed"]` | `keep` | Checkbox partial selection |
| `expanded` | `[aria-expanded="true"]` | `keep` | Disclosure / accordion / select open |
| `collapsed` | `[aria-expanded="false"]` | `keep` | Disclosure / accordion / select closed |
| `pressed` | `[aria-pressed="true"]` | `keep` | Toggle button (not `:active`) |
| `busy` | `[aria-busy="true"]` | `keep` | Loading / async in progress |
| `current` | `[aria-current="true"]` | `keep` | Current item in a set |

> **`active` vs `pressed`**: `active` → `:active` fires while the pointer is held — the browser controls it, the consumer never sets it. `pressed` → `[aria-pressed="true"]` is the toggle button state — the consumer sets it, the component bridges it to the attribute. Use `active` for interaction feedback; use `pressed` for toggle components.

**`Config.processing` before / after**:

```typescript
// Before
processing: {
  subcomponents?: { ... };
  glyphNamePattern?: string;
  codeOnlyPropsPattern?: string;
  slotConstraints?: boolean;
  variantDepth?: 1 | 2 | 3 | 9999;
  details?: 'FULL' | 'LAYERED';
  inferNumberProps?: boolean;
  instanceExamples?: { ... };
}

// After
processing: {
  subcomponents?: { ... };
  glyphNamePattern?: string;
  codeOnlyPropsPattern?: string;
  slotConstraints?: boolean;
  variantDepth?: 1 | 2 | 3 | 9999;
  details?: 'FULL' | 'LAYERED';
  inferNumberProps?: boolean;
  instanceExamples?: { ... };
  /** Maps concept names to the Figma variant prop (and optional variant value) that represents each concept in this library. Absence means all variant props emit as data-* attribute selectors. @since 0.24.0 */
  states?: Record<string, VariantStateEntry>;
}
```

`ResolvedConfig.processing` gains the same optional `states?: VariantStateEntry[]` field. It remains optional in `ResolvedConfig` because absence is a meaningful default.

`DEFAULT_CONFIG` requires no change.

**Config example** (`specs.config.yaml`):

```yaml
config:
  processing:
    states:
      # Concept key → { prop, value?, contract? }
      # "value" is the Figma variant value that activates this concept.
      # Omit "value" for boolean props — defaults to "true".
      # "contract" is rarely needed — derived from the concept key.
      hover:
        prop: state
        value: hover
      active:
        prop: state
        value: pressed       # library calls it "pressed"; concept maps to :active
      focus-within:
        prop: focused        # boolean prop; value defaults to "true"
      disabled:
        prop: disabled
      readonly:
        prop: readOnly       # library uses camelCase
      invalid:
        prop: validation
        value: invalid       # only one variant value maps to this concept
      expanded:
        prop: expanded
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/workspace.schema.json` | Add `VariantStateEntry` definition | MINOR |
| `schema/workspace.schema.json` | Add `states` property to `#/definitions/Config/properties/processing` | MINOR |

**New definition** (`#/definitions/VariantStateEntry`):

```json
"VariantStateEntry": {
  "type": "object",
  "description": "Maps a concept key to the Figma variant prop (and optional variant value) that represents it in this library.",
  "properties": {
    "prop": {
      "type": "string",
      "description": "Figma variant prop name that carries this concept (e.g. 'state', 'disabled', 'readOnly')."
    },
    "value": {
      "type": "string",
      "description": "The specific variant value on the prop that activates this concept. Defaults to 'true' for boolean props."
    },
    "contract": {
      "type": "string",
      "enum": ["omit", "keep"],
      "description": "Override the concept's default contract behavior. 'omit' = exclude from Props interfaces. 'keep' = retain. Rarely needed — the concept key encodes the canonical default."
    }
  },
  "required": ["prop"],
  "additionalProperties": false
}
```

**Addition to `#/definitions/Config/properties/processing/properties`**:

```json
"states": {
  "type": "object",
  "additionalProperties": { "$ref": "#/definitions/VariantStateEntry" },
  "description": "Maps concept names to the Figma variant prop (and optional variant value) that represents each concept in this library. Concept keys determine the CSS selector emitted and the default contract behavior. Absence means all variant props emit as data-* attribute selectors."
}
```

### Notes

- `states` is optional in both `Config` and `ResolvedConfig`. Absence is the safe default: all variant props emit as `data-*` selectors and all props are retained in contracts.
- Concept keys are open strings in the schema — the vocabulary can grow without a schema version bump. `StateConceptName` is the TypeScript type alias documenting the recognized set.
- `value` defaults to `"true"` for boolean Figma props. All Figma variant prop values are serialized as strings in `variants.yaml`, including booleans.
- `contract` is rarely declared — the concept key encodes its canonical default (`omit` for browser-driven, `keep` for consumer-controlled). Declare it only when your library's use of the concept differs from the canonical.
- Multiple concept keys can reference the same `prop` with different `value` values — for example, `hover: { prop: state, value: hover }` and `active: { prop: state, value: pressed }`.
- Any prop value not matched by any concept's `value` for that prop is treated as the base/rest state and its variant is skipped — no explicit null mapping needed.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `VariantStateEntry` → `#/definitions/VariantStateEntry` (object, `prop` required, `value` optional, `contract` optional enum, no additional properties)
  - `Config.processing.states` → `#/definitions/Config/properties/processing/properties/states` (object with `additionalProperties: $ref: VariantStateEntry`)
  - `ResolvedConfig.processing.states` — same optional `Record<string, VariantStateEntry>`; no separate schema definition needed

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Reads `processing.states` in transformer context to determine CSS selector strategy (`css` transformer) and prop omission (`contract` transformer) | Read `config.processing.states` from `TransformerContext`; apply selector and contract logic per entry |
| `specs-from-figma` | None — does not read `processing.states` today | Recompile against updated `Config` / `ResolvedConfig` types |
| `specs-plugin-2` | May read `processing.states` to annotate plugin UI or generated output | Recompile; optionally consume `processing.states` for UI classification |

---

## Semver Decision

**Version bump**: part of `0.24.0` (`MINOR`)

**Justification**: All changes are additive — one new optional field on `Config.processing` and `ResolvedConfig.processing`, one new exported interface. No existing fields removed, renamed, or narrowed. Per constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

- Every downstream consumer can deterministically classify any variant prop as browser-driven or consumer-controlled by reading `processing.states` — no heuristics required
- The `css` transformer reads `processing.states` to choose between CSS pseudo-class/ARIA selectors and `data-*` attribute selectors per prop
- The `contract` transformer reads `processing.states` to decide which props to include or omit from generated Props interfaces
- `specs-plugin-2` gains a typed, config-driven hook for classifying variant props in its UI without coupling to CLI transformer logic
- Absence of `states` in any existing config is safe — behavior is unchanged (all `data-*` selectors, all props retained in contracts)
- A future ADR can use `processing.states` to annotate `api.yaml` during `specs generate`, making the classification part of the spec itself rather than a post-processing concern
