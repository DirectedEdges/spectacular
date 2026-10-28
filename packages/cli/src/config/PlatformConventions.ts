/**
 * Reading one platform's conventions out of the platform-keyed map (ADR-073).
 *
 * `Conventions` is keyed by implementation id — `figma`, `react`, `web-components`
 * — and any key may be absent, because absence is the statement that a platform
 * declares no conventions. Consumers still need a value to read: a run that asks
 * for `figma` when no `config/conventions/figma.yaml` exists should see NONE
 * naming and no blocks, not crash.
 *
 * That is the guarantee `ResolvedPlatformConventions` encodes by requiring
 * `naming`, `slotConstraints` and `inferNumberProps` — the same guarantee the
 * required `figma` key gave before ADR-073 made it one platform among many.
 */

import type { ResolvedConventions, ResolvedPlatformConventions } from '@directededges/specs-schema';

/** A platform that declares nothing: the three defaultable members, no blocks. */
const UNDECLARED: ResolvedPlatformConventions = {
  naming: 'NONE',
  slotConstraints: false,
  inferNumberProps: false,
};

/**
 * One platform's conventions, or an undeclared-platform value when that key is
 * absent. Never returns undefined, so call sites read members directly.
 */
export function platformOf(
  conventions: ResolvedConventions | undefined,
  id: string
): ResolvedPlatformConventions {
  return conventions?.platforms?.[id] ?? UNDECLARED;
}

/**
 * The Figma platform's conventions — the source side of every command that reads a
 * Figma file. A named shorthand because it is by far the most-read key, and because
 * spelling the id at seventy call sites invites a typo that would silently resolve
 * to an undeclared platform.
 */
export function figmaOf(conventions: ResolvedConventions | undefined): ResolvedPlatformConventions {
  return platformOf(conventions, FIGMA_PLATFORM);
}

/** The conventional id for the Figma platform. */
export const FIGMA_PLATFORM = 'figma';
