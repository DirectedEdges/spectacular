# ADR: Platform Code-Syntax Token Profiles

**Branch**: `051-platform-token-syntax`
**Created**: 2026-05-20
**Status**: ACCEPTED
**Summary**: Three `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS` and `FIGMA_SYNTAX_ANDROID` token profiles emit platform code syntax alongside the default `TOKEN`.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`format.tokens` is the token-reference serialization profile on `Config` (and its
resolved counterpart `ResolvedConfig`). It currently accepts:

```yaml
format:
  tokens: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'  # default: TOKEN
```

`TOKEN` (the default) emits platform-neutral token references (a `$token` path
plus `$type`). None of the existing profiles expose Figma's **per-platform code
syntax** — the developer-facing token name a designer assigns for `WEB`,
`ANDROID`, and `iOS` via Figma's `codeSyntax` API
([CodeSyntaxPlatform](https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/#code-syntax-platform)).

Specs Classic already offered platform code-syntax selection as its
`CODE_SYNTAX` property. Spectacular has no equivalent, so the plugin cannot reach
parity (tracked in [issue #103](https://github.com/DirectedEdges/specs/issues/103)).
This ADR records the **contract** change needed to close that gap: new
serialization profiles selecting a platform's code syntax, with a graceful
fall back to the `TOKEN` default when a token has no code syntax defined for the
chosen platform.

---

## Decision Drivers

- **Additive only**: Existing `format.tokens` values and the `TOKEN` default must
  be untouched, so the change is `MINOR` and breaks no downstream consumer.
- **Type ↔ schema parity**: The enum must change identically in `types/Config.ts`
  and `schema/component.schema.json` (Constitution I).
- **No logic in schema (Constitution II)**: The fall-back-to-`TOKEN` behaviour is
  a transformer responsibility; the schema only enumerates the selectable
  profiles. `DEFAULT_CONFIG` stays `TOKEN`.
- **Naming governance (Constitution VI)**: The feature is intrinsically a Figma
  concept (Figma's `codeSyntax` per `CodeSyntaxPlatform`). No code platform owns
  the term, and re-modelling it away from Figma's `WEB`/`ANDROID`/`iOS`
  vocabulary would lose round-trip fidelity — Rule 3 (defer to Figma) applies.
- **Parity with Specs Classic**: The profiles must map cleanly to Classic's
  `CODE_SYNTAX` selection so plugin behaviour is equivalent.

---

## Options Considered

### Option A: Add three platform profiles to `format.tokens` *(Selected)*

Extend the existing `format.tokens` enum with `FIGMA_SYNTAX_WEB`,
`FIGMA_SYNTAX_IOS`, and `FIGMA_SYNTAX_ANDROID`. Each selects the corresponding
platform's Figma `codeSyntax` value, falling back to the `TOKEN` profile's
output when that platform has no code syntax defined.

**Pros**:
- Additive — no existing value or default changes (`MINOR`).
- Reuses the one knob designers already understand for token serialization.
- Mirrors the structure of the existing `TOKEN_*` / `FIGMA_NAME` family.

**Cons / Trade-offs**:
- Couples platform selection into a single enum rather than a dedicated field;
  acceptable because all values are mutually exclusive serialization profiles.

---

### Option B: New dedicated `format.codeSyntaxPlatform` field *(Rejected)*

Add a separate `format.codeSyntaxPlatform?: 'WEB' | 'IOS' | 'ANDROID'` field
orthogonal to `format.tokens`.

**Rejected because**: It creates two interacting knobs (which wins when both are
set?), expanding the contract surface and the fall-back matrix the transformer
must define — more complexity for no expressive gain over Option A. The values
are mutually exclusive profiles, which `format.tokens` already models.

---

### Option C: Single `FIGMA_SYNTAX` profile resolving platform at runtime *(Rejected)*

One enum value whose target platform is inferred from environment/context.

**Rejected because**: It pushes platform selection into runtime logic and hides
intent from the serialized config, undermining the explicit, mechanically
verifiable contract. Parity with Classic's explicit per-platform selection would
be lost.

---

## Decision

Add three platform code-syntax profiles to the `format.tokens` enum. The default
remains `TOKEN`. When the selected platform has no `codeSyntax` for a given
token, the transformer emits the `TOKEN`-profile output (documented behaviour,
not a schema constraint).

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Add `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, `FIGMA_SYNTAX_ANDROID` to the `format.tokens` union on `Config` | MINOR |
| `Config.ts` | Add the same three members to the `format.tokens` union on `ResolvedConfig` | MINOR |

**Example — new shape** (`types/Config.ts`):
```yaml
# Before
format:
  tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'

# After
format:
  tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'
         | 'FIGMA_SYNTAX_WEB' | 'FIGMA_SYNTAX_IOS' | 'FIGMA_SYNTAX_ANDROID'
# default unchanged: TOKEN
```

`DEFAULT_CONFIG.format.tokens` stays `'TOKEN'` — unchanged.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Append `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS`, `FIGMA_SYNTAX_ANDROID` to `#/definitions/Config/.../tokens.enum` | MINOR |

**Example — new shape** (`schema/component.schema.json`, `#/definitions/Config` → `format.tokens`):
```yaml
tokens:
  type: string
  enum:
    - TOKEN
    - TOKEN_NAME
    - TOKEN_FIGMA_EXTENSIONS
    - FIGMA_NAME
    - CUSTOM
    - FIGMA_SYNTAX_WEB       # new
    - FIGMA_SYNTAX_IOS       # new
    - FIGMA_SYNTAX_ANDROID   # new
  default: TOKEN
  description: >
    Token reference serialization profile. Optional; defaults to TOKEN.
    FIGMA_SYNTAX_WEB | _IOS | _ANDROID emit the platform's Figma codeSyntax,
    falling back to TOKEN output when the platform has no code syntax defined.
```

### Notes

- Member naming uses `FIGMA_SYNTAX_<PLATFORM>` in `SCREAMING_CASE`, matching the
  existing `TOKEN_FIGMA_EXTENSIONS` / `FIGMA_NAME` members and citing
  Constitution VI Rule 3 (Figma-owned `codeSyntax` concept).
- `IOS` follows Figma's `iOS` platform key, upper-cased to fit the enum casing
  convention; `WEB` and `ANDROID` match Figma's keys directly.
- The empty-code-syntax fall-back is a transformer behaviour, kept out of the
  schema to honour Constitution II.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — identical three members added to the `format.tokens` union
  in `Config.ts` (two interfaces) and to the `tokens.enum` array in
  `component.schema.json`.
- **Parity check**: `Config.format.tokens` ↔ `#/definitions/Config/properties/format/properties/tokens/enum`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-schema` | Enum widened; additive `MINOR`-class change | Fold into the in-progress unreleased `0.21.0`, update CHANGELOG |
| `specs-from-figma` | Must read Figma `codeSyntax` per `CodeSyntaxPlatform` and project tokens for the three new profiles, with fall-back to `TOKEN` output | Implement the new projections; recompile against new types |
| `specs-cli` | Recompile; surface the new values as selectable token formats | Update config validation/help to accept the new enum values |
| `specs-plugin-2` | Recompile; expose the three platform profiles in plugin UI to reach Specs Classic `CODE_SYNTAX` parity | Add UI selection mapping to the new enum values |

---

## Semver Decision

**Version**: lands in the in-progress unreleased `0.21.0` (released baseline
`0.20.0 → 0.21.0`, `MINOR`). No separate bump — `package.json` is already at
`0.21.0` and this change folds into that release's `Unreleased` CHANGELOG scaffold.

**Justification**: Purely additive — three new optional enum members on an
existing optional field; no value removed or renamed and the default is
unchanged. Per Constitution Versioning, additive type/schema changes are `MINOR`;
the 0.21.0 development cycle already carries that minor bump, so this ADR
contributes to it rather than opening a new version.

---

## Consequences

- Consumers can select platform-specific code-syntax token serialization
  (`WEB`, `iOS`, `ANDROID`), bringing Spectacular to parity with Specs Classic's
  `CODE_SYNTAX` feature.
- Tokens without a defined code syntax for the chosen platform degrade gracefully
  to the existing `TOKEN` output, so the profiles are always safe to select.
- Tools validating against `component.schema.json` must adopt `0.21.0` to accept
  the new values.
- The transformer (`specs-from-figma`) becomes the owner of the documented
  fall-back semantics; this ADR does not add logic to `specs-schema`.
