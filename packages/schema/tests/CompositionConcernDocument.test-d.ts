/**
 * Type-level tests for the composition concern documents (ADR-109).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  CompositionConcernDocument,
  CompositionApiDocument,
  CompositionVariantsDocument,
  CompositionExamplesDocument,
  Metadata,
} from '../types/index.js';

const source: Metadata['source'] = {
  pageId: '0:1',
  nodeId: '1:2',
  nodeType: 'FRAME',
};

const api: CompositionApiDocument = {
  metadata: { source, concern: 'api' },
  title: 'Filter Results Page',
  description: 'Search results with filter sidebar',
  anatomy: { root: { type: 'container' } },
};

const variants: CompositionVariantsDocument = {
  metadata: { source, concern: 'variants' },
  elements: {},
  layout: ['root'],
};

const examples: CompositionExamplesDocument = {
  metadata: { source, concern: 'examples' },
  slotContent: {
    pageHeader: { anatomy: { root: { type: 'container' } }, elements: {}, layout: ['root'] },
  },
};

// Each concern's keys belong to its own document — a composition has no
// default/variants layering, so an api document has no elements/layout to
// borrow, and a variants document has no anatomy or props to borrow.
const apiWithElements: CompositionApiDocument = {
  metadata: { source, concern: 'api' },
  anatomy: { root: { type: 'container' } },
  // @ts-expect-error — an api document has no elements
  elements: {},
};

const variantsWithAnatomy: CompositionVariantsDocument = {
  metadata: { source, concern: 'variants' },
  elements: {},
  layout: ['root'],
  // @ts-expect-error — a variants document has no anatomy
  anatomy: { root: { type: 'container' } },
};

const examplesWithProps: CompositionExamplesDocument = {
  metadata: { source, concern: 'examples' },
  // @ts-expect-error — compositions have no props at all
  props: {},
};

const mismatched: CompositionVariantsDocument = {
  // @ts-expect-error — the concern must match the document
  metadata: { source, concern: 'api' },
  elements: {},
  layout: ['root'],
};

// The union narrows on a key, not on `metadata.concern` — same rule as
// `ComponentConcernDocument` (ADR-091): the concern sits one level down under
// `metadata`, so TypeScript discriminates on a literal property of the
// member itself instead.
function slice(doc: CompositionConcernDocument): string {
  if ('anatomy' in doc) return 'api';
  if ('elements' in doc) return 'variants';
  return 'examples';
}

void api; void variants; void examples; void slice;
void apiWithElements; void variantsWithAnatomy; void examplesWithProps; void mismatched;
