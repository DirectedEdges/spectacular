import type { Transformer } from '../transforms/transformer.js';
import { DependenciesAnalyzer } from './Dependencies.js';
import { KeysAnalyzer } from './Keys.js';
import { PropsAnalyzer } from './Props.js';
import { RolesAnalyzer } from './Roles.js';
import { StylingAnalyzer } from './Styling.js';

/**
 * An analyzer accumulates across the specs it visits and writes the total in
 * `finalize()`, so an instance is single-use. These are therefore constructors
 * rather than instances: every run gets its own.
 *
 * They were shared instances until a live `specs run` showed what that costs. A
 * one-shot command never noticed, because the process exits and the next
 * invocation starts clean — but the chain holds the process open, so every pass
 * accumulated into the same analyzers and wrote the union. One watcher pass added
 * exactly one whole library: a 197-prop catalogue reported `totalProps: 1576`
 * after eight passes, with each component listed eight times in
 * `typeDiscordance.typeSets[].components`.
 *
 * Nothing in the file was malformed and no warning fired, which is what made it
 * dangerous: `states.setup` reads `props.yaml` as its candidate list and points at
 * `typeDiscordance` to find props whose meaning splits across components, so at 8×
 * every split looked eight times as broad as it was.
 */
const ANALYZERS: Array<new () => Transformer> = [
  PropsAnalyzer,
  StylingAnalyzer,
  DependenciesAnalyzer,
  KeysAnalyzer,
  RolesAnalyzer,
];

/** Names only — safe to read without constructing anything. */
const NAMES: string[] = ANALYZERS.map(A => new A().name);

/** Every analyzer, in declaration order — what a run with no names given does. */
export function allAnalyzers(): Transformer[] {
  return ANALYZERS.map(A => new A());
}

/** The analyzer names a run may ask for, for help text and error messages. */
export function availableAnalyzerNames(): string[] {
  return [...NAMES];
}

export function resolveAnalyzers(names: string[]): Transformer[] {
  if (names.length === 0) return allAnalyzers();
  const byName = new Map(ANALYZERS.map(A => [new A().name, A] as const));
  const resolved: Transformer[] = [];
  for (const name of names) {
    const A = byName.get(name);
    if (A) {
      resolved.push(new A());
    } else {
      console.warn(`Warning: unknown analyzer "${name}" — skipping`);
    }
  }
  return resolved;
}
