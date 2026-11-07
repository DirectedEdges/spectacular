# ADR: Examples Configuration

**Branch**: `042-composition-type`
**Created**: 2026-05-19
**Status**: ACCEPTED
**Summary**: A `processing.instanceExamples` block and `include.defaultSlotContent` govern which examples a spec carries.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-047 — Component Slot Examples](047-component-slot-examples), [ADR-048 — Component Instance Examples](048-component-instance-examples)

---

## Context

ADR-047 and ADR-048 establish `Component.slotContentExamples` and `Component.instanceExamples` as the two example registries on a component. Neither ADR specifies how the transformer discovers or gates these fields — that is a `Config` concern.

The two example types have **different shapes of control**, and that difference drives the whole design:

1. **Default slot content** — `Component.slotContentExamples` entries originating from the component's own slot layers (content authored inside a slot by default). Detection is **structural**: the transformer reads whatever sits inside slot layers, with no author-supplied naming patterns. There is nothing to *detect-configure*, only an output gate: `include.defaultSlotContent` (default `false`) decides whether this structurally-detected content is emitted and referenced from the component's slot bindings.

2. **Instance examples** — named frames in the Figma file that demonstrate a pre-configured whole-component usage. Detection **requires configuration**: the transformer needs naming patterns to identify which frames are examples and where to search. This mirrors `processing.subcomponents` (ADR-031) — and, like subcomponents, the *presence* of that configuration block is itself the opt-in. A team that writes `processing.instanceExamples` has, by that act, asked for instance examples; a second `include` flag would be a redundant gate.

So the configuration is deliberately **asymmetric**: default slot content is gated by an `include` flag (it has no detection block), while instance examples are gated by the **presence** of their `processing` block (no `include` flag). Both registries are additionally Pro-gated at emission time — see Notes.

---

## Decision Drivers

- **Match each example type to its natural control** — structural signals (default slot content) need only an output gate; pattern-detected signals (instance examples) are opted into by the presence of their detection block
- **`processing.instanceExamples` mirrors `processing.subcomponents`** — same match/exclude vocabulary and the same "absence = off, presence = on" semantics; `processing.subcomponents` has no `include.subcomponents` flag, and instance examples should not invent one
- **Avoid a redundant second gate** — requiring both `processing.instanceExamples` *and* `include.instanceExamples` produces the classic "I configured detection but got no output" foot-gun, with no benefit a single switch lacks
- **`defaultSlotContent` is the only example `include` flag** — it has no `processing` block (detection is structural), so the flag is its sole control; it defaults to `false` so unannotated components are unchanged
- **`scope: NESTED` is inapplicable** — component instances used as examples cannot live inside the component frame itself; the only meaningful search boundaries are the current page (`PAGE`, default) or the full file (`FILE`)
- **`scope: FILE` supports multi-page files** — some teams place example frames on a dedicated page (e.g., "Examples") separate from the component library page
- **`match` is an optional *secondary* filter, not the relevance test** — the primary check is structural identity (the candidate is an instance of the component being generated), which `specs-from-figma` already enforces. Example instances frequently carry names with no relationship to the component name (e.g. a "Card" usage named "Marketing hero"), so requiring `match` would exclude legitimate examples. Omitting `match` means "every in-scope instance of this component," narrowed by `exclude`/`parentNames`; supplying `match` narrows further by name
- **`parentNames?: string[]` narrows the search space** — example frames are often grouped inside a named parent section or frame (e.g., a frame named `"Examples"`) to distinguish them from test cases or playground instances
- **Additive, type ↔ schema symmetric, no runtime logic** — new optional fields only (Constitution §I/§II); transformer detection/gating logic lives in `specs-from-figma`

---

## Options Considered

### Option A: `include.defaultSlotContent` flag + presence-driven `processing.instanceExamples` *(Selected)*

Add a single example `include` flag, `include.defaultSlotContent?: boolean` (default `false`), gating the component's structurally-detected default slot content. Add `processing.instanceExamples?` with `{ scope?, match?, exclude?, parentNames? }`; its **presence** both configures detection and enables instance-example output — there is **no** `include.instanceExamples` flag. Within the block, **`match` is an optional name filter**: the primary relevance test is structural identity (the candidate instance is a usage of the component being generated), so when `match` is omitted every in-scope instance qualifies, subject to `exclude`/`parentNames`.

```yaml
# Config — instance examples on a dedicated page, inside an "Examples" parent frame
processing:
  instanceExamples:        # presence = detect AND emit instance examples
    scope: FILE
    parentNames:
      - Examples
    match:
      - "{C} / *"
    exclude:
      - "* / Deprecated / *"

include:
  defaultSlotContent: true   # emit the component's own default slot content
```

```yaml
# Config — instance examples alongside the component, default slot content off
processing:
  instanceExamples:
    scope: PAGE
    match:
      - "{C} – *"
      - "{C} Example *"
```

```yaml
# Config — no name patterns: every instance of the component inside the
# "Ready-made examples" frame is an example (identity + parentNames do the scoping)
processing:
  instanceExamples:
    scope: PAGE
    parentNames:
      - Ready-made examples
```

`scope` values:
- `PAGE` — search the current Figma page only (default; typical when examples live alongside components)
- `FILE` — search all pages in the Figma file (for teams that place examples on a separate page)

`parentNames` (optional) — one or more frame or section names; a candidate qualifies when its **immediate** parent matches one of the listed names. Absence means no parent-name filtering.

The `parentNames` field name was chosen by ranking the realistic candidates for this `string[]` of ancestor names:

1. **`parentNames` *(selected)*** — precise (the values are *names* matched against the parent's name), plural (signals the array, resolving the ambiguity that a singular `parent` reads as one value), and keeps Figma's `parent` vocabulary (`node.parent`) without introducing the user-facing "layer" term.
2. **`parents`** — concise and parallel with the sibling `string[]` filters `match`/`exclude`, but hints at parent *objects* rather than names.
3. **`parentLayerNames`** — unambiguous and consistent with house "layer" vocabulary (cf. `Props.layer`), but verbose against the terse sibling fields, and "Layer" is largely redundant once `parent…Names` already denotes the name of a containing node.
4. **`parentLayers` / `parentLayer`** — rejected: both imply you pass the layers themselves rather than their names, and the singular is the wrong number for an array.

Containment-flavored names (e.g. `within`) were also rejected: they imply any-depth nesting, whereas matching is scoped to the **immediate** parent, so "parent" must remain in the name.

**Pros**:
- Each example type is gated by the control that fits it — no empty config blocks, no redundant flags
- Instance examples gate exactly like `processing.subcomponents`, so the mental model transfers
- `scope: PAGE | FILE` covers all real Figma file organisations; `NESTED` is explicitly excluded
- `parentNames` solves the false-positive problem without artificially unique name patterns
- One example `include` flag (`defaultSlotContent`) instead of two — smaller, less error-prone config surface

**Cons / Trade-offs**:
- The two example types are gated **differently** (one `include` flag, one by `processing`-block presence). This asymmetry must be documented, but it reflects a real difference (structural vs pattern-detected) and matches the established `subcomponents` precedent.

---

### Option B: Add a separate `include.instanceExamples` flag *(Rejected — earlier draft of this ADR)*

An earlier draft gated instance examples with `include.instanceExamples?: boolean` alongside `include.defaultSlotContent`, so instance examples required **both** a `processing.instanceExamples` detection block **and** a separate include flag to emit.

**Rejected because**:
- **Redundant gate.** `processing.instanceExamples` is already opt-in by absence — configuring detection *is* the opt-in. A second flag, `false` by default, adds a step whose only effect is the "I set up detection but saw no output" foot-gun.
- **Asymmetric with `subcomponents`.** `processing.subcomponents` has no `include.subcomponents`; its presence is the complete on-switch. Instance examples follow the same detect-and-emit model and should gate identically.
- **Not parallel with `defaultSlotContent`.** `defaultSlotContent` genuinely needs an `include` flag because it has *no* `processing` block (detection is structural) — the flag is its only control. Instance examples already have a `processing` block, so the flag is pure redundancy. The two example types differ in kind, so gating them the same way was the wrong symmetry to chase.

---

### Option C: Single `include.examples` flag *(Rejected)*

Gate all example output with one `include.examples?: boolean`.

**Rejected because**: The two example types are different in kind and readiness. Default slot content is structural and may be ready before any instance-example frames are annotated. A single flag forces all-or-nothing and cannot model partial readiness — and it still would not address instance-example *detection*, which needs patterns regardless.

---

### Option D: `processing.instanceExamples` as a boolean *(Rejected)*

Gate instance example detection with `processing.instanceExamples?: boolean` instead of the match/exclude block.

**Rejected because**: A boolean provides no way to specify which Figma frames are instance examples. Instance frames are identified by name; without naming patterns the transformer must either guess (fragile) or harvest all frames (noisy). The match/exclude block gives authors control over exactly which frames are harvested, consistent with `processing.subcomponents`.

---

### Option E: Add `processing.defaultSlotContent` alongside `processing.instanceExamples` *(Rejected)*

Mirror the full subcomponents shape for both example types.

**Rejected because**: Default slot content is derived from structural Figma data — content placed inside a slot layer. There is no naming convention to configure; detection is entirely structural. A `processing.defaultSlotContent` block would be an empty config object with no fields to set, adding author surface area for nothing. The `include.defaultSlotContent` flag is the right and only control.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Add `include.defaultSlotContent?: boolean` | MINOR |
| `Config.ts` | Add `processing.instanceExamples?: { scope?, match?, exclude?, parentNames? }` | MINOR |
| `Config.ts` | Add `include.defaultSlotContent: boolean` to `ResolvedConfig`; add `processing.instanceExamples?: { scope, match?, exclude?, parentNames? }` (scope required in resolved; match optional) | MINOR |
| `Config.ts` | Add `defaultSlotContent: false` to `DEFAULT_CONFIG.include` | MINOR |

There is **no** `include.instanceExamples` in `Config`, `ResolvedConfig`, or `DEFAULT_CONFIG`. Instance-example output is governed entirely by the presence of `processing.instanceExamples`.

**`Config` additions** (`types/Config.ts`):

```ts
// processing block — new optional field; its presence is the instance-example on-switch
instanceExamples?: {
  /** Search boundary. PAGE = current page only (default); FILE = all pages in the file. */
  scope?: 'PAGE' | 'FILE';
  /** Optional name patterns narrowing which instance frames qualify. Uses {C} (component name) placeholder. Absence = every in-scope instance of the component qualifies (subject to exclude/parentNames). */
  match?: string[];
  /** Name patterns for frames to exclude. Same {C} syntax as match. */
  exclude?: string[];
  /** Immediate-parent frame or section names a candidate must be contained within. Absence = no parent-name filtering. */
  parentNames?: string[];
};

// include block — one new optional flag (default slot content is structural, so the flag is its only control)
/** Include the component's default slot content as examples in output. Optional; defaults to false. @since 0.21.0 */
defaultSlotContent?: boolean;
```

**`ResolvedConfig` additions** (`types/Config.ts`):

```ts
// processing block — scope is required (defaults to PAGE); the block stays optional (absence = off)
instanceExamples?: {
  scope: 'PAGE' | 'FILE';
  match?: string[];
  exclude?: string[];
  parentNames?: string[];
};

// include block — flag required (resolved from defaults)
defaultSlotContent: boolean;
```

**`DEFAULT_CONFIG` additions** (`types/Config.ts`):

```ts
include: {
  // existing fields unchanged
  invalidVariants: false,
  invalidCombinations: true,
  emptyVariants: false,
  // new — the only example include flag
  defaultSlotContent: false,
},
// processing.instanceExamples is NOT in DEFAULT_CONFIG — its absence means "off",
// the same as processing.subcomponents.
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `defaultSlotContent` to the config `include` block | MINOR |
| `component.schema.json` | Add `instanceExamples` to the config `processing` block | MINOR |

The config `include` block gains **only** `defaultSlotContent`; it does **not** gain an `instanceExamples` boolean.

**`include` additions**:

```yaml
defaultSlotContent:
  type: boolean
  description: "Include the component's default slot content as examples in output. Defaults to false."
```

**`processing` addition**:

```yaml
instanceExamples:
  type: object
  description: "Instance example detection settings. Absence means no instance example detection or output."
  properties:
    scope:
      type: string
      enum: [PAGE, FILE]
      description: "Search boundary. PAGE = current Figma page only (default); FILE = all pages in the file."
    match:
      type: array
      items: { type: string }
      description: "Optional name patterns narrowing which instance frames qualify. Uses {C} placeholder. Absence = every in-scope instance of the component qualifies (subject to exclude/parentNames)."
    exclude:
      type: array
      items: { type: string }
      description: "Name patterns for frames to exclude. Same {C} syntax as match."
    parentNames:
      type: array
      items: { type: string }
      description: "Immediate-parent frame or section names a candidate must be contained within. Absence = no parent-name filtering."
  additionalProperties: false
```

### Out of scope for this ADR

- **Transformer detection logic** for instance examples — belongs in `specs-from-figma`; this ADR defines the config shape only
- **Pro-license gating** — both example registries are additionally gated on a Pro license at emission time, enforced in `specs-from-figma` via the existing `entitled()` mechanism (the same pattern used for token references and other premium output). This ADR does not introduce the license model; it only notes that the config flags/blocks are necessary-but-not-sufficient for output (see Notes)
- **`processing.defaultSlotContent`** — structural detection requires no config; if naming-pattern detection is ever added, a `processing.defaultSlotContent` block would follow the subcomponents model

### Notes

- **Instance examples are presence-gated.** When `processing.instanceExamples` is omitted, the transformer performs no detection and emits no `instanceExamples` — exactly the `processing.subcomponents` model. When present (and the license is Pro), examples are both detected and emitted. There is no `include.instanceExamples` flag.
- **`defaultSlotContent` gates the component's own slot content.** It controls whether the structurally-detected default content of the component's slots is emitted into `slotContentExamples` and referenced from the component's slot bindings. Instance examples contribute their own fills to the same `slotContentExamples` registry independently of this flag (see ADR-047/048).
- **Pro license required for emission.** Both `defaultSlotContent` output and `instanceExamples` output are omitted on the free tier regardless of config, mirroring other premium output. The config flag/block is necessary but not sufficient.
- **`scope` defaults to `PAGE` in `ResolvedConfig`.** `FILE` is opt-in for teams with a dedicated examples page. `NESTED` is intentionally absent — component instances used as examples cannot live inside the component frame itself.
- **`parentNames` is an immediate-parent filter, not a full path.** Sufficient for the common convention of grouping examples inside a frame named `"Examples"`, without requiring authors to express full paths.
- **`match` is optional.** The primary relevance test is structural identity (the candidate is a usage of the component being generated), enforced in `specs-from-figma`. `match` only narrows that set by frame name; omitting it accepts every in-scope instance (still subject to `exclude`/`parentNames`). This matters because example instances commonly have names unrelated to the component name.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Config.include.defaultSlotContent?: boolean` ↔ config `include.properties.defaultSlotContent`
  - `Config.processing.instanceExamples?: { scope?, match?, exclude?, parentNames? }` ↔ config `processing.properties.instanceExamples` (no `required` block — `match` optional)
  - No `include.instanceExamples` exists in either the type or the schema — symmetric by absence

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Reads `processing.instanceExamples` to detect example frames and to gate their output (presence-driven); gates `slotContentExamples` output on `include.defaultSlotContent`. Both registries additionally gated on a Pro license | Implement detection + dual (config-presence/flag + license) gating |
| `specs-cli` | Recompile; config surface adds `include.defaultSlotContent` and `processing.instanceExamples`. `ConfigLoader` allowlist must not accept a stale `include.instanceExamples` | Recompile; update config docs/help text |
| `specs-plugin-2` | Recompile; the plugin's instance-examples toggle drives the *presence* of `processing.instanceExamples` (no `include.instanceExamples`); the default-slot-content toggle maps to `include.defaultSlotContent` | Recompile; map UI toggles accordingly; Pro-gate the controls |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: Adds optional fields to `Config`, `ResolvedConfig`, and `DEFAULT_CONFIG` (`include.defaultSlotContent`, `processing.instanceExamples`) and the corresponding schema entries. Purely additive — no existing field is removed or narrowed → MINOR per Constitution §III. (Because this ADR is still DRAFT/unreleased, dropping the earlier-draft `include.instanceExamples` is not a consumer-facing removal — that flag never shipped.)

---

## Consequences

- `include.defaultSlotContent` is the single example output flag — it gives teams control over the component's own default slot content; it defaults to `false` to preserve existing output for unannotated components
- `processing.instanceExamples` adapts the `processing.subcomponents` model exactly: presence is the complete on-switch (detection **and** output), absence means off, same match/exclude vocabulary; `scope` uses `PAGE | FILE` (not `NESTED`), and `parentNames` narrows the search by immediate-parent name
- The two example types are gated by **different** mechanisms by design — an `include` flag for structural default slot content, `processing`-block presence for pattern-detected instance examples — reflecting their different natures rather than forcing an artificial symmetry
- Both registries are additionally Pro-gated at emission; the config is necessary but not sufficient for output
- `DEFAULT_CONFIG` carries `include.defaultSlotContent: false`; `processing.instanceExamples` is absent there (absence = off), so no special-casing is needed when merging a partial `Config`

---

## Revision History

- **`match` made optional.** The first draft required `processing.instanceExamples.match` (schema `required: [match]`, type `match: string[]`). Implementation in `specs-from-figma` confirmed the structural identity check (candidate instance ∈ the component's variants) is the real relevance filter, with `match` only a secondary name narrowing. Requiring it excluded legitimate examples whose frame names bear no relation to the component name. `match` is now optional (`match?: string[]`, no schema `required`); its absence accepts every in-scope instance, subject to `exclude`/`parentNames`. Still DRAFT/unreleased, so no consumer-facing change.
- **Shift from the original draft — removed `include.instanceExamples`.** The first draft of this ADR added two example `include` flags (`slotContentExamples`/`instanceExamples`) and treated detection (`processing.instanceExamples`) and output (`include.instanceExamples`) as separate concerns. Implementation surfaced that the second flag was a redundant gate, asymmetric with `processing.subcomponents`, and a source of "configured detection but no output" confusion. Instance examples are now governed solely by the presence of `processing.instanceExamples` (Option A; the old approach is recorded as Option B). Separately, the remaining slot-content flag was renamed `slotContentExamples → defaultSlotContent` so the config flag (the component's *default slot content*) is no longer confused with the `Component.slotContentExamples` data registry that aggregates fills from both sources.
