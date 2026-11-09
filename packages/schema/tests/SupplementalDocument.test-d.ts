/**
 * Type-level tests for the supplemental sidecar (ADR-118).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 *
 * The shared sidecar vocabulary — `ComponentConcern`, `Platform`, `CheckedBy`,
 * `Pointer`, `SidecarMeta` — is exercised here and in `GuidelinesDocument`,
 * which is why it has no test file of its own.
 */
import type {
  CheckedBy,
  ComponentConcern,
  FoundationConcern,
  Platform,
  Pointer,
  SchemaGap,
  SidecarMeta,
  SidecarStatus,
  SupplementalDocument,
  SupplementalEntry,
} from '../types/index.js';

const gap: SchemaGap = {
  path: 'styles.schema.json#/definitions/Styles',
  need: 'the property set carries no transition, duration or easing key',
};

/** A gap in the library's own data rather than in a schema — `path` admits both. */
const dataGap: SchemaGap = {
  path: 'analysis/foundations.yaml',
  need: 'the library publishes no duration or easing token to reference',
};

const entry: SupplementalEntry = {
  intent: 'The hover background fades from transparent to opaque over 160ms.',
  schemaGap: gap,
  platforms: ['react', 'webcomponents'],
  checkedBy: 'manual',
};

/** `platforms` absent means every platform; `checks` pairs with `automated`. */
const checked: SupplementalEntry = {
  intent: 'No transition exceeds 1ms under prefers-reduced-motion.',
  schemaGap: dataGap,
  checkedBy: 'automated',
  checks: [{ to: 'tests/motion.test.ts' }, { href: 'https://example.test/lint-rule' }],
};

const meta: SidecarMeta = {
  concern: 'button',
  status: 'proposed',
  author: 'Nathan Curtis',
  updated: '2026-11-09',
  sources: ['analysis/foundations.yaml'],
};

const document: SupplementalDocument = {
  meta,
  motion: [entry, checked],
  accessibility: [{ intent: 'Icon is hidden from assistive technology when unlabelled.', schemaGap: gap }],
  overrides: [{ intent: 'A caller may replace the leading glyph.', schemaGap: gap }],
  naming: [{ intent: 'The prop is accessibilityLabel, not ariaLabel.', schemaGap: gap }],
};

/** A document carrying only a header is valid. */
const headerOnly: SupplementalDocument = { meta: { status: 'ratified' } };

/** An empty document is valid — no concern key is required. */
const empty: SupplementalDocument = {};

// The group and the leaves are all members of the same set.
const group: Platform = 'web';
const native: Platform[] = ['ios', 'android'];

const concern: ComponentConcern = 'slotComposition';
const foundation: FoundationConcern = 'elevation';
const verification: CheckedBy = 'assisted';
const status: SidecarStatus = 'deprecated';
const pointer: Pointer = { to: 'DE Color/Alert/Error/Background' };

// @ts-expect-error — `intent` alone is not an entry; the gap is what keeps the file overlay-only.
const noGap: SupplementalEntry = { intent: 'Something the spec cannot carry.' };

// @ts-expect-error — `schemaGap` is an object, not the string the experimental contract used.
const stringGap: SupplementalEntry = { intent: 'x', schemaGap: 'styles.schema.json' };

// @ts-expect-error — `regenerationRisk` was removed; nothing replaces it as a prose field.
const dropped: SupplementalEntry = { intent: 'x', schemaGap: gap, regenerationRisk: 'medium' };

// @ts-expect-error — `platforms` is a list of platforms, not a map to an implementation path.
const pathMap: SupplementalEntry = { intent: 'x', schemaGap: gap, platforms: { react: 'component.tsx' } };

// @ts-expect-error — `guidelines` left this document for its own file.
const guidelinesKey: SupplementalDocument = { guidelines: [{ intent: 'x', schemaGap: gap }] };

// @ts-expect-error — `configurations` is not the concern name; the vocabulary kept `props`.
const renamedConcern: SupplementalDocument = { configurations: [{ intent: 'x', schemaGap: gap }] };

// @ts-expect-error — `swiftui` names a framework; the enum names emission targets.
const framework: Platform = 'swiftui';

export {
  document,
  headerOnly,
  empty,
  group,
  native,
  concern,
  foundation,
  verification,
  status,
  pointer,
  noGap,
  stringGap,
  dropped,
  pathMap,
  guidelinesKey,
  renamedConcern,
  framework,
};
