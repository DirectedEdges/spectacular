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

  describe('image pointers', () => {
    it('resolves both pointer forms, flags dangling keys and the non-resolving spelling, warns on missing imageHash', () => {
      const spec = validSpec();
      (spec.api as Record<string, unknown>).props = {
        ...(spec.api as { props: Record<string, unknown> }).props,
        source: { type: 'image', default: '#/components/badge/images/hero' },
        thumb: { type: 'image', default: '#/images/hero' },
        portrait: { type: 'image', default: '#/components/badge/images/missing' },
        banner: { type: 'image', default: 'image.examples#/images/hero' },
        remote: { type: 'image', default: '#/components/ghost/images/hero' },
      };
      writeSpec('components', 'badge', {
        ...spec,
        examples: {
          metadata: metadata('examples'),
          images: { hero: { src: './images/hero.png' } },
        },
      });
      const result = runValidate({ specsPath: specsDir });
      const errors = errorsOf(result.findings);
      expect(errors.some(f => f.message.includes('declares no images registry entry "missing"'))).toBe(true);
      expect(errors.some(f => f.message.includes('resolves nowhere'))).toBe(true);
      expect(errors.some(f => f.message.includes('names no spec "ghost"'))).toBe(true);
      expect(errors.some(f => f.path.includes('source') || f.path.includes('thumb'))).toBe(false);
      // src with no imageHash: React paints, Figma won't — warned, not errored.
      expect(result.findings.some(f => f.level === 'warning' && f.message.includes('no com.figma imageHash'))).toBe(true);
    });
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

  // ADR-118 changed this check's premise. `platforms` no longer carries a file
  // path, and the emitters never read it — an authored `component.tsx` wins over
  // the scaffold because of its name. So the conventional entry point is never
  // unreachable, and only a file beside it that nothing mentions is suspect.
  describe('unreachable authored platform files', () => {
    it('never warns on the conventional entry point, warns on an unmentioned sibling', () => {
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
            schemaGap: { path: 'styles.schema.json#/definitions/Styles', need: 'no motion properties' },
            platforms: ['react'],
            checkedBy: 'assisted',
            // The one place a dependency on a sibling file is still recorded.
            checks: [{ to: 'react/src/components/Badge/motion.css' }],
          }],
        },
      } as Record<string, unknown>;
      for (const [concern, doc] of Object.entries(docs)) {
        fs.writeFileSync(path.join(dir, `${concern}.yaml`), yaml.stringify(doc));
      }
      const findings = runValidate({ specsPath: wsSpecs, workspaceDir: ws }).findings;
      // component.tsx is loaded by convention; motion.css is named in `checks`.
      expect(findings.filter(f => f.message.includes('may be unreachable'))).toHaveLength(0);

      fs.writeFileSync(path.join(tree, 'orphan.ts'), '');
      const again = runValidate({ specsPath: wsSpecs, workspaceDir: ws }).findings;
      expect(again.some(f => f.level === 'warning' && f.message.includes('orphan.ts') && f.message.includes('may be unreachable'))).toBe(true);
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

  // The two authored documents (ADR-118). Both contracts are published by
  // specs-schema now; the CLI's private copy of the supplemental schema is gone.
  describe('supplemental document', () => {
    const entry = {
      intent: 'Tooltip positions against its trigger',
      schemaGap: {
        path: 'component-concern.schema.json#/definitions/ComponentVariantsDocument',
        need: 'no positioning-engine concept exists, so no authored surface can state it',
      },
      platforms: ['react'],
      checkedBy: 'manual',
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

    it('rejects a string schemaGap — the experimental contract\'s shape', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        supplemental: { events: [{ intent: 'x', schemaGap: 'styles.schema.json' }] },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'supplemental.yaml' && f.path.includes('schemaGap'))).toBe(true);
    });

    it('rejects `web` named beside a web leaf', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        supplemental: { motion: [{ ...entry, platforms: ['web', 'react'] }] },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'supplemental.yaml' && f.path.includes('platforms'))).toBe(true);
    });

    it('requires checks when checkedBy is automated', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        supplemental: { motion: [{ ...entry, checkedBy: 'automated' }] },
      });
      expect(errorsOf(runValidate({ specsPath: specsDir }).findings).length).toBeGreaterThan(0);
    });
  });

  describe('guidelines document', () => {
    const rule = {
      statement: 'Use a badge for a value that changes while on screen.',
      level: 'must-not',
      alternatives: [{ to: 'liveRegion' }],
    };

    it('passes a well-formed guidelines.yaml', () => {
      writeSpec('components', 'badge', { ...validSpec(), guidelines: { slotComposition: [rule] } });
      expect(runValidate({ specsPath: specsDir }).findings).toEqual([]);
    });

    it('rejects an obligation level outside the RFC 2119 set', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { styles: [{ statement: 'x', level: 'never' }] },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'guidelines.yaml' && f.path.includes('level'))).toBe(true);
    });

    it('rejects an entry carrying a schemaGap — that is the other document\'s gate', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { styles: [{ ...rule, schemaGap: { path: 'a', need: 'b' } }] },
      });
      expect(errorsOf(runValidate({ specsPath: specsDir }).findings).length).toBeGreaterThan(0);
    });

    it('rejects a per-token table — a rules document holds rules', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { useWhen: [{ $token: 'DE Color/Text/Primary', $description: 'body text' }] },
      });
      const errors = errorsOf(runValidate({ specsPath: specsDir }).findings);
      expect(errors.some(f => f.file === 'guidelines.yaml' && f.path.includes('useWhen'))).toBe(true);
    });

    // A foundation's sections are their own vocabulary (ADR-118, amended). The
    // schema admits both key sets and rejects a document mixing them; the two
    // shared keys discriminate neither, so the path is what says which scope.
    it('accepts foundation concern keys', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { color: [rule], elevation: [{ statement: 'x', level: 'must' }] },
      });
      expect(runValidate({ specsPath: specsDir }).findings).toEqual([]);
    });

    it('rejects a document mixing the two vocabularies', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { accessibility: [rule], color: [rule] },
      });
      expect(errorsOf(runValidate({ specsPath: specsDir }).findings).length).toBeGreaterThan(0);
    });

    it('accepts a document using only the two shared keys', () => {
      writeSpec('components', 'badge', {
        ...validSpec(),
        guidelines: { layout: [rule], motion: [rule] },
      });
      expect(runValidate({ specsPath: specsDir }).findings).toEqual([]);
    });
  });
});
