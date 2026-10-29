/**
 * SemVer rules as data — the authored tables of semver-rules.md compiled to YAML.
 *
 * This module is the packaged form of the rules file. The CLI ships as a single
 * esbuild bundle with no asset-copy step, so the YAML travels as a string constant
 * and is parsed at load time; the classifier engine (rules.ts) reads it and knows
 * nothing about what any rule means — the premerge-rules.yaml division of labor.
 * An external rules file can override this via --rules on any version subcommand.
 *
 * Match fields, all optional — a rule with none matches everything:
 *   concern    api | variants | examples | assets | run | component  (string or list)
 *   operation  added | removed | modified | renamed | reordered      (string or list)
 *   path       regular expression tested against the entry path
 *   flag       semantic fact(s) the diff engine stamped on the entry; every listed
 *              flag must be present
 *
 * The shape most rules take: a component's contract is the set of things code
 * looks up by name or programs against — a part, a property, and the attributes
 * that say what each accepts. Stating one for the first time is additive;
 * changing what it says, or withdrawing it, breaks whoever relied on it. So an
 * attribute pairs an `operation: added` rule at minor with a broad rule at
 * major. Everything else a spec carries — descriptions, examples, provenance,
 * and the whole of variants — is how the contract is manifested, and is patch.
 *
 * Grades: major (BREAKING) | minor (ADDITIVE) | patch (PATCH) | ignore (IGNORE).
 * First match wins, so order is the whole design: specific paths come before the
 * broad ones that would swallow them. An entry no rule matches is `unclassified`
 * and surfaces in the report's Needs-review section, never silently graded.
 *
 * `(?:subcomponents\\.[^.\\[]+\\.)*` lets one rule serve a component and its
 * subcomponents, which mirror the parent's shape exactly.
 */

export const SEMVER_RULES_YAML = String.raw`
rules:
  # ---- whole components ---------------------------------------------------
  # A component can leave the specs without leaving the library: it is still in
  # Figma, but its dev status no longer qualifies it to be written out. The
  # effect on a consumer is the same as deletion, but the cause is a workflow
  # change, usually accidental, so it is worth saying which happened.
  - id: component-unpublished
    concern: component
    operation: removed
    flag: unpublished
    grade: major
    why: No longer published as a spec; still present in Figma, with a different dev status.

  - id: component-published
    concern: component
    operation: added
    flag: published
    grade: minor
    why: Published as a spec for the first time, following a dev status change.

  - id: component-removed
    concern: component
    operation: removed
    grade: major
    why: The component no longer exists in the library.

  - id: component-added
    concern: component
    operation: added
    grade: minor
    why: A new component is available.

  - id: component-renamed
    concern: component
    operation: renamed
    grade: major
    why: The component was renamed; the mapping is recorded in the rename ledger.

  # ---- per-concern metadata blocks (ignore/patch before anything broad) ------
  # Every concern file carries a metadata block; none of it is contract.
  - id: metadata-last-updated
    concern: [api, variants, examples]
    path: '(^|\.)metadata\.lastUpdated$'
    grade: ignore
    why: Always changes; never meaningful.

  - id: metadata-source-node-id
    concern: [api, variants, examples]
    path: '(^|\.)metadata\.source\.nodeId$'
    grade: ignore
    why: Origin update - the component was regenerated or moved in Figma; the spec is the source of truth.

  - id: metadata-source-provenance
    concern: [api, variants, examples]
    path: '(^|\.)metadata\.source\.(pageId|nodeType)$'
    grade: patch
    why: Provenance housekeeping.

  - id: metadata-other
    concern: [api, variants, examples]
    path: '(^|\.)metadata(\.|$)'
    grade: ignore
    why: Document metadata, not contract.

  # ---- api: title -----------------------------------------------------------
  # A title edit is content: it says the same component differently. It is not
  # free of consequence — the title is what the component name and its spec
  # folder are derived from — so it still has to be recorded in
  # versions/renames.yaml, and an untracked one fails a cut. A rename recorded
  # there is an identity move, and grades with the other identity rules above.
  - id: title-renamed
    concern: api
    operation: renamed
    path: '(^|\.)title$'
    grade: major
    why: The component title changed - a rename event recorded in the rename ledger.

  - id: title-changed
    concern: api
    path: '(^|\.)title$'
    grade: patch
    why: The component title changed; it must also be recorded in versions/renames.yaml.

  # ---- api: anatomy ----------------------------------------------------------
  # A part's name, its type, its binding and its behavior are all things code
  # depends on, and they all move the same way: stating one for the first time is
  # additive, losing it or changing what it says breaks whoever relied on it.
  - id: anatomy-type-added
    concern: api
    operation: added
    path: '(^|\.)anatomy\.[^.\[]+\.type$'
    grade: minor
    why: The element states its type for the first time.

  - id: anatomy-type-changed
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.type$'
    grade: major
    why: The element type changed or was withdrawn; expected structure changes.

  - id: anatomy-instanceof-added
    concern: api
    operation: added
    path: '(^|\.)anatomy\.[^.\[]+\.instanceOf$'
    grade: minor
    why: The element states the subcomponent it instantiates for the first time.

  - id: anatomy-instanceof-changed
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.instanceOf$'
    grade: major
    why: The element is an instance of a different subcomponent, or no longer declares one.

  - id: anatomy-role-added
    concern: api
    operation: added
    path: '(^|\.)anatomy\.[^.\[]+\.role$'
    grade: minor
    why: A new behavior contract, additive.

  - id: anatomy-role-changed
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.role$'
    grade: major
    why: The behavior/a11y contract changed or was withdrawn.

  - id: anatomy-actions-added
    concern: api
    operation: added
    path: '(^|\.)anatomy\.[^.\[]+\.actions$'
    grade: minor
    why: Additive behavior.

  - id: anatomy-actions-changed
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.actions$'
    grade: major
    why: Consumers wiring the action break.

  - id: anatomy-detected-in
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.detectedIn$'
    grade: patch
    why: Informational annotation.

  - id: anatomy-extensions
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.\$extensions'
    grade: patch
    why: Tool provenance, not contract.

  - id: anatomy-element-added
    concern: api
    operation: added
    path: '(^|\.)anatomy\.[^.\[]+$'
    grade: minor
    why: A named part was added; consumers may ignore it.

  - id: anatomy-element-removed
    concern: api
    operation: removed
    path: '(^|\.)anatomy\.[^.\[]+$'
    grade: major
    why: Code targeting the element breaks.

  # Anything else a part says about itself is description, not contract.
  - id: anatomy-element-detail
    concern: api
    path: '(^|\.)anatomy\.[^.\[]+\.[^.\[]+'
    grade: patch
    why: Descriptive content on a named part, not the part itself.

  # ---- api: props -------------------------------------------------------------
  # A property arriving is additive whether or not it has a default: nothing that
  # compiled before stops compiling because a new one exists.
  - id: prop-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+$'
    grade: minor
    why: A property was added.

  - id: prop-removed
    concern: api
    operation: removed
    path: '(^|\.)props\.[^.\[]+$'
    grade: major
    why: A property was removed.

  - id: prop-renamed
    concern: api
    operation: renamed
    path: '(^|\.)props\.[^.\[]+$'
    grade: major
    why: The property was renamed; the mapping is recorded in the rename ledger.

  # ---- api: object-prop members (ADR-111) --------------------------------------
  # A member is API surface exactly as a prop is: one arriving is additive, one
  # removed or renamed breaks every consumer addressing it. The per-attribute
  # rules below each admit an optional members segment for the same reason.
  - id: prop-member-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+\.members\.[^.\[]+$'
    grade: minor
    why: An object member was added; additive surface.

  - id: prop-member-removed
    concern: api
    operation: removed
    path: '(^|\.)props\.[^.\[]+\.members\.[^.\[]+$'
    grade: major
    why: An object member was removed; code addressing it breaks.

  - id: prop-member-renamed
    concern: api
    operation: renamed
    path: '(^|\.)props\.[^.\[]+\.members\.[^.\[]+$'
    grade: major
    why: The member was renamed; the mapping is recorded in the rename ledger.

  # ---- api: the attributes a consumer programs against ------------------------
  # type, default, nullable, anyOf, minItems, maxItems and the enum: each is
  # stated for the first time (additive) or changed and withdrawn (breaking).
  # A prop's type arrives with the prop itself, so a type added is part of that
  # same additive event rather than a second one.
  - id: prop-type-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.type$'
    grade: minor
    why: The property states its type, arriving with the property itself.

  - id: prop-type-changed
    concern: api
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.type$'
    grade: major
    why: Type expectations break.

  - id: prop-default-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.default$'
    grade: minor
    why: The property gained a default and became optional; the contract loosened.

  - id: prop-default-changed
    concern: api
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.default$'
    grade: major
    why: The default changed or was withdrawn - a silent behavior change, or a property that is now required.

  - id: prop-nullable-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.nullable$'
    grade: minor
    why: The property states its nullability for the first time.

  - id: prop-nullable-changed
    concern: api
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.nullable$'
    grade: major
    why: What the property accepts as empty changed.

  - id: prop-bounds-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+\.(minItems|maxItems|minChildren|maxChildren)$'
    grade: minor
    why: The property states how many children it accepts for the first time.

  - id: prop-bounds-changed
    concern: api
    path: '(^|\.)props\.[^.\[]+\.(minItems|maxItems|minChildren|maxChildren)$'
    grade: major
    why: How many children the property accepts changed or is no longer stated.

  - id: enum-value-renamed
    concern: api
    operation: renamed
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.enum$'
    grade: major
    why: The enum value was renamed; the mapping is recorded in the rename ledger.

  - id: enum-value-added
    concern: api
    operation: added
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.enum$'
    grade: minor
    why: A new accepted value; existing code is unaffected.

  - id: enum-value-removed
    concern: api
    operation: removed
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.enum$'
    grade: major
    why: Code using the value breaks.

  - id: enum-reordered
    concern: api
    operation: reordered
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.enum$'
    grade: patch
    why: Order is presentational.

  # anyOf is the slot's stated set of permitted component types. Losing it is a
  # contract change even though the slot technically accepts more afterwards:
  # nothing downstream can still tell what belongs in the slot.
  #
  # TEMPORARILY IGNORED. anyOf is not authored: the engine derives it by
  # resolving a slot's preferredValues keys against the components the fetched
  # file reports. A branch file reports different keys for nearly all of its
  # components while the slot still points at the parent file's keys, so the
  # list silently shrinks on the branch side and every comparison reports a
  # break nobody made. Ignoring it here removes a finding that says nothing
  # about the change under review. The rules below return once the key
  # resolution is fixed and the two sides can be compared honestly.
  - id: slot-anyof-derived
    concern: api
    path: '(^|\.)props\.[^.\[]+\.anyOf'
    grade: ignore
    why: Derived from key resolution that does not survive a branch; not comparable across two files.

  # - id: slot-anyof-added
  #   concern: api
  #   operation: added
  #   path: '(^|\.)props\.[^.\[]+\.anyOf'
  #   grade: minor
  #   why: The slot now states which component types it accepts.
  #
  # - id: slot-anyof-changed
  #   concern: api
  #   path: '(^|\.)props\.[^.\[]+\.anyOf'
  #   grade: major
  #   why: The set of component types the slot accepts changed, or is no longer stated.

  # ---- api: props, everything else --------------------------------------------
  - id: prop-examples
    concern: api
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.examples'
    grade: patch
    why: Documentation, not contract.

  - id: prop-extensions
    concern: api
    path: '(^|\.)props\.[^.\[]+(\.members\.[^.\[]+)?\.\$extensions'
    grade: patch
    why: Figma provenance; consumers never see it.

  # Description and anything else a property says about itself. Last of the prop
  # rules, so it only ever catches what the attributes above did not name.
  - id: prop-detail
    concern: api
    path: '(^|\.)props\.[^.\[]+\.[^.\[]+'
    grade: patch
    why: Descriptive content on a property, not the contract.

  # ---- api: subcomponents (whole-subcomponent add/remove) ---------------------
  - id: subcomponent-added
    concern: api
    operation: added
    path: '(^|\.)subcomponents\.[^.\[]+$'
    grade: minor
    why: Additive surface.

  - id: subcomponent-removed
    concern: api
    operation: removed
    path: '(^|\.)subcomponents\.[^.\[]+$'
    grade: major
    why: Anything referencing it breaks.

  # ---- api: invalid prop combinations -----------------------------------------
  - id: combination-disallowed
    concern: api
    operation: added
    path: '(^|\.)invalidPropCombinations$'
    grade: minor
    why: The component now states a combination it does not support.

  - id: combination-changed
    concern: api
    path: '(^|\.)invalidPropCombinations$'
    grade: major
    why: Which combinations are unsupported changed, or is no longer stated.

  # ---- run metadata (latest.metadata.yaml, diffed once per run) ----------------
  - id: schema-version-major
    concern: run
    flag: schemaMajor
    path: '(^|\.)schema\.version$'
    grade: major
    why: The spec now speaks a different schema dialect; consumers' parsers may break.

  - id: schema-version
    concern: run
    path: '(^|\.)schema\.version$'
    grade: patch
    why: Backward-compatible schema upgrade.

  - id: generator-version
    concern: run
    path: '(^|\.)generator\.version$'
    grade: patch
    why: Tooling upgrade, not a component change.

  - id: run-other
    concern: run
    grade: ignore
    why: Conventions and settings effects surface as spec diffs and are classified there; diffing them directly double-counts.

  # ---- variants: everything PATCH, reorders surfaced separately ---------------
  - id: variant-reordered
    concern: variants
    operation: reordered
    grade: ignore
    why: The variant changed position relative to the variants around it; nothing else moved.

  - id: variants-all
    concern: variants
    grade: patch
    why: Manifestation, not contract - styling, layout, and bindings are PATCH by design.

  # ---- examples and images concerns: PATCH at every path -----------------------
  - id: examples-all
    concern: examples
    grade: patch
    why: Illustrations of the contract, not the contract.

  # ---- assets -------------------------------------------------------------------
  - id: asset-added
    concern: assets
    operation: added
    grade: minor
    why: New referenceable content.

  - id: asset-removed-referenced
    concern: assets
    operation: removed
    flag: referenced
    grade: major
    why: A spec still references this asset - a broken reference; the run should fail rather than merely bump.

  - id: asset-removed
    concern: assets
    operation: removed
    grade: patch
    why: Unreferenced cleanup.

  - id: asset-changed
    concern: assets
    grade: patch
    why: Manifestation - same name, new content.
`;
