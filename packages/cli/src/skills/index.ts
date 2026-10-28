/**
 * Distributed orchestration skills — package assets of specs-cli, emitted into a
 * consuming project's `.claude/skills/` by `specs skills install`. Canonical and
 * overwritten on refresh.
 *
 * **The sources are the `.md` files beside this one, and they are the whole truth.**
 * Each one is exactly what gets written to disk: frontmatter, the canonical-asset
 * notice, its prerequisite line, then its procedure. Nothing is composed at build
 * time and nothing is interpolated, so what you read in `statesSetup.md` is what an
 * agent reads in `.claude/skills/specs-cli.states.setup/SKILL.md`. They were
 * TypeScript template literals until every code fence in them needed escaping, which
 * cost a skill that silently stopped installing when one closing delimiter picked up
 * a backslash.
 *
 * esbuild inlines them as strings via `--loader:.md=text`, declared in the `build`
 * and `watch` scripts. A new skill is a new `.md` plus a row below; adding one
 * without the loader flag fails the build rather than shipping an empty skill.
 *
 * ## The primer is a prerequisite, not a preamble
 *
 * `primer.md` is what Specs *is* — a schema and a CLI over strongly structured data,
 * and why that makes an inference a defect rather than a shortcut. Every other skill
 * names it in a prerequisite line instead of carrying a copy.
 *
 * That is a context decision, not a tidiness one. Inlining it charged every skill
 * read for the same 450 words, so an onboarding session that touches three skills
 * paid for it three times. As a prerequisite an agent reads it once and the rest of
 * the session is already taught. The cost is one extra read, once; the saving scales
 * with how many skills a session uses.
 *
 * Skills that hold a judgment — `icons.setup`, `states.setup`, `roles.propose` —
 * depend on the primer most, because each one decides something from a library's own
 * data and the primer is what says which artifact may be believed.
 */

import PRIMER from './primer.md';
import WORKSPACE_SETUP from './workspaceSetup.md';
import PREMERGE from './premerge.md';
import RELEASE from './release.md';
import ROLES_PROPOSE from './rolesPropose.md';
import ROLES_APPLY from './rolesApply.md';
import STATES_SETUP from './statesSetup.md';
import ICONS_SETUP from './iconsSetup.md';

export interface SkillAsset {
  /** Skill directory name under .claude/skills/. */
  name: string;
  markdown: string;
}

/**
 * The primer leads, so a fresh install writes the prerequisite before anything that
 * names it. `workspace.setup` follows, because it is the one a workspace with nothing
 * in it needs — it was `ONBOARDING.md` in the repository root, which a customer who
 * installed from npm never had.
 */
export const SKILL_ASSETS: SkillAsset[] = [
  { name: 'specs-cli.primer', markdown: PRIMER },
  { name: 'specs-cli.workspace.setup', markdown: WORKSPACE_SETUP },
  { name: 'specs-cli.premerge', markdown: PREMERGE },
  { name: 'specs-cli.release', markdown: RELEASE },
  { name: 'specs-cli.roles.propose', markdown: ROLES_PROPOSE },
  { name: 'specs-cli.roles.apply', markdown: ROLES_APPLY },
  { name: 'specs-cli.states.setup', markdown: STATES_SETUP },
  { name: 'specs-cli.icons.setup', markdown: ICONS_SETUP },
];
