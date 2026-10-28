/**
 * Type-level tests for Anatomy, AnatomyElement, and ElementTypeRef.
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type { Anatomy, AnatomyElement, ElementTypeRef, SubcomponentRef, RoleConceptName } from '../types/index.js';

// AnatomyElement.type accepts ElementType values
const textElement: AnatomyElement = { type: 'text' };
const glyphElement: AnatomyElement = { type: 'glyph' };
const vectorElement: AnatomyElement = { type: 'vector' };
const containerElement: AnatomyElement = { type: 'container' };
const slotElement: AnatomyElement = { type: 'slot' };
const instanceElement: AnatomyElement = { type: 'instance' };
const lineElement: AnatomyElement = { type: 'line' };
const ellipseElement: AnatomyElement = { type: 'ellipse' };
const rectangleElement: AnatomyElement = { type: 'rectangle' };
const polygonElement: AnatomyElement = { type: 'polygon' };
const starElement: AnatomyElement = { type: 'star' };

// @ts-expect-error — arbitrary strings are not valid ElementType values
const invalidType: AnatomyElement = { type: 'any-string-value' };

// AnatomyElement.type accepts ElementTypeRef objects
const refElement: AnatomyElement = {
  type: { $ref: 'foundations#/definitions/glyph' },
};
const refWithPath: AnatomyElement = {
  type: { $ref: 'https://example.com/schema#/definitions/container' },
};

// ElementTypeRef shape
const ref: ElementTypeRef = { $ref: 'foundations#/definitions/text' };

// @ts-expect-error — ElementTypeRef requires $ref field
const invalidRef: ElementTypeRef = {};

// @ts-expect-error — ElementTypeRef.$ref must be a string
const invalidRefType: ElementTypeRef = { $ref: 123 };

// AnatomyElement with optional fields and ref type
const fullRefElement: AnatomyElement = {
  type: { $ref: 'foundations#/definitions/glyph' },
  detectedIn: 'variant-1',
  instanceOf: 'IconGlyph',
};

// AnatomyElement with optional fields and plain string type
const fullStringElement: AnatomyElement = {
  type: 'instance',
  detectedIn: 'variant-1',
  instanceOf: 'Button',
};

// Anatomy is a record of named AnatomyElements — mix of string and ref types
const anatomy: Anatomy = {
  root: { type: 'container' },
  label: { type: 'text' },
  icon: { type: { $ref: 'foundations#/definitions/glyph' } },
};

// ─── SubcomponentRef ────────────────────────────────────────────────────────

// SubcomponentRef shape
const subRef: SubcomponentRef = { $ref: '#/subcomponents/formLabel' };

// @ts-expect-error — SubcomponentRef requires $ref field
const invalidSubRef: SubcomponentRef = {};

// @ts-expect-error — SubcomponentRef.$ref must be a string
const invalidSubRefType: SubcomponentRef = { $ref: 42 };

// AnatomyElement.instanceOf accepts SubcomponentRef
const subRefElement: AnatomyElement = {
  type: 'instance',
  instanceOf: { $ref: '#/subcomponents/formLabel' },
};

// AnatomyElement.instanceOf still accepts plain string
const stringInstanceOf: AnatomyElement = {
  type: 'instance',
  instanceOf: 'SomeComponent',
};

// Type guard discrimination works
const element: AnatomyElement = { type: 'glyph' };
if (typeof element.type === 'string') {
  const _str: string = element.type;
} else {
  const _ref: string = element.type.$ref;
}

// AnatomyElement.$extensions carries the Figma name (ADR-058 collapse, ADR-066 key divergence)
const collapsedRoot: AnatomyElement = {
  type: 'text',
  $extensions: { 'com.figma': { name: 'Text' } },
};

// ADR-066 — a key that could not represent its Figma name losslessly
const divergentKey: AnatomyElement = {
  type: 'glyph',
  $extensions: { 'com.figma': { name: 'Cut & paste' } },
};

// name is optional — safe keys emit no extension at all
const safeKey: AnatomyElement = { type: 'text' };

// A collapsed root records which of its two Figma layers each role came from
const childRoleOnly: AnatomyElement = {
  type: 'text',
  $extensions: { 'com.figma': { name: 'Link', childRole: 'link' } },
};
const bothRoles: AnatomyElement = {
  type: 'text',
  role: 'link',
  $extensions: { 'com.figma': { name: 'Link', childRole: 'link' } },
};
const childRoleArray: AnatomyElement = {
  type: 'text',
  $extensions: { 'com.figma': { childRole: ['label', 'description'] } },
};

const badExtension: AnatomyElement = {
  type: 'text',
  // @ts-expect-error — unknown extension members are rejected
  $extensions: { 'com.figma': { layerName: 'Text' } },
};

const renamedExtension: AnatomyElement = {
  type: 'text',
  // @ts-expect-error — originalName was renamed to name in 0.30.0 (ADR-066)
  $extensions: { 'com.figma': { originalName: 'Text' } },
};

// ─── Element behavior roles (ADR-067) ─────────────────────────────────────────

// role is optional and open — the vocabulary grows in the docs, not the schema
const roledElement: AnatomyElement = { type: 'container', role: 'button' };
const partRoled: AnatomyElement = { type: 'text', role: 'label' };

// An unrecognized concept still type-checks: transforms ignore what they do not know
const unknownRole: AnatomyElement = { type: 'container', role: 'carousel' };

// Absence is the default — no role, today's behavior
const unroled: AnatomyElement = { type: 'container' };

const roleAlias: RoleConceptName = 'togglebutton';

export { roledElement, partRoled, unknownRole, unroled, roleAlias };
