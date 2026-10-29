// Which way a composed instance lays its default-slot content out.
//
// A sizing declaration is worth emitting only when the flex default would not
// already do it, and that depends on the parent's direction. For an element whose
// parent is an ordinary container the spec states it right there. For an element
// nested under an *instance* — which is how a default-slot fill is spelled — the
// direction lives in that component's own spec, so it has to be read.
//
// Three things decide the answer, and the first two are easy to get wrong:
//
// - **The slot element, not the root.** `egdsSectionBeta` binds its default slot on
//   `root`, so root's `layoutMode` governs. `egdsCard` has a separate `children`
//   element with its own. The element to read is whichever one binds the slot.
// - **The variant, not the default.** `egdsSectionBeta` restates `layoutMode:
//   HORIZONTAL` under `configuration: { direction: Horizontal }`. The governing
//   variant is the one the composed instance's own propConfigurations satisfy.
// - **`layoutMode`, never the prop.** That same component has a `direction` prop
//   whose values happen to read Horizontal/Vertical. Mapping an enum label to a flex
//   direction infers meaning from a name; the declared `layoutMode` is the contract,
//   and a library free to spell its prop any way at all does not change it.
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

export interface SlotDirection {
  layoutMode?: string;
  crossAxisAlignment?: string;
}

/**
 * Resolve the direction a composed instance lays its default-slot content out in,
 * or undefined when the target cannot be read or declares no default slot.
 */
export type SlotDirectionResolver = (
  instanceOf: string,
  propConfigurations: Record<string, unknown>,
) => SlotDirection | undefined;

/** A resolver that answers nothing — for a run with no component specs to read. */
export const NO_SLOT_DIRECTION: SlotDirectionResolver = () => undefined;

interface TargetSpec {
  /** The element key that binds the default slot, or undefined when there is none. */
  slotKey?: string;
  defaultDirection: SlotDirection;
  /** Each variant's configuration and what it restates about the slot element. */
  variants: Array<{ configuration: Record<string, unknown>; direction: SlotDirection }>;
}

/**
 * A resolver reading component specs from `componentsDir`.
 *
 * Specs are parsed once per component and cached for the run: a composition asks
 * about the same handful of layout components for every element it holds.
 */
export function slotDirectionResolver(componentsDir: string): SlotDirectionResolver {
  const cache = new Map<string, TargetSpec | null>();

  const read = (instanceOf: string): TargetSpec | null => {
    const cached = cache.get(instanceOf);
    if (cached !== undefined) return cached;
    const parsed = readTarget(componentsDir, instanceOf);
    cache.set(instanceOf, parsed);
    return parsed;
  };

  return (instanceOf, propConfigurations) => {
    const target = read(instanceOf);
    if (!target?.slotKey) return undefined;
    const direction: SlotDirection = { ...target.defaultDirection };
    // Later variants win, exactly as the stylesheet's own cascade orders them.
    for (const variant of target.variants) {
      if (!configurationSatisfies(variant.configuration, propConfigurations)) continue;
      if (variant.direction.layoutMode !== undefined) direction.layoutMode = variant.direction.layoutMode;
      if (variant.direction.crossAxisAlignment !== undefined) {
        direction.crossAxisAlignment = variant.direction.crossAxisAlignment;
      }
    }
    return direction;
  };
}

/**
 * Every key the variant names is pinned to that value on the instance.
 *
 * Shared with the contentStyles read (ADR-102), which resolves a slot's
 * primitive formatting by the same rule — the name matches the shared core's
 * `configurationSatisfies` in from-specs' `slotDirection.ts`.
 */
export function configurationSatisfies(
  configuration: Record<string, unknown>,
  propConfigurations: Record<string, unknown>,
): boolean {
  // Member-keyed values (ADR-111) compare per member — identity on the objects
  // would make every folded variant read as unsatisfied.
  const flat = (config: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (
        !key.startsWith('$') && value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(k => !k.startsWith('$'))
      ) {
        for (const [memberKey, memberValue] of Object.entries(value)) {
          if (memberValue !== null) out[`${key}.${memberKey}`] = memberValue;
        }
        continue;
      }
      out[key] = value;
    }
    return out;
  };
  const pinnedFlat = flat(propConfigurations);
  for (const [key, value] of Object.entries(flat(configuration))) {
    const pinned = pinnedFlat[key];
    if (pinned === undefined) return false;
    if (typeof value === 'string' && typeof pinned === 'string') {
      if (value.toLowerCase() !== pinned.toLowerCase()) return false;
    } else if (value !== pinned) {
      return false;
    }
  }
  return true;
}

/** The spec folder for a reference, tolerating a different casing (DirectedEdges/specs#424). */
function folderFor(componentsDir: string, referenced: string): string | undefined {
  let entries: string[];
  try {
    entries = fs.readdirSync(componentsDir);
  } catch {
    return undefined;
  }
  if (entries.includes(referenced)) return referenced;
  const wanted = referenced.toLowerCase();
  return entries.find(entry => entry.toLowerCase() === wanted);
}

function readTarget(componentsDir: string, instanceOf: string): TargetSpec | null {
  const folder = folderFor(componentsDir, instanceOf);
  if (!folder) return null;
  const dir = path.join(componentsDir, folder);
  let api: Record<string, unknown>;
  let variantsYaml: Record<string, unknown>;
  try {
    api = yaml.parse(fs.readFileSync(path.join(dir, 'api.yaml'), 'utf-8')) as Record<string, unknown>;
    variantsYaml = yaml.parse(fs.readFileSync(path.join(dir, 'variants.yaml'), 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const props = (api?.props ?? {}) as Record<string, Record<string, unknown>>;
  // The default slot is the FIRST slot-typed prop declaring it (ADR-099); a
  // further declaration is ignored, so this names the same prop the emitters'
  // own resolver does. `find` is that rule, and the type check keeps a
  // non-slot prop carrying the marker from standing in for one.
  const slotProp = Object.entries(props).find(
    ([, def]) => def?.type === 'slot' && def?.defaultSlot === true,
  )?.[0];
  if (!slotProp) return { defaultDirection: {}, variants: [] };

  const defaultElements = (((variantsYaml?.default ?? {}) as Record<string, unknown>).elements ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const binding = `#/props/${slotProp}`;
  const slotKey = Object.entries(defaultElements).find(([, element]) => {
    const children = element?.children as Record<string, unknown> | undefined;
    return children?.$binding === binding;
  })?.[0];
  if (!slotKey) return { defaultDirection: {}, variants: [] };

  const variants = ((variantsYaml?.variants ?? []) as Array<Record<string, unknown>>)
    .map(variant => ({
      configuration: (variant.configuration ?? {}) as Record<string, unknown>,
      direction: directionOf(
        ((variant.elements ?? {}) as Record<string, Record<string, unknown>>)[slotKey],
      ),
    }))
    .filter(entry => Object.keys(entry.configuration).length > 0);

  return { slotKey, defaultDirection: directionOf(defaultElements[slotKey]), variants };
}

function directionOf(element: Record<string, unknown> | undefined): SlotDirection {
  const styles = (element?.styles ?? {}) as Record<string, unknown>;
  return {
    layoutMode: typeof styles.layoutMode === 'string' ? styles.layoutMode : undefined,
    crossAxisAlignment:
      typeof styles.crossAxisAlignment === 'string' ? styles.crossAxisAlignment : undefined,
  };
}
