import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const pro = { text: 'Pro', variant: 'tip' };
const experimental = { text: 'Experimental', variant: 'default' };

export default defineConfig({
  site: 'https://spectacular.systems',
  server: { port: 4323 },
  redirects: {
    // Page renamed when the glyphs convention outgrew the single name pattern (ADR-103)
    '/settings/glyph-name-pattern/': '/settings/glyphs/',
    // Retired — content merged into the schema overview
    '/schema/document-map/': '/schema/',
  },
  integrations: [
    starlight({
      title: 'Spectacular',
      description: 'Generate structured, machine-readable UI component specifications from Figma.',
      // Outlined paths, no webfont. Two files because Starlight renders the logo
      // as an <img>, which cannot inherit the page's text color: `light` carries
      // Starlight's light-theme ink, `dark` carries white.
      logo: {
        light: './src/assets/spectacular-light.svg',
        dark: './src/assets/spectacular-dark.svg',
        replacesTitle: true,
      },
      social: {
        github: 'https://github.com/DirectedEdges/spectacular',
      },
      components: {
        SocialIcons: './src/components/SocialIcons.astro',
        MobileMenuToggle: './src/components/MobileMenuToggle.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        Sidebar: './src/components/Sidebar.astro',
        PageFrame: './src/components/PageFrame.astro',
        Hero: './src/components/Hero.astro',
        Header: './src/components/Header.astro',
        PageTitle: './src/components/PageTitle.astro',
        Footer: './src/components/Footer.astro',
      },
      customCss: ['./src/custom.css'],
      head: [
        {
          tag: 'script',
          content: `
            // Exclusive accordion: only one top-level sidebar section open at a time.
            // Uses ul.top-level > li > details to target only top-level groups,
            // not nested subsections like Processing/Format/Include.
            document.addEventListener('DOMContentLoaded', () => {
              const tops = [...document.querySelectorAll('ul.top-level > li > details')];
              for (const d of tops) {
                d.querySelector(':scope > summary')?.addEventListener('click', () => {
                  requestAnimationFrame(() => {
                    if (!d.open) return;
                    for (const o of tops) {
                      if (o !== d && o.open) {
                        o.open = false;
                        const idx = o.querySelector('sl-sidebar-restore')?.dataset.index;
                        if (idx == null) continue;
                        try {
                          const k = 'sl-sidebar-state';
                          const s = JSON.parse(sessionStorage.getItem(k) || '{}');
                          if (Array.isArray(s.open)) {
                            s.open[parseInt(idx)] = false;
                            sessionStorage.setItem(k, JSON.stringify(s));
                          }
                        } catch {}
                      }
                    }
                  });
                });
              }
            });
          `,
        },
      ],
      sidebar: [
        { label: 'Introduction', slug: '' },
        { label: 'Getting Started', slug: 'cli/getting-started' },
        { label: 'Buy a Pro License', slug: 'overview/licensing' },
        {
          label: 'Schema',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'schema' },
            { label: 'Specification', slug: 'schema/specification' },
            { label: 'Decision Records (ADRs)', slug: 'adr' },
            {
              label: 'Parts',
              collapsed: true,
              items: [
                { label: 'Anatomy', slug: 'schema/anatomy' },
                { label: 'Children', slug: 'schema/children' },
                { label: 'Component', slug: 'schema/component' },
                { label: 'Composition', slug: 'schema/composition', badge: pro },
                { label: 'Conditional', slug: 'schema/conditional' },
                { label: 'Conventions', slug: 'schema/conventions' },
                { label: 'Settings', slug: 'schema/settings' },
                { label: 'Corners', slug: 'schema/corners' },
                { label: 'Effects', slug: 'schema/effects' },
                { label: 'Elements', slug: 'schema/elements' },
                { label: 'Gradient Value', slug: 'schema/gradient-value' },
                { label: 'Instance Examples', slug: 'schema/instance-examples', badge: pro },
                { label: 'Layout', slug: 'schema/layout' },
                { label: 'Metadata', slug: 'schema/metadata' },
                { label: 'Prop Binding', slug: 'schema/prop-binding', badge: pro },
                { label: 'Prop Configurations', slug: 'schema/prop-configurations' },
                { label: 'Props', slug: 'schema/props' },
                { label: 'Sides', slug: 'schema/sides' },
                { label: 'Slot Content', slug: 'schema/slot-content', badge: pro },
                { label: 'Slot Content Reference', slug: 'schema/slot-content-ref', badge: pro },
                { label: 'Styles', slug: 'schema/styles' },
                { label: 'Subcomponents', slug: 'schema/subcomponents', badge: pro },
                { label: 'Token Reference', slug: 'schema/token-reference', badge: pro },
                { label: 'Typography', slug: 'schema/typography' },
                { label: 'Variants', slug: 'schema/variants' },
              ],
            },
            {
              label: 'Documents',
              collapsed: true,
              items: [
                { label: 'Component API', slug: 'schema/documents/component-api' },
                { label: 'Component Variants', slug: 'schema/documents/component-variants' },
                { label: 'Component Examples', slug: 'schema/documents/component-examples' },
                { label: 'Composition API', slug: 'schema/documents/composition-api' },
                { label: 'Composition Variants', slug: 'schema/documents/composition-variants' },
                { label: 'Composition Examples', slug: 'schema/documents/composition-examples' },
              ],
            },
          ],
        },
        {
          label: 'Figma',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'plugin' },
            { label: 'Figma Best Practices', slug: 'plugin/best-practices' },
            {
              label: 'Sections',
              items: [
                { label: 'Anatomy', slug: 'plugin/anatomy' },
                { label: 'Props', slug: 'plugin/props' },
                { label: 'Layout', slug: 'plugin/layout' },
                { label: 'Modes', slug: 'plugin/modes' },
                { label: 'Styling', slug: 'plugin/styling' },
                { label: 'Data', slug: 'plugin/data' },
              ],
            },
            {
              label: 'Formatting',
              items: [
                { label: 'Multi-Column Layout', slug: 'plugin/multi-column-layout' },
                { label: 'Color', slug: 'plugin/color', badge: pro },
                { label: 'Dark Mode', slug: 'plugin/dark-mode', badge: pro },
                { label: 'Spacing', slug: 'plugin/spacing', badge: pro },
                { label: 'Text', slug: 'plugin/text', badge: pro },
              ],
            },
          ],
        },
        {
          label: 'Commands',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'cli' },
            { label: 'Workflows', slug: 'cli/workflows' },
            { label: 'init', slug: 'cli/commands/init' },
            { label: 'fetch', slug: 'cli/commands/fetch' },
            { label: 'scan', slug: 'cli/commands/scan' },
            { label: 'applyCustomTokens', slug: 'cli/commands/apply-custom-tokens' },
            { label: 'generate', slug: 'cli/commands/generate' },
            { label: 'build', slug: 'cli/commands/build' },
            { label: 'run', slug: 'cli/commands/run' },
            { label: 'cache', slug: 'cli/commands/cache' },
            { label: 'bridge', slug: 'cli/commands/bridge' },
            { label: 'render', slug: 'cli/commands/render' },
            { label: 'migrate', slug: 'cli/commands/migrate' },
            {
              // `analyze` is the command entry; the rest of this group is
              // one page per report it writes.
              label: 'Analyze reports',
              collapsed: true,
              badge: experimental,
              items: [
                { label: 'analyze', slug: 'cli/commands/analyze' },
                { label: 'Overview', slug: 'cli/analyze' },
                { label: 'props', slug: 'cli/analyze/props' },
                { label: 'styling', slug: 'cli/analyze/styling' },
                { label: 'dependencies', slug: 'cli/analyze/dependencies' },
                { label: 'keys', slug: 'cli/analyze/keys' },
                { label: 'roles', slug: 'cli/analyze/roles' },
              ],
            },
            {
              label: 'Skills',
              collapsed: true,
              badge: experimental,
              items: [
                { label: 'skills', slug: 'cli/commands/skills' },
                { label: 'icons.setup', slug: 'cli/skills/icons-setup' },
                { label: 'states.setup', slug: 'cli/skills/states-setup' },
              ],
            },
          ],
        },
        {
          label: 'Code',
          collapsed: true,
          badge: experimental,
          items: [
            { label: 'react', slug: 'cli/commands/react' },
            { label: 'webcomponents', slug: 'cli/commands/webcomponents' },
            {
              label: 'What gets emitted',
              collapsed: true,
              items: [
                { label: 'Overview', slug: 'code' },
                { label: 'Contract', slug: 'code/contract' },
                { label: 'CSS variables', slug: 'code/cssvars' },
                { label: 'Scaffold', slug: 'code/scaffold' },
                { label: 'Stories', slug: 'code/stories' },
                { label: 'Styles', slug: 'code/styles' },
              ],
            },
            {
              label: 'Testing',
              collapsed: true,
              items: [
                { label: 'Overview', slug: 'testing', badge: experimental },
                { label: 'Getting Started', slug: 'testing/getting-started', badge: experimental },
                { label: 'testing visual', slug: 'cli/commands/testing', badge: experimental },
              ],
            },
            {
              label: 'Roles',
              collapsed: true,
              items: [
                { label: 'Overview', slug: 'roles' },
                { label: 'Choosing a role', slug: 'roles/choosing' },
                { label: 'Inventory', slug: 'roles/inventory' },
                { label: 'Precedence', slug: 'roles/precedence' },
              ],
            },
            {
              label: 'Actions',
              collapsed: true,
              items: [
                { label: 'Overview', slug: 'actions', badge: experimental },
                { label: 'dismiss', slug: 'actions/dismiss', badge: experimental },
              ],
            },
            { label: 'Prop Naming', slug: 'guides/prop-naming' },
          ],
        },
        {
          label: 'Storybook',
          collapsed: true,
          badge: experimental,
          items: [
            { label: 'Overview', slug: 'storybook' },
            { label: 'Getting Started', slug: 'storybook/overview' },
            { label: 'Foundations', slug: 'storybook/foundations' },
            { label: 'Components', slug: 'storybook/components' },
            { label: 'Analysis', slug: 'storybook/analysis' },
            { label: 'Versioning', slug: 'storybook/versioning' },
            { label: 'Customization', slug: 'storybook/customization' },
            { label: 'Technical Details', slug: 'storybook/technical-details' },
            { label: 'Commands', slug: 'cli/commands/storybook' },
          ],
        },
        {
          label: 'Versioning',
          collapsed: true,
          badge: experimental,
          items: [
            { label: 'Overview', slug: 'versioning' },
            { label: 'Change Classification', slug: 'versioning/change-classification' },
            { label: 'Version History', slug: 'versioning/history' },
            { label: 'Renames & Identity', slug: 'versioning/identity' },
            { label: 'Reports & Changelogs', slug: 'versioning/reports' },
            { label: 'Figma Premerge Check', slug: 'versioning/figma-premerge' },
            { label: 'Commands', slug: 'cli/commands/version' },
          ],
        },
        {
          label: 'Guides',
          collapsed: true,
          items: [
            { label: 'Absolute Positioning', slug: 'guides/absolute-positioning' },
            { label: 'Code-Only Props', slug: 'guides/code-only-props' },
            { label: 'Consolidating Props', slug: 'guides/consolidating-props' },
            { label: 'Data Layout', slug: 'guides/data-layout' },
            { label: 'Default Slot Content', slug: 'guides/default-slot-content', badge: pro },
            { label: 'Icon Glyphs', slug: 'guides/glyph-name-pattern' },
            { label: 'Images', slug: 'guides/images' },
            { label: 'Instance Examples', slug: 'guides/instance-examples', badge: pro },
            { label: 'Invalid Combinations', slug: 'guides/invalid-variant-combinations' },
            { label: 'Key Formatting', slug: 'guides/key-formatting' },
            { label: 'Layout Positioning', slug: 'guides/layout-positioning' },
            { label: 'Number Inference', slug: 'guides/number-inference' },
            { label: 'Render to Figma', slug: 'guides/render-to-figma', badge: experimental },
            { label: 'Run Metadata', slug: 'guides/run-metadata' },
            { label: 'Slot Constraints', slug: 'guides/slot-constraints', badge: pro },
            { label: 'Subcomponents', slug: 'guides/subcomponent-scoping', badge: pro },
            { label: 'Variant Depth', slug: 'guides/variant-depth' },
            { label: 'Variant Layering', slug: 'guides/variant-layering' },
          ],
        },
        {
          label: 'Settings',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'settings' },
            {
              label: 'Settings',
              collapsed: true,
              items: [
                { label: 'collapsePrimitiveWrapper', slug: 'settings/collapse-primitive-wrapper' },
                { label: 'color', slug: 'settings/color' },
                { label: 'curation', slug: 'settings/curation' },
                { label: 'defaultSlotContent', slug: 'settings/default-slot-content', badge: pro },
                { label: 'details', slug: 'settings/details' },
                { label: 'emptyVariants', slug: 'settings/empty-variants' },
                { label: 'Folders', slug: 'settings/folders' },
                { label: 'format', slug: 'settings/output-format' },
                { label: 'invalidCombinations', slug: 'settings/invalid-combinations', badge: pro },
                { label: 'invalidVariants', slug: 'settings/invalid-variants' },
                { label: 'keys', slug: 'settings/keys' },
                { label: 'layout', slug: 'settings/layout' },
                { label: 'Output', slug: 'settings/output' },
                { label: 'promotePrimitives', slug: 'settings/promote-primitives' },
                { label: 'sources', slug: 'settings/data-sources' },
                { label: 'tokens', slug: 'settings/tokens', badge: pro },
                { label: 'variantDepth', slug: 'settings/variant-depth' },
              ],
            },
            {
              label: 'Specs',
              collapsed: true,
              items: [
                { label: 'accessibility', slug: 'settings/accessibility' },
                { label: 'slots.default', slug: 'settings/default-slot', badge: pro },
                { label: 'states', slug: 'settings/states' },
                { label: 'value', slug: 'settings/value' },
              ],
            },
            {
              label: 'Figma Conventions',
              collapsed: true,
              items: [
                { label: 'codeOnlyProps', slug: 'settings/code-only-props-pattern' },
                { label: 'glyphs', slug: 'settings/glyphs' },
                { label: 'images', slug: 'settings/images' },
                { label: 'inferNumberProps', slug: 'settings/infer-number-props' },
                { label: 'instanceExamples', slug: 'settings/instance-examples', badge: pro },
                { label: 'naming', slug: 'settings/figma-keys' },
                { label: 'objectProps', slug: 'settings/object-props' },
                { label: 'Promotion table', slug: 'settings/figma-primitives' },
                { label: 'slotConstraints', slug: 'settings/slot-constraints', badge: pro },
                { label: 'slotPrimitives', slug: 'settings/slot-primitives' },
                { label: 'subcomponents', slug: 'settings/subcomponents' },
              ],
            },
            { label: 'React', slug: 'settings/react' },
            { label: 'Web Components', slug: 'settings/web-components' },
          ],
        },
        { label: 'Releases', slug: 'overview/releases' },
        { label: 'About Spectacular', slug: 'overview/aboutspecs' },
        { label: 'License (Legal)', slug: 'overview/license' },
        { label: 'Terms of Service', slug: 'overview/terms-of-service' },
      ],
    }),
  ],
});
