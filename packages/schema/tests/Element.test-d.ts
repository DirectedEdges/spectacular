/**
 * Type-level tests for Element.content field.
 *
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type { Element, PropBinding, SubcomponentRef } from '../types/index.js';

// ─── Element.content accepts string | PropBinding ───────────────────────────

const contentString: Element = { content: 'Submit' };
const contentGlyph: Element = { content: 'caret-down' };
const contentBound: Element = { content: { $binding: '#/props/label' } };

// ─── Element.instanceOf accepts string | PropBinding | SubcomponentRef ──────

const instanceString: Element = { instanceOf: 'Button' };
const instanceBound: Element = { instanceOf: { $binding: '#/props/icon' } };
const instanceSubRef: Element = { instanceOf: { $ref: '#/subcomponents/formLabel' } };

// content is optional — empty element is valid
const emptyElement: Element = {};

// Old { $ref } shape must NOT compile as Element.content
// @ts-expect-error: { $ref } is not valid for content
const _oldContent: Element = { content: { $ref: '#/props/label' } };

// ─── Element.text has been removed ──────────────────────────────────────────

// @ts-expect-error: text property no longer exists on Element
const _removedText: Element = { text: 'Submit' };

// ─── Capture provenance for a promoted element (ADR-084) ──────────────────────

// A promoted layer records that it was promoted, and the styles the promotion consumed
const promoted: Element = {
  instanceOf: 'dsTypography',
  propConfigurations: { color: 'On surface', size: 400 },
  styles: { layoutSizingHorizontal: 'FILL' },
  $extensions: {
    'com.figma': {
      promotedPrimitive: true,
      multipleMatches: true,
      styles: { textColor: { $token: 'Color/On surface', $type: 'color' } },
    },
  },
};

// Both members are independent: a promotion that consumed no styles records the flag alone
const promotedNoResidue: Element = {
  instanceOf: 'dsIcon',
  propConfigurations: { name: 'add' },
  $extensions: { 'com.figma': { promotedPrimitive: true } },
};

// A promoted container records the hoisted fill it held, beside the consumed styles (ADR-090)
const promotedContainer: Element = {
  instanceOf: 'dsLayout',
  propConfigurations: {
    direction: 'VERTICAL',
    children: { $slotContent: '#/components/dsCard/slotContentExamples/dsCard__content__children' },
  },
  $extensions: {
    'com.figma': {
      promotedPrimitive: true,
      children: { $slotContent: '#/components/dsCard/slotContentExamples/dsCard__content__children' },
      styles: { layoutMode: 'VERTICAL' },
    },
  },
};

const inlineExtensionChildren: Element = {
  // @ts-expect-error — the extension's children is a SlotContentRef, never inline content
  $extensions: { 'com.figma': { children: ['label'] } },
};

// @ts-expect-error — the extension namespace is closed
const unknownNamespace: Element = { $extensions: { 'com.example': { promotedPrimitive: true } } };

// @ts-expect-error — the figma extension is closed to its two members
const unknownMember: Element = { $extensions: { 'com.figma': { promotedFrom: 'text' } } };

// ─── Element.contentStyles — per-primitive formatting for a slot (ADR-102) ────

// A slot element carries its own styles and, separately, the formatting each primitive
// kind filling it takes on
const slotWithContentStyles: Element = {
  styles: { padding: 8, mainAxisAlignment: 'CENTER' },
  contentStyles: {
    $text: {
      typography: { $token: 'DS Type.Label.Medium', $type: 'typography' },
      textColor: { $token: 'DS Color.Text.OnPrimary', $type: 'color' },
    },
    $glyph: {
      fillColor: { $token: 'DS Color.Icon.OnPrimary', $type: 'color' },
    },
  },
};

// Either kind alone is valid — a text-only slot records only $text
const textOnlyContent: Element = {
  contentStyles: { $text: { textColor: '#FFFFFF', maxLines: 1 } },
};
const glyphOnlyContent: Element = { contentStyles: { $glyph: { fillColor: '#FFFFFF' } } };

// contentStyles is optional, and empty blocks at either level are valid
const emptyContentStyles: Element = { contentStyles: {} };
const emptyKindBlock: Element = { contentStyles: { $text: {} } };

// A per-variant override carries only what changes, per kind
const variantOverride: Element = {
  contentStyles: {
    $text: { textColor: { $token: 'DS Color.Text.Subtle', $type: 'color' } },
    $glyph: { fillColor: { $token: 'DS Color.Icon.Subtle', $type: 'color' } },
  },
};

// The keys are the marker vocabulary — nothing else
// @ts-expect-error: $image is not a primitive marker
const _unknownKind: Element = { contentStyles: { $image: { fillColor: '#FF0000' } } };

// @ts-expect-error: the sigil is part of the key
const _bareKindKey: Element = { contentStyles: { text: { textColor: '#FFFFFF' } } };

// Properties cannot be written at the top level — they belong under a kind
// @ts-expect-error: contentStyles is keyed by primitive, not a flat style block
const _flatBlock: Element = { contentStyles: { textColor: '#FFFFFF' } };

// Each kind's set is closed — a container's own styling cannot enter either
// @ts-expect-error: padding is not a content-formatting property
const _paddingInText: Element = { contentStyles: { $text: { padding: 8 } } };

// @ts-expect-error: backgroundColor is not a content-formatting property
const _backgroundInText: Element = { contentStyles: { $text: { backgroundColor: '#FF0000' } } };

// A glyph carries its own dimensions — it is sized, not laid out
const glyphSized: Element = {
  contentStyles: {
    $glyph: {
      fillColor: { $token: 'DS Color.Icon.OnPrimary', $type: 'color' },
      width: { $token: 'DS Size.Icon.Small', $type: 'dimension' },
      height: { $token: 'DS Size.Icon.Small', $type: 'dimension' },
    },
  },
};

// Text properties do not format a glyph
// @ts-expect-error: typography is not a glyph content-formatting property
const _typographyInGlyph: Element = { contentStyles: { $glyph: { typography: { fontSize: 14 } } } };

// @ts-expect-error: maxLines is not a glyph content-formatting property
const _maxLinesInGlyph: Element = { contentStyles: { $glyph: { maxLines: 1 } } };

// ...and the glyph members do not apply to text. A text run's measure comes from its
// container, so width is a glyph member and must not be a text one — the asymmetry only
// the keyed shape can express
// @ts-expect-error: fillColor is not a text content-formatting property
const _fillInText: Element = { contentStyles: { $text: { fillColor: '#FF0000' } } };

// @ts-expect-error: width is not a text content-formatting property
const _widthInText: Element = { contentStyles: { $text: { width: 100 } } };
