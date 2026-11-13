// The analysis concern: one page per analysis found in `specs/analysis/`
// (ADR-096), each a Report tab (the dashboard, per-analysis subissues) and a
// Specs tab viewing the analysis's own YAML. The section exists only when at
// least one analysis does — `specs analyze` writing its first file is what
// creates it.
import fs from 'fs-extra';
import path from 'path';
import type { Concern, BuiltFile } from '../types.js';
import type { Workspace } from '../../workspace.js';
import { readTemplate, renderTemplate } from '../../templates.js';
import { resolveSpecsLayout } from '../../../utilities/specsLayout.js';

interface AnalysisEntry {
  /** The filename prefix before the first dot: props, styling, dependencies… */
  id: string;
  /** PascalCase id, doubling as the page title and component name. */
  title: string;
  files: string[];
}

/** The analysis directory's name under the specs root. */
export function analysisDirName(ws: Workspace): string {
  return path.basename(resolveSpecsLayout(ws.specsDir).analysisDir());
}

export function discoverAnalyses(ws: Workspace): AnalysisEntry[] {
  const dir = resolveSpecsLayout(ws.specsDir).analysisDir();
  if (!fs.existsSync(dir)) return [];
  const byId = new Map<string, string[]>();
  const add = (id: string, file: string): void => {
    byId.set(id, [...(byId.get(id) ?? []), file]);
  };
  for (const entry of fs.readdirSync(dir).sort()) {
    // An analyzer may own a subdirectory of per-part files (foundations, ADR-096
    // layout unaffected) — its pages belong to the directory's id.
    if (fs.statSync(path.join(dir, entry)).isDirectory()) {
      for (const child of fs.readdirSync(path.join(dir, entry)).sort()) {
        if (child.endsWith('.yaml') || child.endsWith('.yml')) add(entry, `${entry}/${child}`);
      }
      continue;
    }
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const id = entry.split('.')[0];
    if (!id) continue;
    add(id, entry);
  }
  return [...byId.entries()].map(([id, files]) => ({
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1).replace(/[^A-Za-z0-9]/g, ''),
    // The id's own file (the index) leads; per-part files follow, sorted.
    files: files.sort((a, b) =>
      Number(a.includes('/')) - Number(b.includes('/')) || a.localeCompare(b)),
  }));
}

export const analysis: Concern = {
  name: 'analysis',

  detect(ws: Workspace): boolean {
    return discoverAnalyses(ws).length > 0;
  },

  async build(ws: Workspace): Promise<BuiltFile[]> {
    const analyses = discoverAnalyses(ws);
    const template = readTemplate('pages/Analysis.stories.tsx.tpl');
    const out: BuiltFile[] = [
      { path: 'data/analyses.json', content: JSON.stringify({ analyses }, null, 2) + '\n' },
    ];
    for (const entry of analyses) {
      out.push({
        path: `${entry.title}.stories.tsx`,
        content: renderTemplate(template, {
          ANALYSIS_ID: entry.id,
          ANALYSIS_TITLE: entry.title,
          ANALYSIS_FILES: JSON.stringify(entry.files),
          // The page fetches in the browser, where the resolver cannot run —
          // bake the resolved directory name in at publish time.
          ANALYSIS_DIR: analysisDirName(ws),
        }),
      });
    }
    return out;
  },
};
