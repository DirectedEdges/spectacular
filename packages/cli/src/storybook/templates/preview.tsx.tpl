// Scaffolded by `specs storybook init`. Yours after that — publish never
// touches it.
import type { Preview } from '@storybook/react';
import { addons } from 'storybook/preview-api';
{{CSSVARS_IMPORT}}
// Mode toolbar controls (specs#636): published from conventions/storybook.yaml
// `modes.collections`, driving the attributes the emitted stylesheet switches on.
import modesJson from '../content/components/modes.json';

interface ModeControl {
  name: string;
  attr: string;
  modes: Array<{ name: string; value: string }>;
  default: string;
}
const modeControls: ModeControl[] = (modesJson as { controls: ModeControl[] }).controls ?? [];

const globalTypes: NonNullable<Preview['globalTypes']> = {};
for (const control of modeControls) {
  globalTypes[`mode_${control.attr}`] = {
    description: `${control.name} mode`,
    toolbar: {
      title: control.name,
      icon: 'paintbrush',
      dynamicTitle: true,
      items: control.modes.map((m) => ({ value: m.value, title: m.name })),
    },
  };
}

const initialGlobals: Record<string, string> = {};
for (const control of modeControls) {
  const def = control.modes.find((m) => m.name === control.default);
  initialGlobals[`mode_${control.attr}`] = def?.value ?? control.modes[0].value;
}

/** Apply each selected mode as its attribute on <html>; the default clears it. */
const applyModes = (globals: Record<string, string>) => {
  for (const control of modeControls) {
    const value = globals[`mode_${control.attr}`];
    const def = control.modes.find((m) => m.name === control.default)?.value;
    const root = document.documentElement;
    if (!value || value === def) root.removeAttribute(control.attr);
    else root.setAttribute(control.attr, value);
  }
};

// Globals reach a *story* through decorators, but a custom docs page (the
// generated foundations and analysis pages) renders no story — so modes are
// applied off the channel, which fires on every toolbar change regardless of
// what the page shows.
if (modeControls.length) {
  applyModes(initialGlobals);
  addons.getChannel().on('globalsUpdated', ({ globals }: { globals: Record<string, string> }) => applyModes(globals));
}

const withModes = (Story: any, context: { globals: Record<string, string> }) => {
  applyModes(context.globals);
  return Story();
};

const preview: Preview = {
  ...(modeControls.length ? { globalTypes, initialGlobals, decorators: [withModes] } : {}),
  // Autodocs: a per-component Docs page listing every story, labeled.
  tags: ['autodocs'],
  parameters: {
    // Sidebar order. Storybook's indexer reads this parameter out of this file's
    // AST and `eval`s the function on its own, so it must be written inline here
    // and must reference NOTHING outside itself — not an import, not a module
    // constant, not a helper, and no TypeScript annotations, none of which
    // survive that extraction. The two orders are literals for the same reason.
    //
    // Titles are compared one path segment at a time. The first segment takes
    // the system's section order; a final segment naming one of a component's
    // views takes the view order, because alphabetical order on those names puts
    // API first and splits the two platforms apart. Everything else is
    // alphabetical. The view list is an ordering, not an inventory — a name with
    // no page simply never appears.
    options: {
      storySort: (a, b) => {
        const SECTIONS = ['Overview', 'Foundations', 'Components', 'Compositions', 'Analysis', 'Versions'];
        const VIEWS = [
          'React',
          'React — Testing (Fidelity)',
          'React — Testing (Changes)',
          'Web components',
          'Web components — Testing (Fidelity)',
          'Web components — Testing (Changes)',
          'API',
          'Variants',
        ];
        const rankIn = (order, value) => {
          const at = order.indexOf(value);
          return at === -1 ? order.length : at;
        };
        const left = a.title.split('/');
        const right = b.title.split('/');
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
          const x = left[i];
          const y = right[i];
          if (x === y) continue;
          // One path has run out: the shallower entry is this folder's own page.
          if (x === undefined) return -1;
          if (y === undefined) return 1;
          if (i === 0) {
            const bySection = rankIn(SECTIONS, x) - rankIn(SECTIONS, y);
            if (bySection !== 0) return bySection;
          } else if (i === left.length - 1 && i === right.length - 1) {
            const byView = rankIn(VIEWS, x) - rankIn(VIEWS, y);
            if (byView !== 0) return byView;
          }
          return x.localeCompare(y);
        }
        return 0;
      },
    },
    // Composed slot content is one long JSX expression; dedent preserves the
    // serializer's tree structure without prettier re-splitting attributes
    // onto one line each.
    docs: {
      // No global docs page: a component's React view is Storybook's own autodocs
      // page, and every other view is a published page carrying its own docs.page.
      source: { format: 'dedent' },
      // Give every story on the Docs page the canvas toolbar, not just the primary.
      canvas: {
        // The zoom bar adds a row above every story for controls nobody uses on
        // a docs page; the action bar below still carries Show code and full screen.
        withToolbar: false,
        // The toolbar has no story context, so recover the id from the Canvas
        // block's own anchor and open that story full screen.
        additionalActions: [
          {
            title: 'Open full screen',
            onClick: (e: any) => {
              const anchor = (e.currentTarget as HTMLElement).closest('[id^="anchor--"]');
              // The primary story's canvas is anchored as `anchor--primary--<id>`
              // (Storybook 10); every other story as `anchor--<id>`.
              const id = anchor?.id.replace(/^anchor--(?:primary--)?/, '');
              if (id) {
                window.parent.location.href = `${window.parent.location.origin}/?path=/story/${id}&full=1`;
              }
            },
          },
        ],
      },
    },
    // "Show code" serializer: keep attributes inline like the emitted source,
    // print fragments short, and drop React's internal keys.
    jsx: {
      maxInlineAttributesLineLength: 200,
      useFragmentShortSyntax: true,
      filterProps: ['key'],
    },
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
