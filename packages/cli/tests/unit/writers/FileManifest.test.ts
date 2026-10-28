import { describe, it, expect } from 'vitest';
import { FileManifest } from '../../../src/writers/FileManifest.js';
import type { OutputConfig } from '../../../src/writers/outputConfig.js';

describe('FileManifest', () => {
  const mockComponents = [
    {
      name: 'Button',
      spec: {
        title: 'Button',
        anatomy: { root: { type: 'container' } },
        props: [{ id: 'variant', type: 'variant', options: ['primary', 'secondary'] }],
        default: { name: 'variant=primary', layout: [], elements: {} },
        variants: [{ name: 'variant=secondary', elements: {} }],
        metadata: { plugin: { version: 6 } }
      }
    },
    {
      name: 'Alert',
      spec: {
        title: 'Alert',
        anatomy: { root: { type: 'container' } },
        props: [{ id: 'type', type: 'variant', options: ['info', 'warning'] }],
        default: { name: 'type=info', layout: [], elements: {} },
        variants: [{ name: 'type=warning', elements: {} }],
        metadata: { plugin: { version: 6 } }
      }
    }
  ];

  describe('single-file mode', () => {
    it('should create one entry with all components', () => {
      const config: OutputConfig = {
        splitComponents: false,
        splitConcerns: false,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output', 'library.yaml');

      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].path).toBe('library.yaml');
      expect(manifest.entries[0].content).toHaveProperty('components');
      expect(manifest.entries[0].content.components).toHaveProperty('button');
      expect(manifest.entries[0].content.components).toHaveProperty('alert');
    });

    it('should use camelCase for component keys', () => {
      const config: OutputConfig = {
        splitComponents: false,
        splitConcerns: false,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output', 'library.yaml');
      const components = manifest.entries[0].content.components;

      expect(components).toHaveProperty('button');
      expect(components).toHaveProperty('alert');
      expect(components).not.toHaveProperty('Button');
      expect(components).not.toHaveProperty('Alert');
    });
  });

  describe('per-component mode (flat)', () => {
    it('should create separate entries for each component', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: false,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(2);
      expect(manifest.entries[0].path).toContain('alert.yaml');
      expect(manifest.entries[1].path).toContain('button.yaml');
    });

    it('should include complete component data in each file', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: false,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');
      const buttonEntry = manifest.entries.find(e => e.path.includes('button'));

      expect(buttonEntry).toBeDefined();
      expect(buttonEntry!.content).toHaveProperty('title', 'Button');
      expect(buttonEntry!.content).toHaveProperty('anatomy');
      expect(buttonEntry!.content).toHaveProperty('props');
      expect(buttonEntry!.content).toHaveProperty('default');
      expect(buttonEntry!.content).toHaveProperty('variants');
    });
  });

  describe('per-component mode (subfolders)', () => {
    it('should create component directories', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: false,
        useSubfolders: true,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(2);
      expect(manifest.entries[0].path).toMatch(/alert\/alert\.yaml$/);
      expect(manifest.entries[1].path).toMatch(/button\/button\.yaml$/);
    });
  });

  describe('per-concern mode', () => {
    it('should create two entries (api and variants)', () => {
      const config: OutputConfig = {
        splitComponents: false,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(2);

      const apiEntry = manifest.entries.find(e => e.path.includes('api.yaml'));
      const variantsEntry = manifest.entries.find(e => e.path.includes('variants.yaml'));

      expect(apiEntry).toBeDefined();
      expect(variantsEntry).toBeDefined();
    });

    it('should separate API and Variants concerns correctly', () => {
      const config: OutputConfig = {
        splitComponents: false,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      const apiEntry = manifest.entries.find(e => e.path.includes('api.yaml'))!;
      const variantsEntry = manifest.entries.find(e => e.path.includes('variants.yaml'))!;

      // API file should have anatomy and props, not default/variants
      expect((apiEntry.content.components as Record<string, unknown>).button).toHaveProperty('title');
      expect((apiEntry.content.components as Record<string, unknown>).button).toHaveProperty('anatomy');
      expect((apiEntry.content.components as Record<string, unknown>).button).toHaveProperty('props');
      expect((apiEntry.content.components as Record<string, unknown>).button).not.toHaveProperty('default');
      expect((apiEntry.content.components as Record<string, unknown>).button).not.toHaveProperty('variants');

      // Variants file should have default/variants, not anatomy/props
      expect((variantsEntry.content.components as Record<string, unknown>).button).toHaveProperty('default');
      expect((variantsEntry.content.components as Record<string, unknown>).button).toHaveProperty('variants');
      expect((variantsEntry.content.components as Record<string, unknown>).button).not.toHaveProperty('anatomy');
      expect((variantsEntry.content.components as Record<string, unknown>).button).not.toHaveProperty('props');
    });

    it('should include metadata in both concern files', () => {
      const config: OutputConfig = {
        splitComponents: false,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      const apiEntry = manifest.entries.find(e => e.path.includes('api.yaml'))!;
      const variantsEntry = manifest.entries.find(e => e.path.includes('variants.yaml'))!;

      expect(apiEntry.content).toHaveProperty('metadata');
      expect(apiEntry.content.metadata).toHaveProperty('componentCount', 2);
      expect(apiEntry.content.metadata).toHaveProperty('concern', 'api');
      expect(apiEntry.content.metadata).toHaveProperty('lastUpdated');

      expect(variantsEntry.content).toHaveProperty('metadata');
      expect(variantsEntry.content.metadata).toHaveProperty('componentCount', 2);
      expect(variantsEntry.content.metadata).toHaveProperty('concern', 'variants');
      expect(variantsEntry.content.metadata).toHaveProperty('lastUpdated');
    });
  });

  describe('per-concern mode — examples concern', () => {
    const withExamples = [
      ...mockComponents,
      {
        name: 'Toast',
        spec: {
          title: 'Toast',
          anatomy: { root: { type: 'container' } },
          props: [],
          default: { name: 'default', layout: [], elements: {} },
          variants: [],
          slotContentExamples: { toast__children: { layout: [] } },
          instanceExamples: { toastDefault: { propConfigurations: {} } },
          metadata: { plugin: { version: 6 } }
        }
      }
    ];

    it('emits a third examples.yaml when any component has examples', () => {
      const config: OutputConfig = {
        splitComponents: false, splitConcerns: true, useSubfolders: false, defaultFormat: 'yaml'
      };
      const manifest = new FileManifest(withExamples, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(3);
      const examplesEntry = manifest.entries.find(e => e.path.includes('examples.yaml'))!;
      expect(examplesEntry).toBeDefined();

      const comps = examplesEntry.content.components as Record<string, any>;
      // Only the component with examples is present
      expect(Object.keys(comps)).toEqual(['toast']);
      expect(comps.toast.slotContentExamples).toEqual({ toast__children: { layout: [] } });
      expect(comps.toast.instanceExamples).toEqual({ toastDefault: { propConfigurations: {} } });
      expect(examplesEntry.content.metadata).toMatchObject({ concern: 'examples', componentCount: 1 });
    });

    it('does NOT emit examples.yaml when no component has examples', () => {
      const config: OutputConfig = {
        splitComponents: false, splitConcerns: true, useSubfolders: false, defaultFormat: 'yaml'
      };
      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(2);
      expect(manifest.entries.find(e => e.path.includes('examples.yaml'))).toBeUndefined();
    });

    it('keeps example fields out of api.yaml and variants.yaml', () => {
      const config: OutputConfig = {
        splitComponents: false, splitConcerns: true, useSubfolders: false, defaultFormat: 'yaml'
      };
      const manifest = new FileManifest(withExamples, config, '/tmp/output');

      const api = (manifest.entries.find(e => e.path.includes('api.yaml'))!.content.components as Record<string, any>).toast;
      const variants = (manifest.entries.find(e => e.path.includes('variants.yaml'))!.content.components as Record<string, any>).toast;
      expect(api.slotContentExamples).toBeUndefined();
      expect(api.instanceExamples).toBeUndefined();
      expect(variants.slotContentExamples).toBeUndefined();
      expect(variants.instanceExamples).toBeUndefined();
    });

    it('combined mode emits examples.yaml only for components that have examples', () => {
      const config: OutputConfig = {
        splitComponents: true, splitConcerns: true, useSubfolders: false, defaultFormat: 'yaml'
      };
      const manifest = new FileManifest(withExamples, config, '/tmp/output');

      // 3 components × 2 base concerns + 1 examples file (Toast only) = 7
      expect(manifest.entries).toHaveLength(7);
      expect(manifest.entries.find(e => /toast\/examples\.yaml$/.test(e.path))).toBeDefined();
      expect(manifest.entries.find(e => /button\/examples\.yaml$/.test(e.path))).toBeUndefined();
    });
  });

  describe('combined mode', () => {
    it('should create component directories with concern files', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries).toHaveLength(4); // 2 components x 2 concerns

      const buttonApi = manifest.entries.find(e => e.path.includes('button') && e.path.includes('api'));
      const buttonVariants = manifest.entries.find(e => e.path.includes('button') && e.path.includes('variants'));
      const alertApi = manifest.entries.find(e => e.path.includes('alert') && e.path.includes('api'));
      const alertVariants = manifest.entries.find(e => e.path.includes('alert') && e.path.includes('variants'));

      expect(buttonApi).toBeDefined();
      expect(buttonVariants).toBeDefined();
      expect(alertApi).toBeDefined();
      expect(alertVariants).toBeDefined();
    });

    it('should structure paths as component/concern.yaml', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      expect(manifest.entries[0].path).toMatch(/alert\/api\.yaml$/);
      expect(manifest.entries[1].path).toMatch(/alert\/variants\.yaml$/);
      expect(manifest.entries[2].path).toMatch(/button\/api\.yaml$/);
      expect(manifest.entries[3].path).toMatch(/button\/variants\.yaml$/);
    });

    it('should include individual component data in each concern file', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockComponents, config, '/tmp/output');

      const buttonApi = manifest.entries.find(e => e.path.includes('button/api'))!;

      // Should have API data for Button only, not wrapped in components
      expect(buttonApi.content).toHaveProperty('title', 'Button');
      expect(buttonApi.content).toHaveProperty('anatomy');
      expect(buttonApi.content).toHaveProperty('props');
      expect(buttonApi.content).not.toHaveProperty('components');
      expect(buttonApi.content).not.toHaveProperty('default');
      expect(buttonApi.content).not.toHaveProperty('variants');
    });
  });

  describe('combined mode — composition kind (ADR-109)', () => {
    const mockCompositions = [
      {
        name: 'Search Results',
        spec: {
          title: 'Search Results',
          description: 'Search results with filter sidebar',
          anatomy: { root: { type: 'container' } },
          elements: { root: {} },
          layout: ['root'],
          metadata: { plugin: { version: 6 } }
        }
      }
    ];

    it('writes api.yaml with no props key, unlike a component', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockCompositions, config, '/tmp/output', undefined, undefined, 'composition');
      const api = manifest.entries.find(e => e.path.includes('api'))!;

      expect(api.content).toHaveProperty('title', 'Search Results');
      expect(api.content).toHaveProperty('description');
      expect(api.content).toHaveProperty('anatomy');
      expect(api.content).not.toHaveProperty('props');
      expect(api.content).not.toHaveProperty('invalidPropCombinations');
      expect(api.content).not.toHaveProperty('subcomponents');
    });

    it('writes variants.yaml with elements/layout, not default/variants', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockCompositions, config, '/tmp/output', undefined, undefined, 'composition');
      const variants = manifest.entries.find(e => e.path.includes('variants'))!;

      expect(variants.content).toHaveProperty('elements');
      expect(variants.content).toHaveProperty('layout');
      expect(variants.content).not.toHaveProperty('default');
      expect(variants.content).not.toHaveProperty('variants');
    });

    it('omits examples.yaml when the composition has no slotContent', () => {
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(mockCompositions, config, '/tmp/output', undefined, undefined, 'composition');
      expect(manifest.entries.find(e => e.path.includes('examples'))).toBeUndefined();
    });

    it('writes examples.yaml under slotContent, not slotContentExamples, when present', () => {
      const withSlotContent = [{
        name: 'Search Results',
        spec: {
          ...mockCompositions[0].spec,
          slotContent: { cardHeader: { anatomy: {}, elements: {}, layout: [] } }
        }
      }];
      const config: OutputConfig = {
        splitComponents: true,
        splitConcerns: true,
        useSubfolders: false,
        defaultFormat: 'yaml'
      };

      const manifest = new FileManifest(withSlotContent, config, '/tmp/output', undefined, undefined, 'composition');
      const examples = manifest.entries.find(e => e.path.includes('examples'))!;

      expect(examples.content).toHaveProperty('slotContent');
      expect(examples.content).not.toHaveProperty('slotContentExamples');
    });
  });
});
