/**
 * Type-level tests for the concern documents (ADR-091).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  ComponentConcernDocument,
  ComponentApiDocument,
  ComponentVariantsDocument,
  ComponentExamplesDocument,
  Metadata,
} from '../types/index.js';

const source: Metadata['source'] = {
  pageId: '0:1',
  nodeId: '1:2',
  nodeType: 'COMPONENT',
};

const api: ComponentApiDocument = {
  metadata: { source, concern: 'api' },
  title: 'DE Favorite button',
  anatomy: { root: { type: 'container' } },
  props: {},
  invalidPropCombinations: [{ disabled: true, state: 'Hover' }],
  subcomponents: {
    icon: { title: 'Icon', anatomy: { root: { type: 'glyph' } }, props: {} },
  },
};

const variants: ComponentVariantsDocument = {
  metadata: { source, concern: 'variants' },
  default: { elements: {} },
  variants: [],
};

const examples: ComponentExamplesDocument = {
  metadata: { source, concern: 'examples' },
};

// Each concern's keys belong to its own document — this is the leak the
// shapes exist to close.
const variantsWithAnatomy: ComponentVariantsDocument = {
  metadata: { source, concern: 'variants' },
  default: { elements: {} },
  variants: [],
  // @ts-expect-error — a variants document has no anatomy
  anatomy: { root: { type: 'container' } },
};

const variantsWithInvalidCombinations: ComponentVariantsDocument = {
  metadata: { source, concern: 'variants' },
  default: { elements: {} },
  variants: [],
  // @ts-expect-error — invalid prop combinations are api contract, not variants (ADR-092)
  invalidPropCombinations: [{ disabled: true }],
};

const apiWithDefault: ComponentApiDocument = {
  metadata: { source, concern: 'api' },
  title: 'DE Favorite button',
  anatomy: { root: { type: 'container' } },
  props: {},
  // @ts-expect-error — an api document has no default block
  default: { elements: {} },
};

const mismatched: ComponentVariantsDocument = {
  // @ts-expect-error — the concern must match the document
  metadata: { source, concern: 'api' },
  default: { elements: {} },
  variants: [],
};

// The union narrows on a key, not on `metadata.concern`: TypeScript
// discriminates only on a literal property of the union member itself, and the
// concern sits one level down under `metadata`. The schema discriminates on
// `concern`; a TypeScript consumer reaches the same place through the keys.
function slice(doc: ComponentConcernDocument): string {
  if ('title' in doc) return doc.title;
  if ('variants' in doc) return String(doc.variants.length);
  return 'examples';
}

void api; void variants; void examples; void slice;
void variantsWithAnatomy; void variantsWithInvalidCombinations;
void apiWithDefault; void mismatched;
