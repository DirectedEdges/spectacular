import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { DependenciesAnalyzer } from '../../../src/analyze/Dependencies.js';

// Fixture library: dsIcon (leaf) ← dsButton ← dsCard (chain), so a change to
// dsIcon impacts dsButton directly and dsCard at depth 2.
const ICON = {
  title: 'DS Icon',
  anatomy: { root: { type: 'container' }, glyph: { type: 'glyph' } },
  props: {
    glyph: { type: 'string', default: 'check' },
    size: { type: 'string', default: 'Medium', enum: ['Small', 'Medium', 'Large'] },
    appearance: { type: 'string', default: 'Default', enum: ['Default', 'Subtle'] },
  },
  default: { elements: { root: { styles: {} } } },
};

const BUTTON = {
  title: 'DS Button',
  anatomy: {
    root: { type: 'container' },
    startIcon: { type: 'instance', instanceOf: 'dsIcon' },
    label: { type: 'text' },
  },
  props: {
    label: { type: 'string' },
    size: { type: 'string', default: 'Medium', enum: ['Small', 'Medium'] },
  },
  default: {
    elements: {
      startIcon: { propConfigurations: { size: 'Small', glyph: 'check' } },
    },
  },
  variants: [
    {
      configuration: { size: 'Small' },
      elements: {
        startIcon: { instanceOf: 'dsIcon', propConfigurations: { size: 'Small' } },
      },
    },
  ],
};

const CARD = {
  title: 'DS Card',
  anatomy: {
    root: { type: 'container' },
    action: { type: 'instance', instanceOf: 'dsButton' },
  },
  props: { elevated: { type: 'boolean', default: false } },
  default: {
    elements: {
      action: { propConfigurations: { size: 'Medium', label: '{Action}' } },
    },
  },
};

function makeContext(dir: string, componentKey: string, outputFormat: 'JSON' | 'YAML' = 'JSON') {
  return { specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir, kind: 'component' as const, componentKey, outputFormat, tokensFormat: 'DEFAULT' };
}

describe('DependenciesAnalyzer', () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deps-test-'));
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  async function runAll(
    specs: Record<string, Record<string, unknown>>,
    outputFormat: 'JSON' | 'YAML' = 'JSON'
  ) {
    const analyzer = new DependenciesAnalyzer();
    for (const [key, spec] of Object.entries(specs)) {
      const dir = path.join(outputDir, key);
      await fs.ensureDir(dir);
      await analyzer.run(spec, makeContext(dir, key, outputFormat));
    }
    await analyzer.finalize!(outputDir);
    const ext = outputFormat === 'YAML' ? 'yaml' : 'json';
    const parse = outputFormat === 'YAML' ? (s: string) => yaml.parse(s) : (s: string) => JSON.parse(s);
    const graph = parse(await fs.readFile(path.join(outputDir, 'analysis', `dependencies.graph.${ext}`), 'utf-8'));
    const byComponent = parse(await fs.readFile(path.join(outputDir, 'analysis', `dependencies.byComponent.${ext}`), 'utf-8'));
    return { graph, byComponent };
  }

  it('has name "dependencies"', () => {
    expect(new DependenciesAnalyzer().name).toBe('dependencies');
  });

  it('does nothing when no components were processed', async () => {
    const analyzer = new DependenciesAnalyzer();
    await analyzer.finalize!(outputDir);
    expect(fs.existsSync(path.join(outputDir, 'analysis'))).toBe(false);
  });

  describe('instance edges and blast radius', () => {
    it('emits an instance edge from anatomy instanceOf', async () => {
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON });
      const edge = graph.edges.find((e: { from: string; to: string }) => e.from === 'dsButton' && e.to === 'dsIcon');
      expect(edge).toBeDefined();
      expect(edge.kind).toBe('instance');
      expect(edge.elements).toEqual(['startIcon']);
      expect(edge.count).toBe(1);
    });

    it('computes direct and transitive dependents with min depth', async () => {
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(byComponent.dsIcon.directDependents).toEqual(['dsButton']);
      expect(byComponent.dsIcon.transitiveDependents).toEqual({ dsCard: 2 });
    });

    it('computes direct and transitive dependencies', async () => {
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(byComponent.dsCard.directDependencies).toEqual(['dsButton']);
      expect(byComponent.dsCard.transitiveDependencies).toEqual({ dsIcon: 2 });
      expect(byComponent.dsIcon.directDependencies).toEqual([]);
    });

    it('identifies roots and leaves', async () => {
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(graph.summary.roots).toEqual(['dsCard']);
      expect(graph.summary.leaves).toEqual(['dsIcon']);
    });

    it('counts node degrees over instance edges', async () => {
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(graph.nodes.dsButton).toMatchObject({ external: false, dependsOn: 1, dependedOnBy: 1 });
      expect(graph.nodes.dsButton.byKind.instance).toEqual({ dependsOn: 1, dependedOnBy: 1 });
      expect(graph.nodes.dsIcon.dependedOnBy).toBe(1);
      expect(graph.nodes.dsIcon.dependsOn).toBe(0);
    });

    it('reports no cycles for an acyclic library', async () => {
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(graph.summary.cycles).toEqual([]);
    });

    it('reports mutual dependencies as a cycle', async () => {
      const a = {
        anatomy: { child: { type: 'instance', instanceOf: 'compB' } },
        default: { elements: {} },
      };
      const b = {
        anatomy: { child: { type: 'instance', instanceOf: 'compA' } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ compA: a, compB: b });
      expect(graph.summary.cycles).toEqual([['compA', 'compB']]);
    });

    it('reports a self-referencing component as a cycle', async () => {
      const recursive = {
        anatomy: { nested: { type: 'instance', instanceOf: 'dsMenu' } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsMenu: recursive });
      expect(graph.summary.cycles).toEqual([['dsMenu']]);
    });

    it('deduplicates repeated instances into one edge with all elements', async () => {
      const twoIcons = {
        anatomy: {
          startIcon: { type: 'instance', instanceOf: 'dsIcon' },
          endIcon: { type: 'instance', instanceOf: 'dsIcon' },
        },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsChip: twoIcons });
      const edges = graph.edges.filter((e: { from: string }) => e.from === 'dsChip');
      expect(edges).toHaveLength(1);
      expect(edges[0].elements).toEqual(['endIcon', 'startIcon']);
      expect(edges[0].count).toBe(2);
    });
  });

  describe('external references', () => {
    it('flags unmatched instanceOf targets as external nodes', async () => {
      const withExternal = {
        anatomy: { logo: { type: 'instance', instanceOf: 'Third Party Logo' } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsHeader: withExternal });
      expect(graph.nodes['Third Party Logo']).toMatchObject({ external: true, dependsOn: 0, dependedOnBy: 1 });
      expect(graph.summary.externals).toBe(1);
    });

    it('resolves name variants via normalization instead of creating externals', async () => {
      const withSpacedName = {
        anatomy: { icon: { type: 'instance', instanceOf: 'DS Icon' } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsBadge: withSpacedName });
      expect(graph.summary.externals).toBe(0);
      const edge = graph.edges.find((e: { from: string }) => e.from === 'dsBadge');
      expect(edge.to).toBe('dsIcon');
    });

    it('lists externals in dependency lists but not in byComponent keys', async () => {
      const withExternal = {
        anatomy: { logo: { type: 'instance', instanceOf: 'Third Party Logo' } },
        default: { elements: {} },
      };
      const { byComponent } = await runAll({ dsHeader: withExternal });
      expect(byComponent.dsHeader.directDependencies).toEqual(['Third Party Logo']);
      expect(byComponent['Third Party Logo']).toBeUndefined();
    });

    it('ignores the (unresolved instance) sentinel in anyOf and instanceOf', async () => {
      const withSentinel = {
        anatomy: { mystery: { type: 'instance', instanceOf: '(unresolved instance)' } },
        props: { items: { type: 'slot', anyOf: ['(unresolved instance)', 'dsIcon'] } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsList: withSentinel });
      expect(graph.nodes['(unresolved instance)']).toBeUndefined();
      expect(graph.summary.externals).toBe(0);
      const slotEdge = graph.edges.find((e: { kind: string }) => e.kind === 'slot');
      expect(slotEdge.to).toBe('dsIcon');
    });

    it('excludes external nodes from roots and leaves', async () => {
      const withExternal = {
        anatomy: { logo: { type: 'instance', instanceOf: 'Third Party Logo' } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsHeader: withExternal });
      expect(graph.summary.roots).toEqual(['dsHeader']);
      expect(graph.summary.leaves).toEqual([]);
    });
  });

  describe('slot and example edges', () => {
    it('emits slot edges from slot prop anyOf constraints', async () => {
      const toolbar = {
        anatomy: { root: { type: 'container' } },
        props: { items: { type: 'slot', anyOf: ['dsIcon', 'dsButton'] } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsToolbar: toolbar });
      const slotEdges = graph.edges.filter((e: { kind: string; from: string }) => e.kind === 'slot' && e.from === 'dsToolbar');
      expect(slotEdges.map((e: { to: string }) => e.to).sort()).toEqual(['dsButton', 'dsIcon']);
      expect(slotEdges[0].slots).toEqual(['items']);
    });

    it('counts a slot relationship toward the node degrees', async () => {
      // Counting instance edges only left a component related through nothing
      // but a slot reading as entirely unconnected.
      const toolbar = {
        anatomy: { root: { type: 'container' } },
        props: { items: { type: 'slot', anyOf: ['dsIcon'] } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsToolbar: toolbar });

      expect(graph.nodes.dsToolbar.dependsOn).toBe(1);
      expect(graph.nodes.dsToolbar.byKind.slot.dependsOn).toBe(1);
      expect(graph.nodes.dsIcon.dependedOnBy).toBe(1);
      expect(graph.nodes.dsIcon.byKind.slot.dependedOnBy).toBe(1);
    });

    it('keeps the roots and leaves lists disjoint', async () => {
      // A root is depended on by nothing and a leaf depends on nothing, so a
      // component cannot be both — it previously was, because the counts behind
      // the two lists ignored slot relationships.
      const toolbar = {
        anatomy: { root: { type: 'container' } },
        props: { items: { type: 'slot', anyOf: ['dsIcon'] } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsToolbar: toolbar });
      const both = graph.summary.roots.filter((id: string) => graph.summary.leaves.includes(id));

      expect(both).toEqual([]);
      expect(graph.summary.roots).toContain('dsToolbar');
      expect(graph.summary.leaves).toContain('dsIcon');
    });

    it('holds an unconnected component apart rather than listing it as both', async () => {
      const alone = { anatomy: { root: { type: 'container' } }, default: { elements: {} } };
      const { graph } = await runAll({ dsDivider: alone });

      expect(graph.summary.isolated).toEqual(['dsDivider']);
      expect(graph.summary.roots).not.toContain('dsDivider');
      expect(graph.summary.leaves).not.toContain('dsDivider');
    });

    it('describes the same edge set in the summary totals and the node counts', async () => {
      const toolbar = {
        anatomy: { icon: { type: 'instance', instanceOf: 'dsIcon' } },
        props: { items: { type: 'slot', anyOf: ['dsButton'] } },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsToolbar: toolbar });

      const summaryTotal = Object.values(graph.summary.edges as Record<string, number>)
        .reduce((a, b) => a + b, 0);
      const nodeTotal = Object.values(graph.nodes as Record<string, { byKind: Record<string, { dependsOn: number }> }>)
        .flatMap(n => Object.values(n.byKind).map(k => k.dependsOn))
        .reduce((a, b) => a + b, 0);

      expect(nodeTotal).toBe(summaryTotal);
    });

    it('emits example edges from slotContentExamples', async () => {
      const dialog = {
        anatomy: { root: { type: 'container' } },
        default: { elements: {} },
        slotContentExamples: {
          actions__default: {
            anatomy: { action1: { type: 'instance', instanceOf: 'dsButton' } },
            elements: {
              action1: { instanceOf: 'dsButton', propConfigurations: { size: 'Small' } },
            },
            layout: ['action1'],
          },
        },
      };
      const { graph } = await runAll({ dsButton: BUTTON, dsIcon: ICON, dsDialog: dialog });
      const edge = graph.edges.find((e: { kind: string; from: string }) => e.kind === 'example' && e.from === 'dsDialog');
      expect(edge.to).toBe('dsButton');
      expect(edge.examples).toEqual(['actions__default']);
    });

    it('excludes slot and example edges from blast-radius closure', async () => {
      const toolbar = {
        anatomy: { root: { type: 'container' } },
        props: { items: { type: 'slot', anyOf: ['dsIcon'] } },
        default: { elements: {} },
      };
      const { byComponent } = await runAll({ dsIcon: ICON, dsToolbar: toolbar });
      expect(byComponent.dsIcon.directDependents).toEqual([]);
      expect(byComponent.dsIcon.contractDependents).toEqual(['dsToolbar']);
      expect(byComponent.dsToolbar.contractDependencies).toEqual(['dsIcon']);
    });

    it('omits a contract dependent that is already a direct structural dependent', async () => {
      const both = {
        anatomy: { icon: { type: 'instance', instanceOf: 'dsIcon' } },
        props: { extra: { type: 'slot', anyOf: ['dsIcon'] } },
        default: { elements: {} },
      };
      const { byComponent } = await runAll({ dsIcon: ICON, dsChip: both });
      expect(byComponent.dsIcon.directDependents).toEqual(['dsChip']);
      expect(byComponent.dsIcon.contractDependents).toEqual([]);
    });

    it('collects slot edges from subcomponent props', async () => {
      const tabs = {
        anatomy: { root: { type: 'container' } },
        subcomponents: {
          tab: { props: { content: { type: 'slot', anyOf: ['dsIcon'] } } },
        },
        default: { elements: {} },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsTabs: tabs });
      const edge = graph.edges.find((e: { kind: string; from: string }) => e.kind === 'slot' && e.from === 'dsTabs');
      expect(edge.to).toBe('dsIcon');
    });
  });

  describe('subcomponent collapse', () => {
    it('attributes subcomponent instances to the parent and drops internal $ref targets', async () => {
      const checkbox = {
        anatomy: {
          root: { type: 'container' },
          control: { type: 'instance', instanceOf: { $ref: '#/subcomponents/control' } },
        },
        subcomponents: {
          control: {
            anatomy: { indicator: { type: 'instance', instanceOf: 'dsIcon' } },
          },
        },
        default: { elements: {} },
      };
      const { graph, byComponent } = await runAll({ dsIcon: ICON, dsCheckbox: checkbox });
      const edge = graph.edges.find((e: { from: string }) => e.from === 'dsCheckbox');
      expect(edge.to).toBe('dsIcon');
      expect(Object.keys(graph.nodes)).not.toContain('dsCheckbox.control');
      expect(byComponent.dsIcon.directDependents).toEqual(['dsCheckbox']);
    });

    it('collects usage sites from subcomponent variant elements', async () => {
      const checkbox = {
        anatomy: { root: { type: 'container' } },
        subcomponents: {
          control: { anatomy: { indicator: { type: 'instance', instanceOf: 'dsIcon' } } },
        },
        default: { elements: {} },
        // Split-source shape: variants nested under subcomponents.
      };
      const variantsSource = {
        default: { elements: {} },
        subcomponents: {
          control: {
            default: {
              elements: {
                indicator: { instanceOf: 'dsIcon', propConfigurations: { size: 'Small' } },
              },
            },
          },
        },
      };
      const analyzer = new DependenciesAnalyzer();
      const iconDir = path.join(outputDir, 'dsIcon');
      const checkboxDir = path.join(outputDir, 'dsCheckbox');
      await fs.ensureDir(iconDir);
      await fs.ensureDir(checkboxDir);
      await fs.writeFile(path.join(checkboxDir, 'variants.yaml'), yaml.stringify(variantsSource), 'utf-8');
      await analyzer.run(ICON, makeContext(iconDir, 'dsIcon'));
      await analyzer.run(checkbox, makeContext(checkboxDir, 'dsCheckbox'));
      await analyzer.finalize!(outputDir);
      const byComponent = JSON.parse(
        await fs.readFile(path.join(outputDir, 'analysis', 'dependencies.byComponent.json'), 'utf-8')
      );
      expect(byComponent.dsIcon.propUsage.size.configuredBy).toBe(1);
      expect(byComponent.dsIcon.propUsage.size.values).toEqual({ Small: ['dsCheckbox'] });
    });
  });

  describe('prop usage', () => {
    it('records one usage site per object-prop member (ADR-111)', async () => {
      const icon = structuredClone(ICON) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      icon.props.margin = {
        type: 'object',
        members: {
          compact: { type: 'string', default: 'None', enum: ['None', 'Tight'], nullable: false },
          expanded: { type: 'string', default: 'Loose', enum: ['None', 'Loose'], nullable: false },
        },
      };
      const button = structuredClone(BUTTON) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      button.default.elements.startIcon.propConfigurations = {
        ...button.default.elements.startIcon.propConfigurations,
        // A null member leaves that member untouched and records nothing.
        margin: { compact: 'Tight', expanded: null },
      };
      const { byComponent } = await runAll({ dsIcon: icon, dsButton: button });
      expect(byComponent.dsIcon.propUsage['margin.compact'].values).toEqual({ Tight: ['dsButton'] });
      expect(byComponent.dsIcon.propUsage['margin.expanded']).toBeUndefined();
      // The member object itself never lands as a bare, unreadable row.
      expect(byComponent.dsIcon.propUsage.margin?.values ?? {}).toEqual({});
    });

    it('aggregates configured values with their consumers', async () => {
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: CARD });
      expect(byComponent.dsIcon.propUsage.size.values).toEqual({ Small: ['dsButton'] });
      expect(byComponent.dsIcon.propUsage.glyph.values).toEqual({ check: ['dsButton'] });
    });

    it('counts each configuration site separately', async () => {
      // BUTTON configures startIcon.size in default and in one variant → 2 sites.
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON });
      expect(byComponent.dsIcon.propUsage.size.configuredBy).toBe(2);
    });

    it('reports declared props never configured with zero usage', async () => {
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON });
      expect(byComponent.dsIcon.propUsage.appearance).toEqual({ configuredBy: 0, consumers: {}, values: {} });
    });

    it('breaks down usage per consumer by default and variant sites', async () => {
      // BUTTON configures startIcon.size in its default and in one variant.
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON });
      expect(byComponent.dsIcon.propUsage.size.consumers).toEqual({
        dsButton: { default: 1, variants: 1, examples: 0, values: { Small: 2 } },
      });
      expect(byComponent.dsIcon.propUsage.glyph.consumers).toEqual({
        dsButton: { default: 1, variants: 0, examples: 0, values: { check: 1 } },
      });
    });

    it('attributes slotContentExamples configuration sites to examples', async () => {
      const dialog = {
        anatomy: { root: { type: 'container' } },
        default: { elements: {} },
        slotContentExamples: {
          actions: {
            anatomy: { action1: { type: 'instance', instanceOf: 'dsButton' } },
            elements: {
              action1: { instanceOf: 'dsButton', propConfigurations: { size: 'Small' } },
            },
            layout: ['action1'],
          },
        },
      };
      const { byComponent } = await runAll({ dsButton: BUTTON, dsIcon: ICON, dsDialog: dialog });
      expect(byComponent.dsButton.propUsage.size.consumers.dsDialog).toEqual({
        default: 0, variants: 0, examples: 1, values: { Small: 1 },
      });
    });

    it('records prop bindings as $binding markers', async () => {
      const withBinding = {
        anatomy: { icon: { type: 'instance', instanceOf: 'dsIcon' } },
        props: { iconName: { type: 'string' } },
        default: {
          elements: {
            icon: { propConfigurations: { glyph: { $binding: '#/props/iconName' } } },
          },
        },
      };
      const { byComponent } = await runAll({ dsIcon: ICON, dsField: withBinding });
      expect(byComponent.dsIcon.propUsage.glyph.values).toEqual({ '$binding:iconName': ['dsField'] });
    });

    it('records slot fills as $slotContent markers', async () => {
      const withSlotFill = {
        anatomy: { action: { type: 'instance', instanceOf: 'dsButton' } },
        default: {
          elements: {
            action: {
              propConfigurations: {
                children: { $slotContent: '#/components/dsButton/slotContentExamples/composedLabel' },
              },
            },
          },
        },
      };
      const { byComponent } = await runAll({ dsButton: BUTTON, dsIcon: ICON, dsBar: withSlotFill });
      expect(byComponent.dsButton.propUsage.children.values).toEqual({ '$slotContent:composedLabel': ['dsBar'] });
    });

    it('resolves $nested paths to the terminal component', async () => {
      // dsCard configures its action (dsButton) whose startIcon (dsIcon) gets size: Large.
      const cardWithNested = {
        anatomy: { action: { type: 'instance', instanceOf: 'dsButton' } },
        default: {
          elements: {
            action: {
              propConfigurations: {
                size: 'Medium',
                $nested: [{ path: ['startIcon'], size: 'Large' }],
              },
            },
          },
        },
      };
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: cardWithNested });
      expect(byComponent.dsIcon.propUsage.size.values.Large).toEqual(['dsCard']);
    });

    it('drops $nested paths that cannot be resolved', async () => {
      const cardWithBadPath = {
        anatomy: { action: { type: 'instance', instanceOf: 'dsButton' } },
        default: {
          elements: {
            action: { propConfigurations: { $nested: [{ path: ['noSuchElement'], size: 'Large' }] } },
          },
        },
      };
      const { byComponent } = await runAll({ dsIcon: ICON, dsButton: BUTTON, dsCard: cardWithBadPath });
      expect(byComponent.dsIcon.propUsage.size.values.Large).toBeUndefined();
    });

    it('does not attribute usage to external components', async () => {
      const withExternal = {
        anatomy: { logo: { type: 'instance', instanceOf: 'Third Party Logo' } },
        default: {
          elements: { logo: { propConfigurations: { size: 'Small' } } },
        },
      };
      const { byComponent } = await runAll({ dsHeader: withExternal });
      expect(byComponent['Third Party Logo']).toBeUndefined();
    });
  });

  describe('instance swaps', () => {
    it('emits instance edges for swap-bound enum values matching known components', async () => {
      const withSwap = {
        anatomy: { visual: { type: 'instance', instanceOf: { $binding: '#/props/visual' } } },
        props: { visual: { type: 'string', default: 'dsIcon', enum: ['dsIcon', 'dsAvatar'] } },
        default: {
          elements: { visual: { instanceOf: { $binding: '#/props/visual' } } },
        },
      };
      const { graph } = await runAll({ dsIcon: ICON, dsListItem: withSwap });
      const edge = graph.edges.find((e: { from: string; to: string }) => e.from === 'dsListItem' && e.to === 'dsIcon');
      expect(edge).toBeDefined();
      expect(edge.kind).toBe('instance');
      // 'dsAvatar' is not a known component — swap candidates never create externals.
      expect(graph.nodes.dsAvatar).toBeUndefined();
    });
  });

  describe('split-concerns and formats', () => {
    it('reads variant elements from variants.yaml when present', async () => {
      const analyzer = new DependenciesAnalyzer();
      const iconDir = path.join(outputDir, 'dsIcon');
      const buttonDir = path.join(outputDir, 'dsButton');
      await fs.ensureDir(iconDir);
      await fs.ensureDir(buttonDir);
      const { default: defaultSection, variants, ...apiOnly } = BUTTON;
      await fs.writeFile(path.join(buttonDir, 'variants.yaml'), yaml.stringify({ default: defaultSection, variants }), 'utf-8');
      await analyzer.run(ICON, makeContext(iconDir, 'dsIcon'));
      await analyzer.run(apiOnly, makeContext(buttonDir, 'dsButton'));
      await analyzer.finalize!(outputDir);
      const byComponent = JSON.parse(
        await fs.readFile(path.join(outputDir, 'analysis', 'dependencies.byComponent.json'), 'utf-8')
      );
      expect(byComponent.dsIcon.propUsage.size.configuredBy).toBe(2);
    });

    it('reads slotContentExamples from examples.yaml when present', async () => {
      const analyzer = new DependenciesAnalyzer();
      const buttonDir = path.join(outputDir, 'dsButton');
      const dialogDir = path.join(outputDir, 'dsDialog');
      await fs.ensureDir(buttonDir);
      await fs.ensureDir(dialogDir);
      const examples = {
        slotContentExamples: {
          actions: {
            anatomy: { action1: { type: 'instance', instanceOf: 'dsButton' } },
            elements: { action1: { instanceOf: 'dsButton' } },
            layout: ['action1'],
          },
        },
      };
      await fs.writeFile(path.join(dialogDir, 'examples.yaml'), yaml.stringify(examples), 'utf-8');
      await analyzer.run(BUTTON, makeContext(buttonDir, 'dsButton'));
      await analyzer.run({ anatomy: {}, default: { elements: {} } }, makeContext(dialogDir, 'dsDialog'));
      await analyzer.finalize!(outputDir);
      const graph = JSON.parse(
        await fs.readFile(path.join(outputDir, 'analysis', 'dependencies.graph.json'), 'utf-8')
      );
      const edge = graph.edges.find((e: { kind: string }) => e.kind === 'example');
      expect(edge.from).toBe('dsDialog');
      expect(edge.to).toBe('dsButton');
    });

    it('writes yaml files when outputFormat is YAML', async () => {
      await runAll({ dsIcon: ICON, dsButton: BUTTON }, 'YAML');
      expect(fs.existsSync(path.join(outputDir, 'analysis', 'dependencies.graph.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'analysis', 'dependencies.graph.json'))).toBe(false);
    });

    it('writes output to a custom analysisDir when provided', async () => {
      const analyzer = new DependenciesAnalyzer();
      const iconDir = path.join(outputDir, 'dsIcon');
      await fs.ensureDir(iconDir);
      await analyzer.run(ICON, makeContext(iconDir, 'dsIcon'));
      const customDir = path.join(outputDir, 'custom-analysis');
      await analyzer.finalize!(outputDir, customDir);
      expect(fs.existsSync(path.join(customDir, 'dependencies.graph.json'))).toBe(true);
    });
  });

  describe('determinism', () => {
    it('produces identical output regardless of processing order', async () => {
      const specs = { dsIcon: ICON, dsButton: BUTTON, dsCard: CARD };
      const { graph: g1, byComponent: b1 } = await runAll(specs);
      await fs.remove(path.join(outputDir, 'analysis'));
      const analyzer = new DependenciesAnalyzer();
      for (const key of ['dsCard', 'dsIcon', 'dsButton']) {
        await analyzer.run(specs[key as keyof typeof specs], makeContext(path.join(outputDir, key), key));
      }
      await analyzer.finalize!(outputDir);
      const g2 = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis', 'dependencies.graph.json'), 'utf-8'));
      const b2 = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis', 'dependencies.byComponent.json'), 'utf-8'));
      expect(JSON.stringify(g2)).toBe(JSON.stringify(g1));
      expect(JSON.stringify(b2)).toBe(JSON.stringify(b1));
    });
  });
});
