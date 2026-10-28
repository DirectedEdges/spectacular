import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { CssTransformer } from '../../../src/transforms/Css.js';
import { drainNameWarnings } from '../../../src/transforms/css/values/nameWarnings.js';

const transformer = new CssTransformer();

import type { ProcessingStates } from '../../../src/transforms/states.js';

function makeContext(dir: string, componentKey = 'dsButton', tokensFormat = 'TOKEN', processingStates?: ProcessingStates) {
  return { specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir, kind: 'component' as const, componentKey, tokensFormat, outputFormat: 'JSON' as const, processingStates };
}

async function writeVariants(dir: string, data: Record<string, unknown>) {
  await fs.writeFile(path.join(dir, 'variants.yaml'), yaml.stringify(data), 'utf-8');
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// CSS now lands in the platform trees: React's stylesheet under react/, the custom
// element's under webcomponents/ (project 024). `workspaceDir` in these fixtures is
// the temp dir, so both are siblings of it.
function reactDir(dir: string, prefix: string, sub?: string): string {
  const base = path.join(dir, 'react', 'src', 'components', prefix);
  return sub ? path.join(base, sub) : base;
}
function wcDir(dir: string, prefix: string, sub?: string): string {
  const base = path.join(dir, 'webcomponents', 'src', 'components', prefix);
  return sub ? path.join(base, sub) : base;
}

async function run(dir: string, variantsData: Record<string, unknown>, componentKey = 'dsButton', tokensFormat = 'TOKEN', processingStates?: ProcessingStates, transformerOptions?: Record<string, unknown>) {
  await writeVariants(dir, variantsData);
  await transformer.run({}, { ...makeContext(dir, componentKey, tokensFormat, processingStates), transformerOptions });
  return fs.readFile(path.join(reactDir(dir, toPascalCase(componentKey)), 'styles.css'), 'utf-8');
}

// Minimal helpers to build spec-format style objects
function tokenRef(token: string, type = 'color') {
  return { $token: token, $type: type };
}

describe('CssTransformer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('has name "css"', () => {
    expect(transformer.name).toBe('css');
  });

  it('skips and warns when no variants.yaml exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await transformer.run({}, makeContext(tmpDir));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no variants.yaml'));
    expect(fs.existsSync(path.join(reactDir(tmpDir, 'DsButton'), 'styles.css'))).toBe(false);
    warnSpy.mockRestore();
  });

  it('writes styles.css with generated header', async () => {
    const out = await run(tmpDir, {});
    expect(out).toContain('/* Generated. Do not edit');
  });

  it('emits root selector from componentKey', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: { layoutMode: 'HORIZONTAL' } },
        },
      },
    });
    expect(out).toContain('.ds-button {');
  });

  it('kebabizes camelCase element keys into BEM child selectors', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          startIcon: { styles: { layoutMode: 'HORIZONTAL' } },
        },
      },
    });
    expect(out).toContain('.ds-button__start-icon {');
  });

  it('emits layout declarations from layoutMode HORIZONTAL', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: { layoutMode: 'HORIZONTAL' } },
        },
      },
    });
    expect(out).toContain('display: flex;');
    expect(out).toContain('flex-direction: row;');
  });

  it('emits layout declarations from layoutMode VERTICAL', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: { layoutMode: 'VERTICAL' } },
        },
      },
    });
    expect(out).toContain('flex-direction: column;');
  });

  describe('main-axis shrink', () => {
    // A size the spec states is not a starting point for CSS to negotiate down.
    const row = (childStyles: Record<string, unknown>) => ({
      default: {
        layout: [{ root: ['card'] }],
        elements: {
          root: { styles: { layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL' } },
          card: { styles: childStyles },
        },
      },
    });

    it('pins a stated width against a horizontal parent', async () => {
      const out = await run(tmpDir, row({ width: 320 }));
      expect(out).toContain('flex-shrink: 0;');
    });

    it('pins a HUG child against a horizontal parent', async () => {
      const out = await run(tmpDir, row({ layoutSizingHorizontal: 'HUG' }));
      expect(out).toContain('flex-shrink: 0;');
    });

    it('leaves a main-axis FILL child alone — `flex: 1 0 0` already says shrink 0', async () => {
      const out = await run(tmpDir, row({ layoutSizingHorizontal: 'FILL' }));
      expect(out).toContain('flex: 1 0 0;');
      expect(out).not.toContain('flex-shrink: 0;');
    });

    it('pins a child that says nothing about the main axis — unstated is FIXED', async () => {
      const out = await run(tmpDir, row({ height: 97 }));
      expect(out).toContain('flex-shrink: 0;');
    });

    it('says nothing in a variant rule that does not touch main-axis sizing', async () => {
      const out = await run(tmpDir, {
        ...row({ width: 320 }),
        variants: [
          {
            configuration: { state: 'hover' },
            elements: { card: { styles: { backgroundColor: tokenRef('Color/Surface/Primary') } } },
          },
        ],
      });
      // Once for the default rule, and not again for a rule whose job is a colour.
      expect(out.match(/flex-shrink: 0;/g)).toHaveLength(1);
    });
  });

  describe('sizing a flex child already does untold', () => {
    // A child of a column parent stretches across and hugs along by default, so
    // restating either buries the declarations that carry information.
    const inParent = (parentStyles: Record<string, unknown>, childStyles: Record<string, unknown>) => ({
      default: {
        layout: [{ root: ['child'] }],
        elements: { root: { styles: parentStyles }, child: { styles: childStyles } },
      },
    });
    const COLUMN = { layoutMode: 'VERTICAL' };
    const ROW = { layoutMode: 'HORIZONTAL' };

    it('says nothing for cross-axis FILL under a stretching parent', async () => {
      const out = await run(tmpDir, inParent(COLUMN, { layoutSizingHorizontal: 'FILL' }));
      expect(out).not.toContain('width: 100%;');
    });

    it('says nothing for main-axis HUG', async () => {
      const out = await run(tmpDir, inParent(COLUMN, { layoutSizingVertical: 'HUG' }));
      expect(out).not.toContain('height: fit-content;');
    });

    it('keeps cross-axis FILL when the parent does not stretch its children', async () => {
      const out = await run(tmpDir, inParent(
        { ...COLUMN, crossAxisAlignment: 'CENTER' },
        { layoutSizingHorizontal: 'FILL' },
      ));
      expect(out).toContain('width: 100%;');
    });

    it('keeps cross-axis HUG — it is what stops the child stretching', async () => {
      const out = await run(tmpDir, inParent(ROW, { layoutSizingVertical: 'HUG' }));
      expect(out).toContain('height: fit-content;');
    });

    it('keeps main-axis FILL, which grows rather than stretches', async () => {
      const out = await run(tmpDir, inParent(COLUMN, { layoutSizingVertical: 'FILL' }));
      expect(out).toContain('flex: 1 0 0;');
    });
  });

  it('resolves TOKEN format token references to kebab var(--)', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: { backgroundColor: tokenRef('Color/Surface/Primary') } },
        },
      },
    });
    expect(out).toContain('background: var(--color-surface-primary);');
  });

  it('resolves FIGMA_SYNTAX_WEB tokens that start with -- verbatim', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: { backgroundColor: '--color-brand-primary' } },
        },
      },
    }, 'dsButton', 'FIGMA_SYNTAX_WEB');
    expect(out).toContain('background: var(--color-brand-primary);');
  });

  it('emits single-prop variant as [data-*] attribute selector on root', async () => {
    const out = await run(tmpDir, {
      default: { elements: {} },
      variants: [
        {
          configuration: { appearance: 'outline' },
          elements: {
            root: { styles: { backgroundColor: tokenRef('Color/Transparent') } },
          },
        },
      ],
    });
    expect(out).toContain('.ds-button[data-appearance="outline"] {');
  });

  it('kebabizes camelCase prop keys in variant [data-*] selectors', async () => {
    const out = await run(tmpDir, {
      default: { elements: {} },
      variants: [
        {
          configuration: { fullBleed: 'true' },
          elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
        },
      ],
    });
    expect(out).toContain('[data-full-bleed="true"]');
  });

  it('scopes variant child elements under the component variant selector', async () => {
    const out = await run(tmpDir, {
      default: { elements: {} },
      variants: [
        {
          configuration: { size: 'sm' },
          elements: {
            label: { styles: { backgroundColor: tokenRef('Color/Surface/Neutral') } },
          },
        },
      ],
    });
    expect(out).toContain('.ds-button[data-size="sm"] .ds-button__label {');
  });

  it('emits compound variant selector for multi-prop configurations', async () => {
    const out = await run(tmpDir, {
      default: { elements: {} },
      variants: [
        {
          configuration: { appearance: 'outline', disabled: 'true' },
          elements: { root: { styles: { backgroundColor: tokenRef('Color/Disabled') } } },
        },
      ],
    });
    expect(out).toContain('[data-appearance="outline"][data-disabled="true"]');
  });

  describe('processing.states — concept-based selectors', () => {
    const states: ProcessingStates = {
      hover:          { prop: 'state', value: 'hover' },
      active:         { prop: 'state', value: 'pressed' },
      'focus-within': { prop: 'focused' },
      disabled:       { prop: 'isDisabled' },
      invalid:        { prop: 'validation', value: 'invalid' },
    };

    const variantsWithStates = {
      default: { elements: {} },
      variants: [
        { configuration: { state: 'hover' },     elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        { configuration: { state: 'pressed' },   elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        { configuration: { state: 'rest' },      elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        { configuration: { focused: 'true' },    elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        { configuration: { isDisabled: 'true' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        { configuration: { validation: 'invalid' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
      ],
    };

    it('emits :hover selector for hover concept (with :not(:disabled) guard since disabled is configured)', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button:hover:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('emits :active selector for active concept mapped to Figma value "pressed" (with :not(:disabled) guard)', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button:active:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('skips the base/rest value — no data-state="rest" or :rest selector', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).not.toContain('rest');
    });

    it('emits :focus-within for focus-within concept (boolean prop, value defaults to "true")', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button:focus-within {');
    });

    it('narrows the focus concept to :has(:focus-visible) on a wrapper root', async () => {
      const focusStates: ProcessingStates = { focus: { prop: 'state', value: 'focus' } };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { state: 'focus' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      }, 'dsButton', 'TOKEN', focusStates);
      expect(out).toContain('.ds-button:has(:focus-visible) {');
    });

    it('narrows the focus concept to :focus-visible on a self-focusable roled root', async () => {
      const focusStates: ProcessingStates = { focus: { prop: 'state', value: 'focus' } };
      await writeVariants(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { state: 'focus' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      });
      await transformer.run(
        { anatomy: { root: { type: 'container', role: 'button' } } },
        makeContext(tmpDir, 'dsButton', 'TOKEN', focusStates),
      );
      const out = await fs.readFile(path.join(reactDir(tmpDir, 'DsButton'), 'styles.css'), 'utf-8');
      expect(out).toContain('.ds-button:focus-visible {');
      expect(out).not.toContain(':has(:focus-visible)');
    });

    it('warns when a classified prop carries a value no concept names', async () => {
      // The value still reaches the contract and the stories, so the state looks
      // supported and renders as the default — the loss was only findable by
      // diffing the rendered component against the design.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const linkStates: ProcessingStates = { hover: { prop: 'state', value: 'hover' } };
      await writeVariants(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { state: 'visited' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      });
      await transformer.run(
        { props: { state: { type: 'string', enum: ['default', 'hover', 'visited'], default: 'default' } } },
        makeContext(tmpDir, 'dsLink', 'TOKEN', linkStates),
      );

      const message = warnSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(message).toContain('dsLink');
      expect(message).toContain("'state'");
      expect(message).toContain("'visited'");
      warnSpy.mockRestore();
    });

    it('stays silent for the prop\'s resting value, which the base block already covers', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const linkStates: ProcessingStates = { hover: { prop: 'state', value: 'hover' } };
      await writeVariants(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { state: 'default' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      });
      await transformer.run(
        { props: { state: { type: 'string', enum: ['default', 'hover'], default: 'default' } } },
        makeContext(tmpDir, 'dsLink', 'TOKEN', linkStates),
      );

      expect(warnSpy.mock.calls.map(c => String(c[0])).join('\n')).not.toContain('no concept names');
      warnSpy.mockRestore();
    });

    it('emits :visited for a link modelling visited through a classified prop', async () => {
      const linkStates: ProcessingStates = { visited: { prop: 'state', value: 'visited' } };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { state: 'visited' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      }, 'dsLink', 'TOKEN', linkStates);

      expect(out).toContain('.ds-link:visited {');
    });

    it('emits :disabled, [aria-disabled="true"] for disabled concept', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button:disabled,');
      expect(out).toContain('.ds-button[aria-disabled="true"] {');
    });

    it('emits [aria-invalid="true"] for invalid concept', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button[aria-invalid="true"] {');
    });

    it('emits no data-* selectors for classified props', async () => {
      const out = await run(tmpDir, variantsWithStates, 'dsButton', 'TOKEN', states);
      expect(out).not.toContain('data-state=');
      expect(out).not.toContain('data-focused=');
      expect(out).not.toContain('data-is-disabled=');
      expect(out).not.toContain('data-validation=');
    });

    it('still emits data-* for unclassified props', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { size: 'lg' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', states);
      expect(out).toContain('[data-size="lg"]');
    });

    it('combines data-* and state selectors in compound variants (with :not(:disabled) guard since disabled is configured)', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { appearance: 'outline', state: 'hover' },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      }, 'dsButton', 'TOKEN', states);
      expect(out).toContain('.ds-button[data-appearance="outline"]:hover:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('emits [aria-selected="true"] for enum-valued selected prop (Selected=Selected case)', async () => {
      // Checkbox: selected: { prop: 'selected' } — no value → concept name is the enum value
      const enumStates: ProcessingStates = {
        selected: { prop: 'selected' },
        indeterminate: { prop: 'selected', value: 'Indeterminate' },
      };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          // Enum value matching concept name (title-cased, as Figma produces)
          { configuration: { selected: 'Selected' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
          // Explicit value mapping
          { configuration: { selected: 'Indeterminate' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
          // Rest value — should be skipped
          { configuration: { selected: 'Unselected' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsCheckbox', 'TOKEN', enumStates);
      expect(out).toContain('[aria-selected="true"]');
      expect(out).toContain(':indeterminate,');
      expect(out).not.toContain('Unselected');
      expect(out).not.toContain('data-selected=');
    });

    it('does not regress boolean state props (disabled::true still matches)', async () => {
      const boolStates: ProcessingStates = {
        disabled: { prop: 'disabled' },
      };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { disabled: 'true' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', boolStates);
      expect(out).toContain('.ds-button:disabled,');
      expect(out).not.toContain('data-disabled=');
    });

    it('produces no state-related selectors when processingStates is absent', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { state: 'hover' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      });
      expect(out).toContain('[data-state="hover"]');
      expect(out).not.toContain(':hover');
    });
  });

  describe('presence selectors for boolean true variant values', () => {
    it('emits [data-x] presence selector when variant value is boolean true', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { disabled: true },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      });
      expect(out).toContain('[data-disabled]');
      expect(out).not.toContain('[data-disabled="');
    });

    it('emits [data-x="value"] value selector when variant value is a string', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { checked: 'checked' },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      });
      expect(out).toContain('[data-checked="checked"]');
    });

    it('emits distinct value selectors for multi-value string props', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { checked: 'checked' },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
          {
            configuration: { checked: 'indeterminate' },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      });
      expect(out).toContain('[data-checked="checked"]');
      expect(out).toContain('[data-checked="indeterminate"]');
      expect(out).not.toContain('[data-checked]');
    });

    it('emits presence selector for boolean true alongside a string data-attr in compound variants', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { appearance: 'outline', selected: true },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      });
      expect(out).toContain('[data-appearance="outline"][data-selected]');
    });
  });

  describe(':not(:disabled) guard on hover and active', () => {
    const statesWithDisabled: ProcessingStates = {
      hover:    { prop: 'state', value: 'hover' },
      active:   { prop: 'state', value: 'pressed' },
      disabled: { prop: 'isDisabled' },
    };

    it('appends :not(:disabled):not([aria-disabled="true"]) to :hover selector', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { state: 'hover' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', statesWithDisabled);
      expect(out).toContain('.ds-button:hover:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('appends :not(:disabled):not([aria-disabled="true"]) to :active selector', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { state: 'pressed' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', statesWithDisabled);
      expect(out).toContain('.ds-button:active:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('does not add the guard when disabled concept is absent from processingStates', async () => {
      const statesNoDisabled: ProcessingStates = {
        hover: { prop: 'state', value: 'hover' },
      };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { state: 'hover' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', statesNoDisabled);
      expect(out).toContain('.ds-button:hover {');
      expect(out).not.toContain(':not(:disabled)');
    });

    it('applies the guard to compound variants combining data-attr and :hover', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          {
            configuration: { appearance: 'outline', state: 'hover' },
            elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
          },
        ],
      }, 'dsButton', 'TOKEN', statesWithDisabled);
      expect(out).toContain('.ds-button[data-appearance="outline"]:hover:not(:disabled):not([aria-disabled="true"]) {');
    });

    it('does not add the guard to :focus-within or :disabled selectors', async () => {
      const statesAll: ProcessingStates = {
        hover:          { prop: 'state', value: 'hover' },
        'focus-within': { prop: 'focused' },
        disabled:       { prop: 'isDisabled' },
      };
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { focused: 'true' },    elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
          { configuration: { isDisabled: 'true' },  elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      }, 'dsButton', 'TOKEN', statesAll);
      expect(out).not.toContain(':focus-within:not(');
      expect(out).not.toContain(':disabled:not(');
    });
  });

  describe('the attribute a host selector keys off (specs#385)', () => {
    const variants = {
      default: { elements: {} },
      variants: [
        { configuration: { appearance: 'filled' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
      ],
    };

    async function bothSheets(dir: string) {
      await writeVariants(dir, variants);
      await transformer.run({ props: { appearance: { type: 'string', enum: ['filled', 'ghost'] } } }, makeContext(dir, 'dsButton'));
      return {
        react: await fs.readFile(path.join(reactDir(dir, 'DsButton'), 'styles.css'), 'utf-8'),
        host: await fs.readFile(path.join(wcDir(dir, 'DsButton'), 'host.css'), 'utf-8'),
      };
    }

    it('selects a reflected bare attribute on the host', async () => {
      // Lit reflects the reactive property, so the element writes `appearance`
      // itself and nothing stamps a data attribute.
      const { host } = await bothSheets(tmpDir);

      expect(host).toContain('[appearance="filled"]');
      expect(host).not.toContain('[data-appearance');
    });

    it('leaves the React sheet on data attributes, where the root is a div', async () => {
      const { react } = await bothSheets(tmpDir);

      expect(react).toContain('[data-appearance="filled"]');
      expect(react).not.toContain('[appearance="filled"]');
    });

    it('keeps the data- form for a prop whose name is a global HTML attribute', async () => {
      // Reflecting `hidden` would stop the component rendering; `title` would
      // raise a tooltip. data-* avoided this by construction.
      await writeVariants(tmpDir, {
        default: { elements: {} },
        variants: [{ configuration: { hidden: true }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } }],
      });
      await transformer.run({ props: { hidden: { type: 'boolean' } } }, makeContext(tmpDir, 'dsButton'));
      const host = await fs.readFile(path.join(wcDir(tmpDir, 'DsButton'), 'host.css'), 'utf-8');

      expect(host).toContain('[data-hidden]');
    });
  });

  describe('why each rule block exists (specs#385)', () => {
    it('labels a variant block with the configuration it came from', async () => {
      // Blocks sharing a selector are kept apart deliberately — each is a
      // separate statement about the component — so each says which.
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { size: 'large', appearance: 'filled' }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      });

      expect(out).toContain('/* Variant: size=large, appearance=filled */');
    });

    it('names the element when the block is not the root', async () => {
      const out = await run(tmpDir, {
        default: { elements: { label: { styles: { layoutMode: 'NONE' } } } },
        variants: [
          { configuration: { size: 'large' }, elements: { label: { styles: { opacity: 0.5 } } } },
        ],
      });

      expect(out).toContain('/* Variant: size=large — label */');
    });

    it('spells a boolean configuration as the concept, not as a value', async () => {
      const out = await run(tmpDir, {
        default: { elements: {} },
        variants: [
          { configuration: { loading: true }, elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
        ],
      });

      expect(out).toContain('/* Variant: loading */');
    });

    it('says what declared each cursor affordance', async () => {
      // The affordance is read from the states classification, so the prop it
      // names has to exist on the component for it to apply at all.
      const pressStates: ProcessingStates = { active: { prop: 'state', value: 'active' } };
      await writeVariants(tmpDir, { default: { elements: {} }, variants: [] });
      await transformer.run(
        { props: { state: { type: 'string', enum: ['default', 'active'] } } },
        makeContext(tmpDir, 'dsButton', 'TOKEN', pressStates),
      );
      const out = await fs.readFile(path.join(reactDir(tmpDir, 'DsButton'), 'styles.css'), 'utf-8');

      expect(out).toContain('Press affordance');
      expect(out).toContain('cursor: pointer;');
    });
  });

  describe('subcomponent styles', () => {
    async function runAndReadSub(dir: string, variantsData: Record<string, unknown>, subKey: string, componentKey = 'dsActionList') {
      await writeVariants(dir, variantsData);
      await transformer.run({}, makeContext(dir, componentKey));
      return fs.readFile(path.join(reactDir(dir, toPascalCase(componentKey), toPascalCase(subKey)), 'styles.css'), 'utf-8');
    }

    it('emits styles.css in a subfolder for each subcomponent', async () => {
      await writeVariants(tmpDir, {
        subcomponents: {
          group: {
            default: { elements: { root: { styles: { layoutMode: 'VERTICAL' } } } },
            variants: [],
          },
        },
      });
      await transformer.run({}, makeContext(tmpDir, 'dsActionList'));
      expect(fs.existsSync(path.join(reactDir(tmpDir, 'DsActionList', 'Group'), 'styles.css'))).toBe(true);
    });

    it('namespaces subcomponent BEM selectors with the parent key', async () => {
      const out = await runAndReadSub(tmpDir, {
        subcomponents: {
          group: {
            default: {
              elements: {
                root: { styles: { layoutMode: 'VERTICAL' } },
                text: { styles: { layoutMode: 'HORIZONTAL' } },
              },
            },
            variants: [],
          },
        },
      }, 'group');
      expect(out).toContain('.ds-action-list-group {');
      expect(out).toContain('.ds-action-list-group__text {');
      // The parent's own class must not select the subcomponent's elements.
      expect(out).not.toContain('.ds-action-list__');
    });

    it('emits subcomponent variant selectors scoped to the subcomponent class', async () => {
      const out = await runAndReadSub(tmpDir, {
        subcomponents: {
          item: {
            default: { elements: {} },
            variants: [
              {
                configuration: { size: 'medium' },
                elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } },
              },
            ],
          },
        },
      }, 'item');
      expect(out).toContain('.ds-action-list-item[data-size="medium"] {');
    });

    it('emits multiple subcomponent subfolders independently', async () => {
      await writeVariants(tmpDir, {
        subcomponents: {
          group: {
            default: { elements: { root: { styles: { layoutMode: 'VERTICAL' } } } },
            variants: [],
          },
          header: {
            default: { elements: { root: { styles: { layoutMode: 'HORIZONTAL' } } } },
            variants: [],
          },
        },
      });
      await transformer.run({}, makeContext(tmpDir, 'dsActionList'));
      expect(fs.existsSync(path.join(reactDir(tmpDir, 'DsActionList', 'Group'), 'styles.css'))).toBe(true);
      expect(fs.existsSync(path.join(reactDir(tmpDir, 'DsActionList', 'Header'), 'styles.css'))).toBe(true);
      const groupOut = await fs.readFile(path.join(reactDir(tmpDir, 'DsActionList', 'Group'), 'styles.css'), 'utf-8');
      const headerOut = await fs.readFile(path.join(reactDir(tmpDir, 'DsActionList', 'Header'), 'styles.css'), 'utf-8');
      expect(groupOut).toContain('flex-direction: column');
      expect(headerOut).toContain('flex-direction: row');
    });
  });

  it('omits elements with no declarations', async () => {
    const out = await run(tmpDir, {
      default: {
        elements: {
          root: { styles: {} },
        },
      },
    });
    expect(out).not.toContain('.ds-button {');
  });


  describe('structural layout presence', () => {
    const structuralVariants = {
      default: {
        layout: [{ root: ['label'] }],
        elements: {
          root: { styles: { layoutMode: 'HORIZONTAL' } },
          label: { styles: {} },
          background: {
            styles: { position: 'ABSOLUTE', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: tokenRef('Color/Primary') },
          },
        },
      },
      variants: [
        {
          configuration: { appearance: 'overlay' },
          layout: [{ root: ['background', 'label'] }],
        },
      ],
    };

    it('adds position: relative to the layout parent of an absolute element', async () => {
      const out = await run(tmpDir, structuralVariants);
      const rootBlock = out.match(/\.ds-button \{[^}]*\}/)?.[0];
      expect(rootBlock).toContain('position: relative');
    });

    it('positions non-absolute siblings so painting follows layout order (last on top)', async () => {
      const out = await run(tmpDir, structuralVariants);
      const labelBlock = out.match(/\.ds-button__label \{[^}]*\}/)?.[0];
      expect(labelBlock).toContain('position: relative');
    });

    it('does not position siblings when no absolute element shares the parent', async () => {
      const out = await run(tmpDir, {
        default: {
          layout: [{ root: ['icon', 'label'] }],
          elements: {
            root: { styles: {} },
            icon: { styles: { layoutSizingHorizontal: 'HUG' } },
            label: { styles: { layoutSizingHorizontal: 'HUG' } },
          },
        },
        variants: [],
      });
      expect(out.match(/\.ds-button__label \{[^}]*\}/)?.[0]).not.toContain('position: relative');
    });

    it('hides elements absent from the default layout and un-hides them under including variants', async () => {
      const out = await run(tmpDir, structuralVariants);
      const baseBlock = out.match(/\.ds-button__background \{[^}]*\}/)?.[0];
      expect(baseBlock).toContain('display: none');
      expect(out).toContain('.ds-button[data-appearance="overlay"] .ds-button__background {');
      const overlayBlock = out.match(/\.ds-button\[data-appearance="overlay"\] \.ds-button__background \{[^}]*\}/)?.[0];
      expect(overlayBlock).toContain('display: block');
    });

    it('hides default elements dropped by a variant layout', async () => {
      const out = await run(tmpDir, {
        default: {
          layout: [{ root: ['icon', 'label'] }],
          elements: { root: { styles: {} }, icon: { styles: {} }, label: { styles: {} } },
        },
        variants: [
          { configuration: { compact: true }, layout: [{ root: ['label'] }] },
        ],
      });
      const compactIcon = out.match(/\.ds-button\[data-compact\] \.ds-button__icon \{[^}]*\}/)?.[0];
      expect(compactIcon).toContain('display: none');
    });

    it('does not hide elements present in the default layout', async () => {
      const out = await run(tmpDir, structuralVariants);
      const labelBlock = out.match(/\.ds-button__label \{[^}]*\}/)?.[0];
      expect(labelBlock ?? '').not.toContain('display: none');
    });
  });

  describe('inline effects', () => {
    it('maps a single drop shadow to box-shadow', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [{ visible: true, offsetX: 0, offsetY: 4, blur: 4, spread: 0, color: '#00000040' }],
                },
              },
            },
          },
        },
      });
      expect(out).toContain('box-shadow: 0 4px 4px 0 #00000040');
    });

    it('joins multiple shadows, marks inset, and drops invisible entries', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [
                    { visible: false, offsetX: 0, offsetY: 1, blur: 1, spread: 0, color: '#00000010' },
                    { visible: true, offsetX: 0, offsetY: 4, blur: 4, spread: 0, color: '#00000040' },
                    { visible: true, offsetX: 0, offsetY: 2, blur: 3, spread: 1, color: '#00000020', inset: true },
                  ],
                },
              },
            },
          },
        },
      });
      expect(out).toContain('box-shadow: 0 4px 4px 0 #00000040, inset 0 2px 3px 1px #00000020');
      expect(out).not.toContain('#00000010');
    });

    it('resolves token refs in shadow dimensions and color', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [{
                    visible: true,
                    offsetX: tokenRef('DS Color/Shadow/Elevated/x', 'dimension'),
                    offsetY: tokenRef('DS Color/Shadow/Elevated/y', 'dimension'),
                    blur: tokenRef('DS Color/Shadow/Elevated/blur', 'dimension'),
                    spread: 0,
                    color: tokenRef('DS Color/Shadow/Elevated/Color'),
                  }],
                },
              },
            },
          },
        },
      });
      expect(out).toContain(
        'box-shadow: var(--ds-color-shadow-elevated-x) var(--ds-color-shadow-elevated-y) var(--ds-color-shadow-elevated-blur) 0 var(--ds-color-shadow-elevated-color)'
      );
    });

    it('maps layerBlur to filter and backgroundBlur to backdrop-filter with /* effects */ trace comments on fan-out', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [{ visible: true, offsetX: 0, offsetY: 4, blur: 4, spread: 0, color: '#00000040' }],
                  layerBlur: { visible: true, radius: 4 },
                  backgroundBlur: { visible: true, radius: tokenRef('DS Color/Shadow/Elevated/blur', 'dimension') },
                },
              },
            },
          },
        },
      });
      expect(out).toContain('box-shadow: 0 4px 4px 0 #00000040 /* effects */');
      expect(out).toContain('filter: blur(4px) /* effects */');
      expect(out).toContain('backdrop-filter: blur(var(--ds-color-shadow-elevated-blur)) /* effects */');
    });

    it('omits the trace comment when effects yields a single declaration', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: { layerBlur: { visible: true, radius: 2 } },
              },
            },
          },
        },
      });
      expect(out).toContain('filter: blur(2px);');
      expect(out).not.toContain('/* effects */');
    });

    it('emits box-shadow: none when every shadow in the list is invisible', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [{ visible: false, offsetX: 0, offsetY: 4, blur: 4, spread: 0, color: '#00000040' }],
                },
              },
            },
          },
        },
      });
      expect(out).toContain('box-shadow: none');
    });

    it('resets all effect properties when a variant sets effects: null', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: {
                  shadows: [{ visible: true, offsetX: 0, offsetY: 4, blur: 4, spread: 0, color: '#00000040' }],
                },
              },
            },
          },
        },
        variants: [
          { configuration: { flat: true }, elements: { root: { styles: { effects: null } } } },
        ],
      });
      const flatBlock = out.match(/\.ds-button\[data-flat\] \{[^}]*\}/)?.[0] ?? '';
      expect(flatBlock).toContain('box-shadow: none');
      expect(flatBlock).toContain('filter: none');
      expect(flatBlock).toContain('backdrop-filter: none');
    });

    it('expands effect-style token refs into role vars with none fallbacks, sanitizing invalid name characters', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: { styles: { effects: tokenRef('Effect Style 1 (Shadow)', 'effects') } },
          },
        },
      });
      expect(out).toContain('box-shadow: var(--effect-style-1-shadow-shadows, none) /* effects */');
      expect(out).toContain('filter: var(--effect-style-1-shadow-layer-blur, none) /* effects */');
      expect(out).toContain('backdrop-filter: var(--effect-style-1-shadow-background-blur, none) /* effects */');
    });

    it('records dropped-character name warnings for the end-of-run summary', async () => {
      drainNameWarnings(); // reset anything collected by earlier tests
      await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                effects: tokenRef('Effect Style 1 (Shadow)', 'effects'),
                backgroundColor: tokenRef('Color/Brand 50%'),
              },
            },
          },
        },
      });
      const warnings = drainNameWarnings();
      expect(warnings.size).toBe(1);
      const names = [...warnings.values()][0];
      expect(names.get('Effect Style 1 (Shadow)')).toBe(1);
      expect(names.get('Color/Brand 50%')).toBe(1);
      // Drained — a second drain is empty.
      expect(drainNameWarnings().size).toBe(0);
    });
  });

  describe('gradients', () => {
    const linear = {
      type: 'LINEAR',
      angle: 45,
      stops: [
        { position: 0, color: '#FFFFFFFF' },
        { position: 0.95, color: '#FF0000FF' },
      ],
    };

    it('maps a linear gradient backgroundColor to background: linear-gradient()', async () => {
      const out = await run(tmpDir, {
        default: { elements: { root: { styles: { backgroundColor: linear } } } },
      });
      expect(out).toContain('background: linear-gradient(45deg, #FFFFFFFF 0%, #FF0000FF 95%)');
    });

    it('resolves token-ref stop colors to var()', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: {
              styles: {
                backgroundColor: {
                  type: 'LINEAR',
                  angle: 0,
                  stops: [
                    { position: 0, color: tokenRef('DS Color/Surface/Primary') },
                    { position: 1, color: tokenRef('DS Color/Line/Brand') },
                  ],
                },
              },
            },
          },
        },
      });
      expect(out).toContain('background: linear-gradient(0deg, var(--ds-color-surface-primary) 0%, var(--ds-color-line-brand) 100%)');
    });

    it('maps RADIAL to radial-gradient(at …) and ANGULAR to conic-gradient(from 0deg …)', async () => {
      const stops = [
        { position: 0, color: '#FF0000FF' },
        { position: 1, color: '#0000FFFF' },
      ];
      const out = await run(tmpDir, {
        default: {
          elements: {
            root: { styles: { backgroundColor: { type: 'RADIAL', center: { x: 0.5, y: 0.25 }, stops } } },
            halo: { styles: { backgroundColor: { type: 'ANGULAR', center: { x: 0.5, y: 0.5 }, stops } } },
          },
        },
      });
      expect(out).toContain('background: radial-gradient(at 50% 25%, #FF0000FF 0%, #0000FFFF 100%)');
      expect(out).toContain('background: conic-gradient(from 0deg at 50% 50%, #FF0000FF 0%, #0000FFFF 100%)');
    });

    it('maps gradient strokes to a masked ring and resets it when a variant restores a solid stroke', async () => {
      const out = await run(tmpDir, {
        default: {
          elements: { root: { styles: { strokes: '#000000FF', strokeWeight: 1 } } },
        },
        variants: [
          {
            configuration: { a: '2' },
            elements: {
              root: {
                styles: {
                  strokes: {
                    type: 'ANGULAR',
                    center: { x: 0.5, y: 0.5 },
                    stops: [
                      { position: 0, color: '#FF0000FF' },
                      { position: 0.74, color: '#B1F836FF' },
                    ],
                  },
                },
              },
            },
          },
          {
            configuration: { a: '2', b: '2' },
            elements: { root: { styles: { strokes: '#000000FF' } } },
          },
        ],
      });
      const gradientBlock = out.match(/\.ds-button\[data-a="2"\] \{[^}]*\}/)?.[0] ?? '';
      // A gradient stroke paints on a ::before ring, so the element's own
      // block only cancels the mechanisms a sibling layer may have drawn with.
      expect(gradientBlock).toContain('outline-style: none');
      expect(out).toContain('background: conic-gradient(from 0deg at 50% 50%, #FF0000FF 0%, #B1F836FF 74%)');
      expect(out).toContain('mask-composite: exclude');
      const solidBlock = out.match(/\.ds-button\[data-a="2"\]\[data-b="2"\] \{[^}]*\}/)?.[0] ?? '';
      // A solid stroke is an outline (layout-safe); the border-image reset is
      // still needed to cancel the gradient variant's border.
      expect(solidBlock).toContain('outline-color: #000000FF');
      expect(solidBlock).toContain('border-image: none');
      // The reset is per-element: every solid-stroke layer of this element
      // carries it, including the default block (harmless — none is initial).
      const baseBlock = out.match(/\.ds-button \{[^}]*\}/)?.[0] ?? '';
      expect(baseBlock).toContain('outline-color: #000000FF');
      expect(baseBlock).toContain('border-image: none');
    });

    it('paints gradient textColor as background clipped to the glyphs', async () => {
      const out = await run(tmpDir, {
        default: { elements: { label: { styles: { textColor: linear } } } },
      });
      const block = out.match(/\.ds-button__label \{[^}]*\}/)?.[0] ?? '';
      expect(block).toContain('background: linear-gradient(45deg, #FFFFFFFF 0%, #FF0000FF 95%)');
      expect(block).toContain('background-clip: text');
      expect(block).toContain('color: transparent');
    });
  });
});

describe('unresolved variables (DirectedEdges/specs#428)', () => {
  // The engine writes a sentinel name when it cannot read the variable at all.
  // Kebabized, that name looks like any other custom property, so a reference
  // to it is dead — and on a size property the element collapses to zero. The
  // spec carries no raw value for it, so nothing is emitted.
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-unresolved-'));
    drainNameWarnings();
  });
  afterEach(async () => {
    await fs.remove(tmpDir);
    drainNameWarnings();
  });

  const withStyles = (styles: Record<string, unknown>) => ({
    default: { layout: ['root'], elements: { root: { styles } } },
    variants: [],
  });

  it('writes unset rather than referencing a variable the engine could not resolve', async () => {
    // Not omitted: the variant overrode this property, and omitting it would
    // let a base rule's value for the same property win. `unset` is also what
    // the browser computed from the old dead var() reference.
    const css = await run(
      tmpDir,
      withStyles({
        width: tokenRef('[collection-name-unresolved]/Unavailable variable', 'dimension'),
        cornerRadius: tokenRef('Foundation/radius/full', 'dimension'),
      }),
    );
    expect(css).not.toContain('unavailable-variable');
    expect(css).toContain('width: unset');
    // A neighbouring real token in the same element still resolves.
    expect(css).toContain('var(--foundation-radius-full)');
  });

  it('records a name warning naming the sentinel path', async () => {
    await run(tmpDir, withStyles({ width: tokenRef('[collection-name-unresolved]/Unavailable variable', 'dimension') }));
    const warnings = drainNameWarnings();
    const paths = [...warnings.values()].flatMap(byName => [...byName.keys()]);
    expect(paths).toContain('[collection-name-unresolved]/Unavailable variable');
  });

  it('withholds a variable whose collection name alone is missing', async () => {
    // The sentinel is part of the path the custom-property name derives from,
    // so a known variable name under an unknown collection is just as dead as
    // an unknown variable — there is no name a stylesheet could define.
    const css = await run(tmpDir, withStyles({ cornerRadius: tokenRef('[collection-name-unresolved]/Brand/Blue', 'dimension') }));
    expect(css).not.toContain('brand-blue');
    expect(css).toContain('border-radius: unset');
  });

  it('leaves a real token containing the word unresolved alone', async () => {
    const css = await run(tmpDir, withStyles({ cornerRadius: tokenRef('Brand/Unresolved Blue', 'dimension') }));
    expect(css).toContain('var(--brand-unresolved-blue)');
  });
});

describe('captured raw value as a var() fallback (DirectedEdges/specs#570)', () => {
  // `cssvars` emits no definition for a variable whose value aliases one outside
  // the fetched payload, so the reference resolves to nothing and the property
  // renders as if it were never declared. The extensions profiles carry what
  // Figma last read, and `$type` says what unit that number is in — so the
  // reference degrades to a real value instead of to nothing.
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-rawfallback-'));
    drainNameWarnings();
  });
  afterEach(async () => {
    await fs.remove(tmpDir);
    drainNameWarnings();
  });

  const withStyles = (styles: Record<string, unknown>) => ({
    default: { layout: ['root'], elements: { root: { styles } } },
    variants: [],
  });

  const withRaw = (token: string, type: string, rawValue: unknown) => ({
    $token: token,
    $type: type,
    $extensions: { 'com.figma': { id: 'VariableID:1:1', rawValue } },
  });

  it('a dimension falls back to the captured number as a length', async () => {
    const css = await run(tmpDir, withStyles({ itemSpacing: withRaw('Spacing/space/100', 'dimension', 8) }));
    expect(css).toContain('var(--spacing-space-100, 8px)');
  });

  it('a dimension of zero falls back to a unitless zero', async () => {
    const css = await run(tmpDir, withStyles({ itemSpacing: withRaw('Spacing/space/0', 'dimension', 0) }));
    expect(css).toContain('var(--spacing-space-0, 0)');
  });

  it('a number falls back without a unit', async () => {
    const css = await run(tmpDir, withStyles({ opacity: withRaw('Effect/opacity/subtle', 'number', 36) }));
    expect(css).toContain('var(--effect-opacity-subtle, 36)');
    expect(css).not.toContain('36px');
  });

  it('a colour falls back to the captured hex', async () => {
    const css = await run(
      tmpDir,
      withStyles({ backgroundColor: withRaw('Color/background/neutral', 'color', { colorSpace: 'srgb', hex: '#161a1d' }) }),
    );
    expect(css).toContain('var(--color-background-neutral, #161a1d)');
  });

  it('a raw value whose shape settles no unit contributes no fallback', async () => {
    // Carried, never invented: a string where a length belongs says nothing
    // about how many pixels it is, so the reference stays bare.
    const css = await run(tmpDir, withStyles({ itemSpacing: withRaw('Spacing/space/100', 'dimension', 'medium') }));
    expect(css).toContain('var(--spacing-space-100)');
    expect(css).not.toContain('medium');
  });

  it('a reference carrying no raw value stays bare', async () => {
    const css = await run(tmpDir, withStyles({ itemSpacing: tokenRef('Spacing/space/100', 'dimension') }));
    expect(css).toContain('var(--spacing-space-100)');
  });
});

describe('text truncation', () => {
  // Figma truncates a text layer by line count, optionally with an ellipsis.
  // The spec carries maxLines and textOverflow; neither reached the CSS before.
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-truncate-')); });
  afterEach(async () => { await fs.remove(tmpDir); });

  const withLabel = (styles: Record<string, unknown>) => ({
    default: { layout: ['label'], elements: { label: { styles } } },
    variants: [],
  });

  it('a single line with an ellipsis truncates on one line', async () => {
    const css = await run(tmpDir, withLabel({ maxLines: 1, textOverflow: 'ELLIPSIS' }));
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('text-overflow: ellipsis');
    expect(css).not.toContain('line-clamp');
  });

  it('more than one line uses the line-clamp box', async () => {
    const css = await run(tmpDir, withLabel({ maxLines: 3, textOverflow: 'ELLIPSIS' }));
    expect(css).toContain('-webkit-line-clamp: 3');
    expect(css).toContain('line-clamp: 3');
    expect(css).toContain('overflow: hidden');
    expect(css).not.toContain('white-space: nowrap');
  });

  it('an ellipsis with no line count truncates on one line', async () => {
    const css = await run(tmpDir, withLabel({ textOverflow: 'ELLIPSIS' }));
    expect(css).toContain('text-overflow: ellipsis');
    expect(css).toContain('white-space: nowrap');
  });

  it('a line count with no ellipsis clips without one', async () => {
    const css = await run(tmpDir, withLabel({ maxLines: 1 }));
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('overflow: hidden');
    expect(css).not.toContain('text-overflow');
  });

  it('a label declaring neither is untouched', async () => {
    const css = await run(tmpDir, withLabel({ textColor: '#000000FF' }));
    expect(css).not.toContain('text-overflow');
    expect(css).not.toContain('white-space');
  });
});

describe('strokes cost no layout space', () => {
  // A Figma stroke never changes a frame's size, at any alignment. A CSS border
  // does, for a hugging element — `box-sizing: border-box` only bites when the
  // element has an explicit size — so every stroke is an outline instead.
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-stroke-')); });
  afterEach(async () => { await fs.remove(tmpDir); });

  const withRoot = (styles: Record<string, unknown>) => ({
    default: { layout: [], elements: { root: { styles } } },
    variants: [],
  });

  it('an inside stroke is an outline pulled back over its own edge', async () => {
    const css = await run(tmpDir, withRoot({ strokes: '#000000FF', strokeWeight: 1, strokeAlign: 'INSIDE' }));
    expect(css).toContain('outline-color: #000000FF');
    expect(css).toContain('outline-width: 1px');
    expect(css).toContain('outline-offset: -1px');
    expect(css).not.toContain('border-width: 1px');
  });

  it('an unrecorded alignment reads as inside', async () => {
    // Figma's own default when a file records no alignment.
    const css = await run(tmpDir, withRoot({ strokes: '#000000FF', strokeWeight: 2 }));
    expect(css).toContain('outline-width: 2px');
    expect(css).toContain('outline-offset: -2px');
  });

  it('a token-valued width negates with calc, since -var() is not a value', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: '#000000FF',
      strokeWeight: tokenRef('Foundation/border-width/thin', 'dimension'),
      strokeAlign: 'INSIDE',
    }));
    expect(css).toContain('outline-offset: calc(-1 * var(--foundation-border-width-thin))');
    expect(css).not.toContain('outline-offset: -var(');
  });

  it('an outside stroke is not pulled back', async () => {
    const css = await run(tmpDir, withRoot({ strokes: '#000000FF', strokeWeight: 1, strokeAlign: 'OUTSIDE' }));
    expect(css).toContain('outline-width: 1px');
    expect(css).not.toContain('outline-offset');
  });

  it('a per-side weight keeps the border mapping', async () => {
    // An outline has one width; a design that strokes some sides needs four.
    const css = await run(tmpDir, withRoot({
      strokes: '#000000FF',
      strokeWeight: { top: 1, end: 0, bottom: 1, start: 0 },
      strokeAlign: 'INSIDE',
    }));
    expect(css).toContain('border-color: #000000FF');
    expect(css).not.toContain('outline-color');
  });
});

describe('gradient strokes arriving as token references', () => {
  // The spec carries the reference, not the gradient — the value arrives
  // through the custom property the tokens transform writes. `$type` is the
  // only thing that says which kind it is (DirectedEdges/specs#452).
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-gradtoken-')); });
  afterEach(async () => { await fs.remove(tmpDir); });

  const withRoot = (styles: Record<string, unknown>) => ({
    default: { layout: [], elements: { root: { styles } } },
    variants: [],
  });

  it('a gradient token paints a ::before ring, not a border colour', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'gradient/spinner', $type: 'gradient' },
      strokeWeight: 2.5,
      cornerRadius: 999,
    }));
    expect(css).toContain('::before');
    expect(css).toContain('background: var(--gradient-spinner)');
    expect(css).toContain('mask-composite: exclude');
    expect(css).toContain('border-radius: inherit');
    expect(css).not.toContain('outline-color: var(--gradient-spinner)');
  });

  it('the ring takes its thickness from the stroke weight, as padding', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'gradient/spinner', $type: 'gradient' },
      strokeWeight: 2.5,
    }));
    const ring = css.slice(css.indexOf('::before'));
    expect(ring).toContain('padding: 2.5px');
  });

  it('the host declares no border, so the ring costs no layout', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'gradient/spinner', $type: 'gradient' },
      strokeWeight: 2.5,
    }));
    const host = css.slice(0, css.indexOf('::before'));
    expect(host).not.toContain('border-width: 2.5px');
    expect(host).not.toContain('border-style: solid');
  });

  it("leaves the element's own background alone", async () => {
    // The mechanism this replaced painted into `background` and masked the
    // middle out, which erased any fill the element declared.
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'gradient/spinner', $type: 'gradient' },
      strokeWeight: 2,
      backgroundColor: '#723FFFFF',
    }));
    const host = css.slice(0, css.indexOf('::before'));
    expect(host).toContain('background: #723FFFFF');
    expect(host).not.toContain('mask');
  });

  it('a colour token is untouched and still emits an outline', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'border/primary', $type: 'color' },
      strokeWeight: 1,
    }));
    expect(css).toContain('outline-color: var(--border-primary)');
    expect(css).not.toContain('mask-composite');
  });

  it('a gradient stroke cancels the outline a solid one would have drawn', async () => {
    const css = await run(tmpDir, withRoot({
      strokes: { $token: 'gradient/spinner', $type: 'gradient' },
      strokeWeight: 2,
    }));
    expect(css).toContain('outline-style: none');
  });
});

// The fit declarations describe how the element presents a background image.
// A component can also take its image from a code-only source prop at runtime,
// where the registry has no `src` to resolve — the element still needs the fit.
describe('CssTransformer background image fit', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-image-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  async function runWithImages(images: Record<string, unknown>, objectFit?: string) {
    await fs.writeFile(
      path.join(tmpDir, 'examples.yaml'),
      yaml.stringify({ images }),
      'utf-8',
    );
    return run(tmpDir, {
      default: {
        layout: [{ root: ['imageFill'] }],
        elements: {
          root: { styles: {} },
          imageFill: {
            styles: {
              backgroundImage: {
                $image: '#/components/dsImage/images/dsImage__imageFill',
                ...(objectFit ? { objectFit } : {}),
              },
            },
          },
        },
      },
    }, 'dsImage');
  }

  it('emits the url and the fit when the registry entry resolves', async () => {
    const css = await runWithImages({
      dsImage__imageFill: { src: '../../assets/images/abc123.jpg' },
    });
    expect(css).toContain("background-image: url('../../../../assets/images/abc123.jpg')");
    expect(css).toContain('background-position: center');
    expect(css).toContain('background-repeat: no-repeat');
    expect(css).toContain('background-size: cover');
  });

  it('emits the fit without a url when the registry entry is unresolved', async () => {
    const css = await runWithImages({
      dsImage__imageFill: { $extensions: { 'com.figma': { imageHash: 'abc123' } } },
    });
    expect(css).not.toContain('background-image:');
    expect(css).toContain('background-position: center');
    expect(css).toContain('background-repeat: no-repeat');
    expect(css).toContain('background-size: cover');
  });

  it('honours objectFit CONTAIN on an unresolved entry', async () => {
    const css = await runWithImages(
      { dsImage__imageFill: { $extensions: { 'com.figma': { imageHash: 'abc123' } } } },
      'CONTAIN',
    );
    expect(css).toContain('background-size: contain');
  });
});
