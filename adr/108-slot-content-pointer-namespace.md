# ADR: The `$slotContent` Pointer Namespace

**Branch**: `108-slot-content-pointer-namespace` *(drafted on `feat/writing-specs`)*
**Created**: 2026-10-16
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; narrows ADR-046's declared pointer surface)*

---

## Context

`SlotContentRef` (ADR-046) declares three pointer targets: a `Component.slotContentExamples` entry, a `Composition` entry (top-level triplet), and a `Composition.slotContent` entry. Reality diverged two ways:

- **Generated data uses one grammar for everything.** Every fill pointer in captured catalogs — including a composition addressing its *own* `slotContentExamples` — is `#/components/<spec folder key>/slotContentExamples/<name>`, optionally with `/subcomponents/<sub>/` before `slotContentExamples`. The `components` segment names the whole spec-key space, not the components directory.
- **No consumer resolves the `#/compositions/…` forms.** The React emitter's resolver accepts exactly the two `#/components/…` shapes and nothing else; the render path round-trips the same generated data. The declared composition forms are schema text with no implementation behind them.

Two further frictions ride on this: the `components` segment is a misleading name for a kind-spanning namespace, and ADR-096 makes a component and a composition legally able to share a folder key — which a flat pointer namespace cannot disambiguate (today's consumers resolve components first, by accident of iteration order rather than decision).

`specs validate`, the authoring rules, and the `SlotContentRef` docs page were aligned to the observed grammar on `feat/writing-specs` (2026-10-16); this ADR decides whether the schema's declared surface follows.

---

## Decision Drivers

- **Declared = implemented**: the schema should not document pointer forms nothing resolves; an author following the docs must produce data that works.
- **Existing data stays valid**: every captured catalog uses the `#/components/…` grammar; it must not need migration.
- **One grammar to teach**: authoring agents and validators should carry a single pointer rule.
- **The key-collision corner needs an owner**: shared component/composition keys are legal; resolution must be defined somewhere, not emergent.

---

## Options Considered

### Decision 1 — The `#/compositions/…` pointer forms

#### Option A: Retire them *(Selected)*

Remove the `Composition` entry and `Composition.slotContent` targets from `SlotContentRef`'s description and the docs; the two `#/components/…` forms become the complete declared grammar.

**Pros**:
- Declared surface equals implemented surface; the docs' resolution table stops describing fiction.
- Zero data migration; validator and rules already enforce exactly this.

**Cons / Trade-offs**:
- A future "reference a composition's whole triplet as a fill" capability would need a new ADR to reintroduce a form — which is the correct cost, since it also needs a resolver.

#### Option B: Implement them *(Rejected)*

**Rejected because**: no producer emits them and no consumer needs them — compositions' own fills already work through the `#/components/…` form. Implementing adds resolver surface to every consumer for a capability with no demonstrated use, inverting declared-follows-implemented into implemented-follows-declared.

### Decision 2 — The `components` segment naming a kind-spanning namespace

#### Option A: Keep the spelling, document the semantics *(Selected)*

`components` stays, with the schema description and docs stating plainly that the segment names the flat spec-key space — both kinds, own-fills included.

**Pros**:
- No data migration, no dual-read window; the confusion is curable with one sentence, and that sentence now exists in the docs and rules.

**Cons / Trade-offs**:
- The misleading name persists until a MAJOR. A kind-neutral segment (e.g. `specs`) is recorded as the preferred spelling if a breaking pointer revision ever happens for other reasons; it does not justify one alone.

#### Option B: Introduce a kind-neutral segment now with a legacy alias *(Rejected)*

**Rejected because**: two accepted spellings for one reference multiplies every consumer's resolver and every author's choices, for purely cosmetic gain.

### Decision 3 — Component/composition folder-key collisions

#### Option A: Components win, stated as the rule *(Selected)*

When one key names both a component and a composition, `#/components/<key>/…` resolves to the **component**. A composition sharing a key with a component therefore cannot be the target of cross-spec fill pointers (its own internal fills still resolve, since self-reference is resolved before the workspace lookup).

**Pros**:
- Matches what every consumer already does; turns accident into contract.
- No new vocabulary; the constraint lands only on the rare colliding composition.

**Cons / Trade-offs**:
- The constraint is a rule to know rather than a shape the schema can enforce; `specs validate` carries the check.

#### Option B: Forbid key collisions for specs that declare `slotContentExamples` *(Rejected)*

**Rejected because**: it retroactively invalidates a legal ADR-096 state to patch a corner that precedence resolves adequately.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `SlotContentRef.ts` | Description narrowed: the two `#/components/…` forms are the grammar; the segment names the spec-key space; components-win precedence stated | PATCH |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | `#/definitions/SlotContentRef` description narrowed to match; no shape change (`$slotContent` stays a string) | PATCH |

**The complete grammar after this ADR:**
```yaml
$slotContent: "#/components/<spec folder key>/slotContentExamples/<name>"
$slotContent: "#/components/<spec folder key>/subcomponents/<sub>/slotContentExamples/<name>"
```

### Notes

Docs (`schema/slot-content-ref.md`) drop the two composition rows from the resolution table and keep the spec-key-space statement already added. The `Composition.slotContent` *storage* field is untouched by this ADR — only the pointer forms into it retire; whether that field itself remains is a separate question for a composition-format ADR if evidence appears.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — descriptions narrow in both; no structural change on either side.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | `specs validate` already enforces the narrowed grammar and components-first resolution | None |
| `specs-from-figma` | Already emits only the `#/components/…` forms | None |
| `specs-plugin-2` | None | None |

---

## Semver Decision

**Target version**: `0.36.0` — the version of `release/next`, the branch this ADR merges into.

**Change class**: `PATCH` — description-only narrowing to the implemented behavior; no document that resolves today changes meaning, and no valid data is invalidated.

**Justification**: Removing never-implemented declared forms from prose is a documentation correction of the contract's description, not a contract change.

---

## Consequences

- The pointer grammar is one rule, taught once, enforced by the validator, true in the docs.
- Reintroducing composition-triplet fills requires a new ADR *with* a resolver — declared and implemented move together.
- Key-collision resolution is contract (components win), not iteration-order accident.
- The kind-neutral segment spelling is on record for a future MAJOR, unjustified on its own.
