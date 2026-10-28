/**
 * The files `specs init` scaffolds, as the YAML they are.
 *
 * These were TypeScript template literals until the comments in them — which is
 * most of their content, and the only reason a reader opens one — had to be
 * maintained inside a string. A scaffold is read far more often than it is
 * written, and in `templates/` it is syntax-highlighted, diffable, and valid YAML
 * that an editor can check.
 *
 * Each file is exactly what lands in a workspace. Nothing is interpolated, which
 * is why `settings.yaml` writes `./data` and `./specs` as literals rather than
 * reading `CONFIG_DEFAULTS`; `ConfigTemplates.test.ts` asserts the two agree, so a
 * changed default fails there rather than silently scaffolding the old one.
 *
 * `react.yaml` and `web-components.yaml` were one parameterised stub and are now
 * two files. They differ in six tokens, all inside comments — the platform's name
 * and its primitive component names — and a reader of either should see what their
 * workspace will get rather than a template with holes in it.
 *
 * esbuild inlines them with `--loader:.yaml=text`, declared in the `build` and
 * `watch` scripts alongside the one for skills.
 */
import FIGMA_CONVENTIONS from './templates/figma.yaml';
import SPECS_CONVENTIONS from './templates/specs.yaml';
import REACT_CONVENTIONS from './templates/react.yaml';
import WEB_COMPONENTS_CONVENTIONS from './templates/web-components.yaml';
import SETTINGS from './templates/settings.yaml';

/** Generate the `config/conventions/figma.yaml` template. */
export function generateFigmaConventionsTemplate(): string {
  return FIGMA_CONVENTIONS;
}

/** Generate the `config/conventions/specs.yaml` template. */
export function generateSpecsConventionsTemplate(): string {
  return SPECS_CONVENTIONS;
}

/** Generate the `config/conventions/react.yaml` stub. */
export function generateReactConventionsTemplate(): string {
  return REACT_CONVENTIONS;
}

/** Generate the `config/conventions/web-components.yaml` stub. */
export function generateWebComponentsConventionsTemplate(): string {
  return WEB_COMPONENTS_CONVENTIONS;
}

/** Generate the `config/settings.yaml` template with inline comments. */
export function generateSettingsTemplate(): string {
  return SETTINGS;
}

/** Every file `specs init` writes, keyed by its path in the workspace. */
export function generateConfigTemplates(): Record<string, string> {
  return {
    'config/conventions/figma.yaml': FIGMA_CONVENTIONS,
    'config/conventions/specs.yaml': SPECS_CONVENTIONS,
    'config/conventions/react.yaml': REACT_CONVENTIONS,
    'config/conventions/web-components.yaml': WEB_COMPONENTS_CONVENTIONS,
    'config/settings.yaml': SETTINGS,
  };
}
