import { ElementType } from "./Element.js";

/**
 * Represents the anatomy of a component.
 */
export type Anatomy = Record<string, AnatomyElement>;

/**
 * Reference to an external element type definition.
 * Used when element types are linked to a foundations schema
 * rather than using plain string identifiers.
 */
export type ElementTypeRef = {
  /** URI reference to an external element type definition (e.g. "foundations#/definitions/glyph"). */
  $ref: string;
};

/**
 * Reference to a subcomponent definition within the same spec.
 * Used when an anatomy item or element is an instance of a sibling subcomponent.
 * @since 0.15.0
 */
export type SubcomponentRef = {
  /** JSON Pointer to a subcomponent (e.g. "#/subcomponents/formLabel"). */
  $ref: string;
};

/**
 * Figma extraction provenance for an anatomy element.
 * @since 0.28.0
 */
export interface FigmaAnatomyElementExtension {
  /**
   * The element's name in Figma. Recorded on any of three triggers:
   * - primitive-wrapper collapse promoted this element to root (ADR-058) — always,
   *   independent of `format.figmaKeys`;
   * - the name fell outside the safe key grammar, so `format.keys` could not
   *   represent it losslessly (ADR-066);
   * - the name was already written in the destination format and passed through
   *   unformatted, making reversal identity rather than re-derivation (ADR-066).
   *
   * Under NONE no source convention is declared, so nothing can be re-derived from
   * a key — reversal hands the key back as the name. The key therefore reconstructs
   * the name only where the two are already identical, and this field is recorded
   * wherever formatting changed the name at all.
   * @since 0.30.0 — renamed from `originalName`
   */
  name?: string;
  /**
   * A role annotated on the layer that primitive-wrapper collapse folded into this
   * element, rather than on the element itself.
   *
   * Collapse leaves one anatomy element where Figma has two layers, so a role has to
   * say which layer carried it. `role` means the root did, this means the collapsed
   * child did, and both present means both did. Render reads the pair to put each
   * annotation back on the layer it came from; without the distinction a round trip
   * silently moves it to the other layer.
   *
   * It is deliberately not merged into `role`. Merging would make the two-role case
   * indistinguishable from the child-only case, which is exactly the pair render has
   * to tell apart. The cost is that a role annotated on a collapsing component's child
   * reaches no emitted code — to affect code, annotate the component node.
   * @since 0.36.0
   */
  childRole?: RoleConceptName | RoleConceptName[];
}

/**
 * DTCG-style platform extensions for an anatomy element.
 * @since 0.28.0
 */
/**
 * Semantic behavior role for an anatomy element (ADR-066).
 *
 * An open string. The recognized vocabulary is documented here and grown by
 * vocabulary ADRs without a schema bump; transforms ignore unrecognized values,
 * so an unknown role is inert and emission falls through to current behavior.
 *
 * Roles are populated by `specs generate` from a Figma Dev Mode annotation on the
 * component node or one of its layers, of the form `role:<concept>` in the
 * annotation's label. `api.yaml` itself is never hand-edited, and there is no
 * authored surface to merge.
 *
 * Two kinds of concept, distinguished by how they resolve rather than how they
 * are spelled:
 *
 * **Control roles** name a control, landmark, or announcement region and resolve
 * on their own:
 * - Form controls (ADR-067): `textbox`, `password`, `searchbox`, `spinbutton`,
 *   `slider`, `checkbox`, `radio`, `textarea`, `switch`, `group`
 * - Interactive roots (ADR-068): `button`, `togglebutton`, `link`, `disclosure`
 * - Announcements (ADR-068): `alert`, `status`, `progressbar`
 *
 * **Part roles** name a constituent of some control and resolve against that
 * control: `value`, `placeholder`, `label`, `description`, `errormessage`,
 * `legend`, `panel`, `indicator`, `increment`, `decrement`. Each control concept
 * declares which parts it accepts.
 *
 * Naming scheme: single flat lowercase alphanumeric tokens — no hyphens,
 * underscores, dots, or internal casing. Part names are bare and scoped by their
 * control (`placeholder`, never `inputPlaceholder`). Tokens name interaction
 * semantics, not web markup, so each platform transform binds a concept to its
 * own idiom.
 *
 * @since 0.30.0
 */
export type RoleConceptName = string;

/**
 * A semantic behavior role concept, or a non-empty list of them.
 *
 * The named union behind `AnatomyElement.role` and
 * `FigmaAnatomyElementExtension.childRole`. The list form is meaningful only on
 * an element of type `instance` — see `AnatomyElement.role`.
 * @since 0.39.0
 */
export type ElementRole = RoleConceptName | RoleConceptName[];

/**
 * Behavior invoked when an element is activated (ADR-087).
 *
 * An open string, like `RoleConceptName`. The recognized vocabulary is published
 * on the docs site and grows without a schema release; transforms ignore values
 * they do not know, so a spec and a transform may disagree without breaking.
 *
 * A **role** answers what an element *is* — a noun naming a control kind a
 * platform has a counterpart for. An **action** answers what activating it
 * *does*. The test between them: does it change how the control is announced?
 * A `togglebutton` announces its pressed state, so it is a role. A dismiss
 * affordance announces as an ordinary button, so it is an action.
 *
 * Recognized concepts:
 * - `dismiss` — activating this element removes the component it belongs to
 *
 * On an element the component owns this is an emission signal. On an `instance`
 * it is a **routing** signal only: the instanced component keeps its own role and
 * renders its own control, and the composing component declares which of its
 * children carries the behavior.
 *
 * @since 0.32.0
 */
export type ActionConceptName = string;

/**
 * One behavior an element performs when activated (ADR-087).
 *
 * An object rather than a bare string so an action can carry its own properties
 * as the vocabulary grows — where focus moves after a dismissal, what a
 * navigation targets — without a second breaking change. Today only `type` is
 * defined.
 *
 * @since 0.32.0
 */
export interface ActionEntry {
  /** The behavior's concept name. */
  type: ActionConceptName;
}

export interface AnatomyElementExtensions {
  'com.figma'?: FigmaAnatomyElementExtension;
}

/**
 * Represents an element within the anatomy of a component.
 */
export type AnatomyElement = {
  /**
   * The mapped element type. Either a plain string identifier (e.g. "glyph", "text")
   * or an `ElementTypeRef` object referencing an external definition.
   */
  type: ElementType | ElementTypeRef;
  detectedIn?: string;
  /** The component or component set name that this instance element references, or a subcomponent reference. */
  instanceOf?: string | SubcomponentRef;
  /**
   * Semantic behavior role for this element (ADR-067), e.g. `button`, `checkbox`,
   * `label`. Generated from Figma Dev Mode annotations of the form `role:<concept>`
   * on the component node or one of its layers.
   * Absence means no role — transforms behave exactly as they do today.
   *
   * An array is meaningful only on an element of type `instance`, where a role is a
   * *routing* signal rather than an emission one: the composed component may provide
   * several parts, and each named concept routes to whichever of its elements
   * ascribes that concept. On an element the component owns a role is an emission
   * signal, and more than one is an error — the question of what an element *is* has
   * one answer.
   *
   * The array form is what lets a composed component contribute more than one
   * wireable part. Without it an instance carries one role, so a component providing
   * both a label and a description can only ever have one of them wired.
   * @since 0.32.0
   */
  role?: RoleConceptName | RoleConceptName[];
  /**
   * Behaviors invoked when this element is activated (ADR-087), e.g. `dismiss`.
   * Generated from Dev Mode annotations of the form `action:<concept>`.
   *
   * An array because an element may reasonably perform more than one thing, and
   * because each entry can grow properties of its own. Absence means no behavior
   * — transforms behave exactly as they do today.
   * @since 0.32.0
   */
  actions?: ActionEntry[];
  /** Platform extensions; com.figma carries extraction provenance. */
  $extensions?: AnatomyElementExtensions;
};
