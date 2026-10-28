import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { RolesAnalyzer } from '../../../src/analyze/Roles.js';

type RolesYaml = {
  summary: {
    components: number;
    componentsAnnotated: number;
    elements: number;
    elementsAnnotated: number;
    conceptsInUse: Record<string, number>;
    conceptsUnused: string[];
    conceptsInertInUse: Record<string, string>;
    findings: number;
  };
  findings?: Array<{ kind: string; component: string; element: string; detail: string }>;
  byComponent: Record<string, {
    annotated: number;
    unannotated: number;
    roles?: Record<string, string | string[]>;
    bare?: Record<string, string>;
  }>;
};

describe('RolesAnalyzer', () => {
  let outputDir: string;
  let analysisDir: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roles-test-'));
    analysisDir = path.join(outputDir, 'analysis');
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  async function runAnalyzer(components: Record<string, Record<string, unknown>>) {
    const a = new RolesAnalyzer();
    for (const [componentKey, apiYaml] of Object.entries(components)) {
      const compDir = path.join(outputDir, componentKey);
      await fs.ensureDir(compDir);
      await a.run(apiYaml, { specDir: compDir, outputDir: compDir, workspaceDir: compDir, specsRoot: compDir, kind: 'component' as const, componentKey, outputFormat: 'YAML', tokensFormat: 'TOKEN' });
    }
    await a.finalize!(outputDir, analysisDir);
    const file = path.join(analysisDir, 'roles.yaml');
    if (!await fs.pathExists(file)) return null;
    return yaml.parse(await fs.readFile(file, 'utf-8')) as RolesYaml;
  }

  describe('coverage — the measure a library adopting roles starts from', () => {
    it('reports an unannotated library as fully bare, not as empty', async () => {
      // The state christine was in: 69 components, no roles anywhere. A report that
      // returned nothing would read as "measured and clean" rather than "none yet".
      const result = await runAnalyzer({
        checkbox: { anatomy: { root: { type: 'container' }, control: { type: 'container' } } },
      });
      expect(result!.summary.componentsAnnotated).toBe(0);
      expect(result!.summary.elements).toBe(2);
      expect(result!.summary.elementsAnnotated).toBe(0);
      expect(result!.byComponent.checkbox.bare).toEqual({ root: 'container', control: 'container' });
    });

    it('counts annotated and bare elements per component', async () => {
      const result = await runAnalyzer({
        checkbox: {
          anatomy: {
            root: { type: 'container' },
            control: { type: 'container', role: 'checkbox' },
            fieldLabel: { type: 'text', role: 'label' },
          },
        },
      });
      expect(result!.summary.componentsAnnotated).toBe(1);
      expect(result!.summary.elementsAnnotated).toBe(2);
      expect(result!.byComponent.checkbox).toMatchObject({
        annotated: 2,
        unannotated: 1,
        roles: { control: 'checkbox', fieldLabel: 'label' },
        bare: { root: 'container' },
      });
    });

    it('counts each concept by use, most-used first', async () => {
      const result = await runAnalyzer({
        checkbox: { anatomy: { a: { type: 'text', role: 'label' }, b: { type: 'container', role: 'checkbox' } } },
        radio: { anatomy: { a: { type: 'text', role: 'label' } } },
      });
      expect(Object.keys(result!.summary.conceptsInUse)).toEqual(['label', 'checkbox']);
      expect(result!.summary.conceptsInUse.label).toBe(2);
    });

    it('names the vocabulary concepts nothing references', async () => {
      const result = await runAnalyzer({
        checkbox: { anatomy: { control: { type: 'container', role: 'checkbox' } } },
      });
      expect(result!.summary.conceptsUnused).toContain('switch');
      expect(result!.summary.conceptsUnused).toContain('panel');
      expect(result!.summary.conceptsUnused).not.toContain('checkbox');
    });

    it('flags a concept in use that emits nothing yet', async () => {
      // Inert, not invalid: the spec carries it and every transform ignores it. Worth
      // surfacing so a reader is not surprised when annotating changed no output.
      const result = await runAnalyzer({
        stepper: { anatomy: { field: { type: 'container', role: 'spinbutton' }, up: { type: 'glyph', role: 'increment' } } },
      });
      expect(result!.summary.conceptsInertInUse).toEqual({ spinbutton: 'none', increment: 'none' });
    });

    it('does not flag an implemented concept as inert', async () => {
      const result = await runAnalyzer({
        checkbox: { anatomy: { control: { type: 'container', role: 'checkbox' } } },
      });
      expect(result!.summary.conceptsInertInUse).toEqual({});
    });
  });

  describe('what is reported and what is left alone', () => {
    it('reports a value outside the vocabulary without rejecting it', async () => {
      // The schema types a role as an open string and transforms ignore what they do not
      // know, so this is a likely typo rather than a broken spec — and it still counts as
      // a use, because the spec does carry it.
      const result = await runAnalyzer({
        checkbox: { anatomy: { control: { type: 'container', role: 'chekbox' } } },
      });
      expect(result!.findings).toHaveLength(1);
      expect(result!.findings![0].kind).toBe('unknown-concept');
      expect(result!.summary.conceptsInUse.chekbox).toBe(1);
      expect(result!.byComponent.checkbox.roles).toEqual({ control: 'chekbox' });
    });

    it('leaves a part role with no control in the component alone', async () => {
      // Explicitly valid: a label component carrying `label` declares that it *provides*
      // that part. It emits the element and an id and no wiring, because it has nothing to
      // wire to — the wiring arrives when it is composed.
      const result = await runAnalyzer({
        formLabel: {
          anatomy: {
            label: { type: 'text', role: 'label' },
            description: { type: 'text', role: 'description' },
          },
        },
      });
      expect(result!.summary.findings).toBe(0);
    });

    it('reports a role value the reader would not recover', async () => {
      const result = await runAnalyzer({
        checkbox: { anatomy: { control: { type: 'container', role: 'Role: Button' } } },
      });
      expect(result!.findings!.map((f) => f.kind)).toEqual(['malformed-role-value']);
    });
  });

  describe('more than one role on one element', () => {
    it('reports several roles on an element the component owns', async () => {
      const result = await runAnalyzer({
        checkbox: { anatomy: { control: { type: 'container', role: ['checkbox', 'switch'] } } },
      });
      expect(result!.findings!.map((f) => f.kind)).toEqual(['multiple-roles-on-owned-element']);
    });

    it('allows several roles on an instance, where a list routes rather than claims', async () => {
      const result = await runAnalyzer({
        formLabel: {
          anatomy: {
            label: { type: 'text', role: 'label' },
            description: { type: 'text', role: 'description' },
          },
        },
        switchField: {
          anatomy: {
            formLabel: { type: 'instance', instanceOf: 'formLabel', role: ['label', 'description'] },
            action: { type: 'container', role: 'switch' },
          },
        },
      });
      expect(result!.summary.findings).toBe(0);
      expect(result!.byComponent.switchField.roles!.formLabel).toEqual(['label', 'description']);
    });
  });

  describe('a routed concept and its provider must agree', () => {
    it('reports a concept the provider does not ascribe', async () => {
      // The consumer asserts and the provider declares. Nothing reads across the boundary
      // to resolve it, so the disagreement is checked rather than discovered — and only a
      // report that sees the whole library can check it.
      const result = await runAnalyzer({
        formLabel: { anatomy: { label: { type: 'text', role: 'label' } } },
        switchField: {
          anatomy: { formLabel: { type: 'instance', instanceOf: 'formLabel', role: ['label', 'errormessage'] } },
        },
      });
      expect(result!.findings!.map((f) => f.kind)).toEqual(['routed-concept-not-provided']);
      expect(result!.findings![0].detail).toContain('errormessage');
      expect(result!.findings![0].detail).toContain('formLabel');
    });

    it('does not count a routed concept as something the consumer provides', async () => {
      // Routing a concept onward is not ascribing it. If it were, a chain of wrappers
      // would each appear to provide a part none of them emits.
      const result = await runAnalyzer({
        inner: { anatomy: { label: { type: 'text', role: 'label' } } },
        middle: { anatomy: { inner: { type: 'instance', instanceOf: 'inner', role: 'label' } } },
        outer: { anatomy: { middle: { type: 'instance', instanceOf: 'middle', role: 'label' } } },
      });
      expect(result!.findings!.map((f) => f.kind)).toEqual(['routed-concept-not-provided']);
      expect(result!.findings![0].component).toBe('outer');
    });

    it('stays quiet when the provider is not part of this run', async () => {
      // A spec may reference a component the run did not include. Reporting that as a
      // disagreement would make a scoped run look like a broken library.
      const result = await runAnalyzer({
        switchField: {
          anatomy: { formLabel: { type: 'instance', instanceOf: 'formLabel', role: 'label' } },
        },
      });
      expect(result!.summary.findings).toBe(0);
    });

    it('stays quiet when instanceOf is a $ref into the spec\'s own subcomponents', async () => {
      // A $ref points inside this spec, not at another component's declaration, so there
      // is no provider in the run to check against.
      const result = await runAnalyzer({
        switchField: {
          anatomy: {
            formLabel: { type: 'instance', instanceOf: { $ref: '#/subcomponents/formLabel' }, role: 'label' },
          },
        },
      });
      expect(result!.summary.findings).toBe(0);
    });
  });

  it('writes nothing when the run had no components', async () => {
    expect(await runAnalyzer({})).toBeNull();
  });
});
