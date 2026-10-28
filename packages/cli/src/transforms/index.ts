import type { Transformer } from '../transforms/transformer.js';
import { CssTransformer } from './Css.js';
import { CssvarsTransformer } from './Cssvars.js';
// React/stories and webcomponents transforms live in closed implementation
// packages, consumed like the processing engine. The license gates Pro output
// inside each package.
import { ReactTransformer, StoriesTransformer } from '@directededges/react-from-specs';
import { WebComponentsTransformer, WcStoriesTransformer } from '@directededges/webcomponents-from-specs';

// `contract` is no longer a transformer of its own. A contract is typed for the
// platform that consumes it, so each platform transformer emits its own beside the
// scaffold that imports it (project 024).
const ALL_TRANSFORMERS: Transformer[] = [
  new CssTransformer(),
  new CssvarsTransformer(),
  new ReactTransformer(),
  new StoriesTransformer(),
  // Experimental — the Lit output is not yet stable.
  new WebComponentsTransformer(),
  new WcStoriesTransformer(),
];

const BY_NAME = new Map(ALL_TRANSFORMERS.map(t => [t.name, t]));

// React is the default because it is the one target that emits a component, its
// contract and its stories together. `contract` alone no longer exists.
export const DEFAULT_TRANSFORMERS = ['react'];

export function resolveTransformers(names: string[]): Transformer[] {
  const resolved: Transformer[] = [];
  for (const name of names) {
    const t = BY_NAME.get(name);
    if (t) {
      resolved.push(t);
    } else {
      console.warn(`Warning: unknown transformer "${name}" — skipping`);
    }
  }
  return resolved;
}
