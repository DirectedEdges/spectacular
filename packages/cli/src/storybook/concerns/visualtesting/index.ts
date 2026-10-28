// The visualtesting concern: the visual reports as generated Storybook pages
// (specs#716). Each report gets its own page, one per diff mode and platform.
// "Fidelity to Figma" (vs Figma exports) and "Changes vs Accepted" (vs the
// renders you promoted) answer different questions, and one page with a mode
// flag read as always-fidelity; React and Web Components are two different
// answers to the same question, so they are two pages rather than one with a
// platform column. A page publishes only when its report exists, so a
// React-only workspace never sees an empty Web Components page.
//
// This replaces the three hand edits to .storybook/main.ts that used to
// mount the page: `init --force` owns that file now, so a hand edit is an
// edit waiting to be destroyed. The scaffolded host serves testing/visual/
// at /baselines; each page reads its report JSON live, so a re-diff updates
// it on reload with no republish.
import fs from 'fs-extra';
import path from 'path';
import type { Concern, BuiltFile } from '../types.js';
import type { Workspace } from '../../workspace.js';
import { readTemplate, renderTemplate } from '../../templates.js';
import { reportNameFor } from '../../../testing/visual/types.js';

interface ModePage {
  /** Report basename, also the fetched file: report/<name>.json. */
  name: string;
  file: string;
  title: string;
  baselineLabel: string;
  /** The diff flags that produce this report, for the empty-state hint. */
  diffFlag: string;
}

const MODES = [
  { mode: 'figma' as const, slug: 'fidelity', label: 'Fidelity to Figma', baseline: 'Figma exports', flag: '' },
  {
    mode: 'accepted' as const,
    slug: 'regression',
    label: 'Changes vs Accepted',
    baseline: 'last accepted renders',
    flag: ' --against accepted',
  },
];

const PLATFORMS = [
  { target: 'react' as const, label: 'React', file: 'React' },
  { target: 'webcomponents' as const, label: 'Web Components', file: 'WebComponents' },
];

const PAGES: ModePage[] = MODES.flatMap((m) =>
  PLATFORMS.map((p) => ({
    name: reportNameFor(m.mode, p.target),
    file: `${m.slug === 'fidelity' ? 'FidelityToFigma' : 'ChangesVsAccepted'}${p.file}.stories.tsx`,
    title: `${p.label}: ${m.label}`,
    baselineLabel: m.baseline,
    diffFlag: `${m.flag} --target ${p.target}`,
  })),
);

/**
 * Reports written before the platform split carry no target and held React
 * results. They publish under the React title, but only while that mode has
 * no split report yet — otherwise one workspace shows the same results twice.
 */
const LEGACY_PAGES: ModePage[] = MODES.map((m) => ({
  name: m.slug,
  file: `${m.slug === 'fidelity' ? 'FidelityToFigma' : 'ChangesVsAccepted'}React.stories.tsx`,
  title: `React: ${m.label}`,
  baselineLabel: m.baseline,
  diffFlag: `${m.flag} --target react`,
}));

function reportDir(ws: Workspace): string {
  return path.join(ws.root, 'testing', 'visual', 'report');
}

function present(ws: Workspace): ModePage[] {
  const has = (name: string) => fs.existsSync(path.join(reportDir(ws), `${name}.json`));
  const pages = PAGES.filter((p) => has(p.name));
  const claimed = new Set(pages.map((p) => p.file));
  return [...pages, ...LEGACY_PAGES.filter((p) => has(p.name) && !claimed.has(p.file))];
}

export const visualtesting: Concern = {
  name: 'visualtesting',

  detect(ws: Workspace): boolean {
    return present(ws).length > 0;
  },

  async build(ws: Workspace): Promise<BuiltFile[]> {
    const template = readTemplate('pages/VisualReport.stories.tsx.tpl');
    return present(ws).map((p) => ({
      path: p.file,
      content: renderTemplate(template, {
        REPORT_NAME: p.name,
        PAGE_TITLE: p.title,
        BASELINE_LABEL: p.baselineLabel,
        DIFF_FLAG: p.diffFlag,
      }),
    }));
  },
};
