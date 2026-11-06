import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { runValidate, type Finding } from '../../../src/validate/run.js';

let specsDir: string;

function writeSpec(kind: 'components' | 'compositions', name: string, docs: Record<string, unknown>): void {
  const dir = path.join(specsDir, kind, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [concern, doc] of Object.entries(docs)) {
    fs.writeFileSync(path.join(dir, `${concern}.yaml`), yaml.stringify(doc));
  }
}

const metadata = (concern: string) => ({
  source: { pageId: '1:1', nodeId: '1:2', nodeType: 'COMPONENT' },
  concern,
});

/** A minimal spec that passes both layers. */
function validSpec(): Record<string, unknown> {
  return {
    api: {
      metadata: metadata('api'),
      title: 'Badge',
      anatomy: {
        root: { type: 'container' },
        label: { type: 'text' },
      },
      props: {
        text: { type: 'string', default: 'Badge' },
        disabled: { type: 'boolean', default: false },
        appearance: { type: 'string', default: 'neutral', enum: ['neutral', 'success'] },
      },
    },
    variants: {
      metadata: metadata('variants'),
      default: {
        layout: [{ root: ['label'] }],
        elements: {
          root: { styles: {} },
          label: { content: { $binding: '#/props/text' } },
        },
      },
      variants: [
        { configuration: { appearance: 'success' }, elements: { label: { styles: {} } } },
      ],
    },
  };
}

function errorsOf(findings: Finding[]): Finding[] {
  return findings.filter(f => f.level === 'error');
}

describe('specs validate', () => {
  beforeEach(() => {
    specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-validate-'));
  });
  afterEach(() => {
    fs.rmSync(specsDir, { recursive: true, force: true });
  });

  it('passes a valid spec with no findings', () => {
    writeSpec('components', 'badge', validSpec());
    const result = runValidate({ specsPath: specsDir });
    expect(result.findings).toEqual([]);
    expect(result.counts.component).toBe(1);
  });

  it('reports a schema violation with its path', () => {
    const spec = validSpec();
    (spec.api as Record<string, unknown>).anatomy = {
      root: { type: 'container', unknownField: true },
    };
    writeSpec('components', 'badge', spec);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.file === 'api.yaml' && f.path.includes('unknownField'))).toBe(true);
  });

  it('reports a $binding to an undeclared prop', () => {
    const spec = validSpec();
    const variants = spec.variants as { default: { elements: Record<string, unknown> } };
    variants.default.elements.label = { content: { $binding: '#/props/missing' } };
    writeSpec('components', 'badge', spec);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.message.includes('"missing" is not declared'))).toBe(true);
  });

  it('reports a $slotContent pointer to a missing example in another spec', () => {
    writeSpec('components', 'badge', validSpec());
    const host = validSpec();
    const variants = host.variants as { default: { elements: Record<string, unknown> } };
    variants.default.elements.label = {
      examples: [{ $slotContent: '#/components/badge/slotContentExamples/nope' }],
    };
    writeSpec('components', 'host', host);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.spec === 'host' && f.message.includes('no slotContentExamples "nope"'))).toBe(true);
  });

  it('reports an unresolved instanceOf and accepts a resolvable one', () => {
    writeSpec('components', 'badge', validSpec());
    const host = validSpec();
    (host.api as { anatomy: Record<string, unknown> }).anatomy = {
      root: { type: 'container' },
      label: { type: 'text' },
      good: { type: 'instance', instanceOf: 'Badge' },
      bad: { type: 'instance', instanceOf: 'Tooltip' },
    };
    writeSpec('components', 'host', host);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.path === '/anatomy/bad/instanceOf')).toBe(true);
    expect(errors.some(f => f.path === '/anatomy/good/instanceOf')).toBe(false);
  });

  it('reports a layout element missing from anatomy', () => {
    const spec = validSpec();
    const variants = spec.variants as { default: { layout: unknown } };
    variants.default.layout = [{ root: ['label', 'ghost'] }];
    writeSpec('components', 'badge', spec);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.message.includes('"ghost" is not declared in anatomy'))).toBe(true);
  });

  it('reports an illegal enum value in a variant configuration', () => {
    const spec = validSpec();
    const variants = spec.variants as { variants: unknown[] };
    variants.variants = [{ configuration: { appearance: 'loud' }, elements: {} }];
    writeSpec('components', 'badge', spec);
    const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
    expect(errors.some(f => f.message.includes('not an allowed value of "appearance"'))).toBe(true);
  });

  it('does not report a missing metadata.source at all under --authored', () => {
    const spec = validSpec();
    (spec.api as { metadata: unknown }).metadata = { concern: 'api' };
    (spec.variants as { metadata: unknown }).metadata = { concern: 'variants' };
    writeSpec('components', 'badge', spec);

    const strict = runValidate({ specsPath: specsDir });
    expect(errorsOf(strict.findings).length).toBeGreaterThan(0);

    // The omission the flag exists to forgive is silent — guaranteed warnings on
    // every clean run train readers to filter warnings, which loses real ones.
    const authored = runValidate({ specsPath: specsDir, authored: true });
    expect(authored.findings).toEqual([]);
  });

  it('checks $token names against the caches, skipping classes with no cache', () => {
    const dataDir = path.join(specsDir, 'data');
    fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'cache', 'variables.yaml'),
      yaml.stringify({ entries: { 'Color/Primary': { file: 'lib' } } }),
    );

    const spec = validSpec();
    const variants = spec.variants as { default: { elements: Record<string, { styles?: unknown; content?: unknown }> } };
    variants.default.elements.root = {
      styles: {
        backgroundColor: { $token: 'Color/Primary', $type: 'color' },
        textColor: { $token: 'Color/Invented', $type: 'color' },
        typography: { $token: 'Typography/Unknowable', $type: 'typography' },
      },
    };
    writeSpec('components', 'badge', spec);

    const result = runValidate({ specsPath: specsDir, dataDir });
    const errors = errorsOf(result.findings);
    expect(errors.some(f => f.message.includes('token "Color/Invented" is not in the library'))).toBe(true);
    expect(errors.some(f => f.message.includes('Color/Primary'))).toBe(false);
    expect(errors.some(f => f.message.includes('Typography/Unknowable'))).toBe(false);
    expect(result.notes.some(n => n.includes('styles cache'))).toBe(true);
  });

  it('narrows to requested components and names the missing', () => {
    writeSpec('components', 'badge', validSpec());
    const result = runValidate({ specsPath: specsDir, components: ['badge', 'ghost'] });
    expect(result.missing).toEqual(['ghost']);
    expect(result.counts.component).toBe(1);
  });

  describe('resolved dimension tokens', () => {
    it('reports what a used dimension token resolves to, deduped', () => {
      const spec = validSpec();
      const variants = spec.variants as { default: { elements: Record<string, any> } };
      variants.default.elements.root = { styles: { strokeWeight: { $token: 'Shape/border weight/2x', $type: 'dimension' } } };
      writeSpec('components', 'badge', spec);
      const result = runValidate({
        specsPath: specsDir,
        tokenValues: new Map([['Shape/border weight/2x', 16]]),
      });
      expect(result.resolved).toEqual([
        { spec: 'badge', prop: 'strokeWeight', token: 'Shape/border weight/2x', value: 16 },
      ]);
    });
  });

  describe('undeclared authored platform files', () => {
    it('warns on an authored file the sidecar never mentions, and accepts mentioned ones', () => {
      const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-ws-'));
      const wsSpecs = path.join(ws, 'specs');
      const tree = path.join(ws, 'react', 'src', 'components', 'Badge');
      fs.mkdirSync(tree, { recursive: true });
      for (const f of ['contract.ts', 'scaffold.tsx', 'stories.tsx', 'styles.css']) fs.writeFileSync(path.join(tree, f), '');
      fs.writeFileSync(path.join(tree, 'component.tsx'), '');
      fs.writeFileSync(path.join(tree, 'motion.css'), '');
      const dir = path.join(wsSpecs, 'components', 'badge');
      fs.mkdirSync(dir, { recursive: true });
      const docs = {
        ...validSpec(),
        supplemental: {
          behavior: [{
            intent: 'fades in',
            schemaGap: 'no motion in Styles',
            platforms: { react: 'component.tsx' },
            regenerationRisk: 'low — imports motion.css beside it',
          }],
        },
      } as Record<string, unknown>;
      for (const [concern, doc] of Object.entries(docs)) {
        fs.writeFileSync(path.join(dir, `${concern}.yaml`), yaml.stringify(doc));
      }
      const findings = runValidate({ specsPath: wsSpecs, workspaceDir: ws }).findings;
      const dead = findings.filter(f => f.message.includes('loaded by nothing'));
      expect(dead).toHaveLength(0);

      fs.writeFileSync(path.join(tree, 'orphan.ts'), '');
      const again = runValidate({ specsPath: wsSpecs, workspaceDir: ws }).findings;
      expect(again.some(f => f.level === 'warning' && f.message.includes('orphan.ts') && f.message.includes('loaded by nothing'))).toBe(true);
      fs.rmSync(ws, { recursive: true, force: true });
    });
  });

  describe('instanceExamples configurations', () => {
    it('rejects a stale enum value and an undeclared prop', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        examples: {
          metadata: metadata('examples'),
          instanceExamples: {
            stale: { title: 'Stale', propConfigurations: { appearance: 'danger' } },
            ghost: { title: 'Ghost', propConfigurations: { tone: 'quiet' } },
          },
        },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'examples.yaml' && f.message.includes('"danger" is not an allowed value'))).toBe(true);
      expect(errors.some(f => f.file === 'examples.yaml' && f.message.includes('"tone" is not declared'))).toBe(true);
    });

    it('passes legal values', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        examples: {
          metadata: metadata('examples'),
          instanceExamples: {
            ok: { title: 'OK', propConfigurations: { appearance: 'success', disabled: false } },
          },
        },
      });
      expect(errorsOf(runValidate({ specsPath: specsDir }).findings)).toEqual([]);
    });
  });

  describe('supplemental sidecar', () => {
    const entry = {
      intent: 'Tooltip positions against its trigger',
      schemaGap: 'component-concern.schema.json — no positioning-engine concept',
      platforms: { react: 'useTooltipPosition.ts' },
      regenerationRisk: 'low — hook beside the scaffold',
    };

    it('passes a well-formed supplemental.yaml', () => {
      writeSpec('components', 'badge', { ...validSpec(), supplemental: { behavior: [entry] } });
      expect(runValidate({ specsPath: specsDir }).findings).toEqual([]);
    });

    it('rejects an unknown top-level section', () => {
      writeSpec('components', 'badge', { ...validSpec(), supplemental: { theming: [entry] } });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'supplemental.yaml' && f.path.includes('theming'))).toBe(true);
    });

    it('rejects an entry missing its schemaGap', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        supplemental: { events: [{ intent: 'fires onPress' }] },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'supplemental.yaml' && f.path.includes('schemaGap'))).toBe(true);
    });
  });
});
