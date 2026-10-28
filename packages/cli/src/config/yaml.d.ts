/**
 * Config scaffold templates are YAML, inlined as strings by esbuild's text loader
 * (`--loader:.yaml=text` in the `build` and `watch` scripts). This is what makes
 * `import SETTINGS from './templates/settings.yaml'` typecheck.
 *
 * The sibling declaration for `*.md` lives in `src/skills/md.d.ts`.
 */
declare module '*.yaml' {
  const content: string;
  export default content;
}
