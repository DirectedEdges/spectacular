/**
 * Validate Command
 *
 * Validates spec folders against the schema package — each concern file against
 * its JSON Schema definition, then the references JSON Schema cannot check:
 * prop bindings, slot content pointers, instanceOf targets, layout and element
 * names against anatomy, and configuration values against declared props.
 * Reads only; nothing here writes or needs a license.
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { runValidate, type Finding } from '../validate/run.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';
import { loadFoundations } from '../utilities/loadFoundations.js';
import { tokenPath, terminalTokenValue } from '../analyze/Foundations.js';

function line(f: Finding): string {
  const mark = f.level === 'error' ? '✗' : '⚠';
  const kindDir = f.kind === 'component' ? 'components' : 'compositions';
  // A file with a slash is already a workspace-relative path (a platform-tree
  // finding); a bare name is a file inside the spec's folder.
  const loc = f.file.includes('/') ? f.file : `${kindDir}/${f.spec}/${f.file}`;
  return `${mark} ${loc} ${f.path} — ${f.message}`;
}

function formatText(allFindings: Finding[], counts: { component: number; composition: number }, skipped?: { specs: number; errors: number }): void {
  // A finding carrying a scope belongs to a workspace-level document this run validated
  // but was not asked about. It prints under its own heading, below the requested scope's
  // own result, and counts toward neither the tally nor the exit code.
  const findings = allFindings.filter(f => f.scope === undefined);
  const outOfScope = allFindings.filter(f => f.scope === 'workspace');

  for (const f of findings) console.log(line(f));
  const errors = findings.filter(f => f.level === 'error').length;
  const warnings = findings.filter(f => f.level === 'warning').length;
  const specs = counts.component + counts.composition;
  const scope = `${specs} ${specs === 1 ? 'spec' : 'specs'} (components ${counts.component}, compositions ${counts.composition})`;
  if (errors === 0 && warnings === 0) {
    console.log(`✓ ${scope} valid`);
  } else {
    console.log(`${errors === 0 ? '✓' : '✗'} ${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} across ${scope}`);
  }

  if (skipped && skipped.errors > 0) {
    console.log(`ℹ ${skipped.errors} ${skipped.errors === 1 ? 'error' : 'errors'} in the ${skipped.specs} ${skipped.specs === 1 ? 'spec' : 'specs'} this run did not check — run \`specs validate\` over the catalogue to see them`);
  }

  if (outOfScope.length > 0) {
    const n = outOfScope.length;
    console.log(`ℹ ${n} ${n === 1 ? 'finding' : 'findings'} elsewhere in the workspace, outside what you asked about:`);
    for (const f of outOfScope) console.log(`    ${line(f)}`);
  }
}

export const Validate = new Command('validate')
  .description('Validate specs against the schema and check every cross-file reference')
  .argument('[components...]', 'Spec folder names to validate (default: the whole catalogue)')
  .option('--config <path>', 'Path to a config/ directory')
  .option('-o, --output <dir>', 'Specs directory (default: spec.directory from settings)')
  .option('--authored', 'Authored spec: a missing metadata.source is expected and not reported')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (components: string[], options: { config?: string; output?: string; authored?: boolean; format: string }) => {
    try {
      if (options.format !== 'text' && options.format !== 'json') {
        console.error(`Error: unknown format "${options.format}" — use text or json.`);
        process.exit(ERROR_CODES.INVALID_ARGS);
      }

      const config = new ConfigLoader().load(options.config);
      const specsPath = options.output
        ? path.resolve(options.output)
        : config.settings.spec.directory
          ? path.resolve(config.settings.spec.directory)
          : path.resolve(process.cwd());

      if (!fs.existsSync(specsPath)) {
        console.error(`Error: specs directory not found: ${specsPath}`);
        process.exit(ERROR_CODES.FILE_ERROR);
      }

      // Default-mode values per token, for the resolved-value report. Themed —
      // one mode's resolution — so they orient the author and never gate a check.
      let tokenValues: Map<string, number> | undefined;
      const dataDirectory = config.settings.data?.directory;
      if (dataDirectory) {
        const dataDir = path.resolve(dataDirectory);
        const variablesPaths = Object.entries(config.settings.data?.sources ?? {})
          .filter(([, s]) => Array.isArray(s.fetch) && s.fetch.includes('variables'))
          .map(([alias]) => path.join(dataDir, `${alias}.variables.json`))
          .filter(p => fs.existsSync(p));
        if (variablesPaths.length > 0) {
          const foundations = await loadFoundations(variablesPaths, []);
          tokenValues = new Map();
          for (const variable of foundations.variables.values()) {
            const value = terminalTokenValue(variable, foundations);
            if (typeof value === 'number') tokenValues.set(tokenPath(variable, foundations), value);
          }
        }
      }

      const result = runValidate({
        specsPath,
        components: components.length > 0 ? components : undefined,
        authored: options.authored,
        dataDir: config.settings.data?.directory,
        tokenValues,
        // `config.configDir` is the directory holding `config/`, not `config/` itself.
        configDir: options.config
          ? path.resolve(options.config)
          : path.join(config.configDir ?? process.cwd(), 'config'),
      });

      for (const name of result.missing) {
        console.warn(`Warning: component "${name}" not found in ${specsPath} — skipping`);
      }
      if (options.format === 'text') {
        for (const note of result.notes) console.warn(`Note: ${note}`);
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({
          specs: result.counts,
          errors: result.findings.filter(f => f.level === 'error' && f.scope === undefined),
          warnings: result.findings.filter(f => f.level === 'warning' && f.scope === undefined),
          outOfScope: result.findings.filter(f => f.scope === 'workspace'),
          skipped: result.skipped,
          resolved: result.resolved,
        }, null, 2));
      } else {
        formatText(result.findings, result.counts, result.skipped);
        if (result.resolved.length > 0) {
          console.log('ℹ dimension tokens resolve to (default mode — themed, orientation only):');
          for (const r of result.resolved) console.log(`    ${r.spec} ${r.prop}: ${r.token} → ${r.value}`);
        }
      }

      // Out-of-scope findings are reported but never fail the run: the pass condition the
      // authoring loop is built on is about the spec you asked about.
      const hasErrors = result.findings.some(f => f.level === 'error' && f.scope === undefined);
      process.exit(hasErrors ? ERROR_CODES.VALIDATION_FAILED : ERROR_CODES.SUCCESS);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
