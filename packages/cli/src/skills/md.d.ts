/**
 * Skill sources are markdown, inlined as strings by esbuild's text loader
 * (`--loader:.md=text` in the `build` and `watch` scripts). This is what makes
 * `import PRIMER from './primer.md'` typecheck.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
