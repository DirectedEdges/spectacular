// Formatting a slot's primitive content from its `contentStyles` (ADR-102).
//
// Under `inferComposableSlots` the primitive children leave anatomy, so the
// slot element's `contentStyles` is the only carrier of the label's typography
// and the glyph's fill. These tests pin where each property lands per tree —
// inherited text on the slot element, glyph box/fill on the emitters'
// masked-span vocabulary — and that variant overlays ride the per-variant
// blocks important enough to beat the inline defaults the emitters write.
//
// The fixture shape models a real badge spec: a slot whose `anyOf` mixes
// `$glyph` with components, a default `contentStyles.$glyph` with token-bound
// fillColor/width and a literal height, and variants restating only fillColor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { CssTransformer } from '../../../../src/transforms/Css.js';

const transformer = new CssTransformer();

function makeContext(dir: string, componentKey: string) {
  return {
    specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir,
    kind: 'component' as const, componentKey, tokensFormat: 'TOKEN', outputFormat: 'JSON' as const,
  };
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function run(
  dir: string,
  variantsData: Record<string, unknown>,
  apiYaml: Record<string, unknown>,
  componentKey = 'dsBadge',
): Promise<{ react: string; host: string }> {
  await fs.writeFile(path.join(dir, 'variants.yaml'), yaml.stringify(variantsData), 'utf-8');
  await transformer.run(apiYaml, makeContext(dir, componentKey));
  const prefix = toPascalCase(componentKey);
  const react = await fs.readFile(
    path.join(dir, 'react', 'src', 'components', prefix, 'styles.css'), 'utf-8');
  const host = await fs.readFile(
    path.join(dir, 'webcomponents', 'src', 'components', prefix, 'host.css'), 'utf-8');
  return { react, host };
}

function colorToken(token: string) {
  return { $token: token, $type: 'color' };
}
function dimensionToken(token: string) {
  return { $token: token, $type: 'dimension' };
}

/** A glyph-accepting slot beside components, modeled on a real badge spec. */
function glyphSlotSpec(variants: Array<Record<string, unknown>> = []) {
  return {
    default: {
      layout: [{ root: ['children'] }],
      elements: {
        root: { styles: { layoutMode: 'HORIZONTAL' } },
        children: {
          children: { $binding: '#/props/children' },
          styles: { layoutMode: 'HORIZONTAL' },
          contentStyles: {
            $glyph: {
              fillColor: colorToken('Color/On surface'),
              width: dimensionToken('Constants/Sizing/4x'),
              height: 16,
            },
          },
        },
      },
    },
    variants,
  };
}

const glyphSlotApi = {
  anatomy: {
    root: { type: 'container' },
    children: { type: 'slot' },
  },
  props: {
    children: { type: 'slot', anyOf: ['$glyph', 'dsIcon', 'dsMark'] },
    emphasized: { type: 'boolean', default: false },
  },
};

/** A `$glyph`-only slot — admits no component, so the glyph rules may land. */
const glyphOnlyApi = {
  anatomy: {
    root: { type: 'container' },
    children: { type: 'slot' },
  },
  props: {
    children: { type: 'slot', anyOf: ['$glyph'] },
    emphasized: { type: 'boolean', default: false },
  },
};

describe('slot contentStyles (ADR-102)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-content-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('$glyph — the masked-span vocabulary', () => {
    it('formats the glyph fill against the emitters\' span, as a direct child of the slot', async () => {
      const { react } = await run(tmpDir, glyphSlotSpec(), glyphOnlyApi);
      expect(react).toContain('.ds-badge__children > [data-element][aria-hidden="true"] {');
      expect(react).toContain('background-color: var(--color-on-surface);');
      expect(react).toContain('width: var(--constants-sizing-4x);');
      expect(react).toContain('height: 16px;');
    });

    it('reaches the slotted glyph span through ::slotted() in the host sheet', async () => {
      const { host } = await run(tmpDir, glyphSlotSpec(), glyphOnlyApi);
      expect(host).toContain(
        '.ds-badge__children > slot::slotted([data-element][aria-hidden="true"]) {');
      expect(host).toContain('background-color: var(--color-on-surface);');
    });

    it('emits a variant\'s fillColor restatement important, under the variant\'s selector', async () => {
      const { react, host } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphOnlyApi);
      expect(react).toContain('/* Variant: emphasized — children slot content */');
      expect(react).toMatch(
        /\.ds-badge\[data-emphasized[^\]]*\] \.ds-badge__children > \[data-element\]\[aria-hidden="true"\] \{\n {2}background-color: var\(--color-inverse-on-surface\) !important;\n\}/,
      );
      expect(host).toMatch(
        /\.ds-badge__children > slot::slotted\(\[data-element\]\[aria-hidden="true"\]\) \{\n {2}background-color: var\(--color-inverse-on-surface\) !important;\n\}/,
      );
    });

    it('a variant restating only contentStyles still produces its rule', async () => {
      // The variant's elements entry carries no `styles` at all — the content
      // delta alone must bring the element into the variant loop.
      const { react } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphOnlyApi);
      expect(react).toContain('var(--color-inverse-on-surface)');
    });

    it('emits no non-inherited glyph declarations on a slot that admits a component', async () => {
      // `glyphSlotApi`'s anyOf mixes `$glyph` with `dsIcon`/`dsMark` — a slotted
      // icon component's own root is emitted as `<span {...rootAttrs}
      // aria-hidden="true" data-element="root">`, matching the same masked-span
      // selector a primitive glyph fill uses. The rule must not exist at all on
      // such a slot: the glyph's fill color, width and height are non-inherited
      // and would otherwise override the component's own color via `!important`
      // and win the default rule on specificity.
      const { react, host } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphSlotApi);
      expect(react).not.toContain('[data-element][aria-hidden="true"]');
      expect(host).not.toContain('::slotted([data-element][aria-hidden="true"])');
    });
  });

  describe('$text — inherited properties on the slot element', () => {
    function textSlotSpec(
      anyOf: string[],
      variants: Array<Record<string, unknown>> = [],
      defaultText: Record<string, unknown> | null = {
        textColor: colorToken('Color/On surface'),
        typography: { $token: 'Typography/font__200__medium', $type: 'typography' },
        textAlignHorizontal: 'CENTER',
      },
    ) {
      return {
        variants: {
          default: {
            layout: [{ root: ['label'] }],
            elements: {
              root: { styles: { layoutMode: 'HORIZONTAL' } },
              label: {
                children: { $binding: '#/props/label' },
                ...(defaultText ? { contentStyles: { $text: defaultText } } : {}),
              },
            },
          },
          variants,
        },
        api: {
          anatomy: { root: { type: 'container' }, label: { type: 'slot' } },
          props: {
            label: { type: 'slot', anyOf },
            emphasized: { type: 'boolean', default: false },
          },
        },
      };
    }

    it('puts color, font and alignment on the slot element itself', async () => {
      const spec = textSlotSpec(['$text']);
      const { react, host } = await run(tmpDir, spec.variants, spec.api);
      for (const out of [react, host]) {
        expect(out).toContain('.ds-badge__label {');
        expect(out).toContain('color: var(--color-on-surface);');
        expect(out).toContain('font: var(--typography-font-200-medium);');
        expect(out).toContain('text-align: center;');
      }
    });

    it('puts truncation on the slot element only when the slot admits no component', async () => {
      const textOnly = textSlotSpec(['$text'], [], {
        textColor: colorToken('Color/On surface'),
        maxLines: 1,
        textOverflow: 'ELLIPSIS',
      });
      const { react } = await run(tmpDir, textOnly.variants, textOnly.api);
      expect(react).toContain('text-overflow: ellipsis;');
      expect(react).toContain('white-space: nowrap;');

      const mixed = textSlotSpec(['$text', 'dsBadge'], [], {
        textColor: colorToken('Color/On surface'),
        maxLines: 1,
        textOverflow: 'ELLIPSIS',
      });
      const mixedOut = await run(tmpDir, mixed.variants, mixed.api);
      // A truncation box on the slot element would clip a composed component.
      expect(mixedOut.react).not.toContain('text-overflow: ellipsis');
      expect(mixedOut.react).toContain('color: var(--color-on-surface);');
    });

    it('maps textAlignVertical to the same flex box the emitters inline', async () => {
      const spec = textSlotSpec(['$text'], [], {
        textAlignVertical: 'CENTER',
      });
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toContain('flex-direction: column;');
      expect(react).toContain('justify-content: center;');
    });

    it('a variant override targets the inline-formatted span, important, for a text-only slot', async () => {
      const spec = textSlotSpec(['$text'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: { $text: { textColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]);
      const { react, host } = await run(tmpDir, spec.variants, spec.api);
      // React: every string fill is wrapped in the emitter's inline-styled span,
      // and only an important rule outranks an inline style.
      expect(react).toMatch(
        /\.ds-badge__label > span \{\n {2}color: var\(--color-inverse-on-surface\) !important;\n\}/,
      );
      // Host: a slotted text node has no inline style — inheritance suffices —
      // while the <slot>'s default-content span needs the important re-tint.
      expect(host).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(host).toMatch(
        /\.ds-badge__label > slot > span \{\n {2}color: var\(--color-inverse-on-surface\) !important;\n\}/,
      );
    });

    it('a variant override stays on the slot element, normal priority, without a default block', async () => {
      const spec = textSlotSpec(['$text'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: { $text: { textColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ], null);
      const { react } = await run(tmpDir, spec.variants, spec.api);
      // No default $text block, so no inline-styled span exists to outrank.
      expect(react).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(react).not.toContain('!important');
    });

    it('a variant override on a mixed slot emits inherited properties only, normal priority', async () => {
      const spec = textSlotSpec(['$text', 'dsBadge'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: {
                $text: {
                  textColor: colorToken('Color/Inverse on surface'),
                  maxLines: 2,
                },
              },
            },
          },
        },
      ]);
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      // No selector can single the primitive span out from a component fill,
      // and a line-clamp box on the slot element would clip the component.
      expect(react).not.toContain('line-clamp');
      expect(react).not.toContain('!important');
    });
  });

  describe('scope', () => {
    it('emits nothing content-related for a spec without contentStyles', async () => {
      const { react, host } = await run(tmpDir, {
        default: {
          elements: {
            root: { styles: { layoutMode: 'HORIZONTAL' } },
            children: { children: { $binding: '#/props/children' } },
          },
        },
        variants: [],
      }, glyphSlotApi);
      expect(react).not.toContain('[data-element]');
      expect(host).not.toContain('::slotted');
    });

    it('token references resolve through the same pipeline as element styles', async () => {
      const spec = glyphSlotSpec();
      (spec.default.elements.root.styles as Record<string, unknown>).backgroundColor =
        colorToken('Color/On surface');
      const { react } = await run(tmpDir, spec, glyphOnlyApi);
      // Same token, same custom property — once from `styles`, once from `contentStyles`.
      expect(react).toContain('background: var(--color-on-surface);');
      expect(react).toContain('background-color: var(--color-on-surface);');
    });
  });
});
