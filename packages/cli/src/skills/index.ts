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
 *
 * ## `rules/` and `references/` are different layers, and rules win
 *
 * A `rules/*.yaml` entry is a judgment at one schema node: modality-keyed
 * (`must` / `never` / `should` / `could`), stating the forbidden mistake, citing the ADR
 * it projects. A `references/*.md` file is the map of a mechanism that spans several
 * nodes or files — which properties exist, what shape each value takes, which file each
 * step of a traversal is written in.
 *
 * The test for where a new fact goes: **a choice at a single node is a rule; a fact that
 * spans more than one node or file is a reference.** A reference that starts advising
 * which value to pick has grown a second copy of a rule, and the two then drift — which
 * is what happened to the single `slots-layout.md` this set replaced. When both files
 * say something, the rules file governs and the reference carries a pointer to it.
 *
 * Neither layer is an authority on what a spec *means*. That is the schema's, and both
 * layers cite it rather than restating it.
 *
 * ## A step a parent skill names is a sub-skill, not a choice
 *
 * `posture` and `component.compile` are invoked by name from inside
 * `component.author`, at a numbered step. That keeps their text out of the round's
 * priming read — `component.compile` alone is ~790 words that only matter after all
 * three concern files validate — and it lets the round's own cost be measured apart
 * from the compile's.
 *
 * The distinction that makes this safe: the parent *names* the invocation, so the
 * session has a directive rather than a decision. A skill a session must first decide
 * it needs is a new way to fail, which is why the reference files beside the primer are
 * reading material and not skills, however tempting the symmetry looks.
 */

import PRIMER from './primer.md';
import WORKSPACE_SETUP from './workspaceSetup.md';
import VERSION_FIGMAPREMERGE from './versionFigmapremerge.md';
import VERSION_RELEASE from './versionRelease.md';
import ROLES_PROPOSE from './rolesPropose.md';
import ROLES_APPLY from './rolesApply.md';
import STATES_SETUP from './statesSetup.md';
import ICONS_SETUP from './iconsSetup.md';
import IMAGES_SETUP from './imagesSetup.md';
import AUTHORING_PRIMER from './authoringPrimer.md';
import REF_PROPS from './references/props.md';
import REF_SLOTS from './references/slots.md';
import REF_SUBCOMPONENTS from './references/subcomponents.md';
import REF_LAYOUT from './references/layout.md';
import REF_STYLES from './references/styles.md';
import COMPONENT_AUTHOR from './componentAuthor.md';
import COMPONENT_COMPILE from './componentCompile.md';
import GUIDELINES_PROPOSE from './guidelinesPropose.md';
import TEMPLATE_API from './templates/api.yaml';
import TEMPLATE_VARIANTS from './templates/variants.yaml';
import TEMPLATE_EXAMPLES from './templates/examples.yaml';
import TEMPLATE_SUPPLEMENTAL from './templates/supplemental.yaml';
import TEMPLATE_GUIDELINES from './templates/guidelines.yaml';
import TEMPLATE_GUIDELINES_RULES from './templates/guidelinesRules.yaml';
import POSTURE from './posture.md';
import RULES_ANATOMY from './rules/anatomy.yaml';
import RULES_EXAMPLES from './rules/examples.yaml';
import RULES_PRIMITIVES from './rules/primitives.yaml';
import RULES_STYLES from './rules/styles.yaml';
import RULES_LAYOUT from './rules/layoutStyling.yaml';
import RULES_PROPS from './rules/props.yaml';
import RULES_SLOTS from './rules/slots.yaml';
import RULES_SUBCOMPONENTS from './rules/subcomponents.yaml';
import RULES_VARIANTS from './rules/variants.yaml';

export interface SkillAsset {
  /** Skill directory name under .claude/skills/. */
  name: string;
  markdown: string;
  /** Supporting files emitted beside SKILL.md, path relative to the skill directory. */
  files?: Array<{ path: string; content: string }>;
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
  { name: 'specs-cli.posture', markdown: POSTURE },
  { name: 'specs-cli.version.figmapremerge', markdown: VERSION_FIGMAPREMERGE },
  { name: 'specs-cli.version.release', markdown: VERSION_RELEASE },
  { name: 'specs-cli.roles.propose', markdown: ROLES_PROPOSE },
  { name: 'specs-cli.roles.apply', markdown: ROLES_APPLY },
  { name: 'specs-cli.states.setup', markdown: STATES_SETUP },
  { name: 'specs-cli.icons.setup', markdown: ICONS_SETUP },
  { name: 'specs-cli.images.setup', markdown: IMAGES_SETUP },
  {
    name: 'specs-cli.authoring.primer',
    markdown: AUTHORING_PRIMER,
    files: [
      { path: 'rules/anatomy.yaml', content: RULES_ANATOMY },
      { path: 'rules/examples.yaml', content: RULES_EXAMPLES },
      { path: 'rules/primitives.yaml', content: RULES_PRIMITIVES },
      { path: 'rules/styles.yaml', content: RULES_STYLES },
      { path: 'rules/layoutStyling.yaml', content: RULES_LAYOUT },
      { path: 'rules/props.yaml', content: RULES_PROPS },
      { path: 'rules/slots.yaml', content: RULES_SLOTS },
      { path: 'rules/subcomponents.yaml', content: RULES_SUBCOMPONENTS },
      { path: 'rules/variants.yaml', content: RULES_VARIANTS },
      { path: 'references/props.md', content: REF_PROPS },
      { path: 'references/slots.md', content: REF_SLOTS },
      { path: 'references/subcomponents.md', content: REF_SUBCOMPONENTS },
      { path: 'references/layout.md', content: REF_LAYOUT },
      { path: 'references/styles.md', content: REF_STYLES },
    ],
  },
  {
    name: 'specs-cli.guidelines.propose',
    markdown: GUIDELINES_PROPOSE,
    files: [{ path: 'templates/rules.yaml', content: TEMPLATE_GUIDELINES_RULES }],
  },
  {
    name: 'specs-cli.component.author',
    markdown: COMPONENT_AUTHOR,
    files: [
      { path: 'templates/api.yaml', content: TEMPLATE_API },
      { path: 'templates/variants.yaml', content: TEMPLATE_VARIANTS },
      { path: 'templates/examples.yaml', content: TEMPLATE_EXAMPLES },
      { path: 'templates/supplemental.yaml', content: TEMPLATE_SUPPLEMENTAL },
      { path: 'templates/guidelines.yaml', content: TEMPLATE_GUIDELINES },
    ],
  },
  { name: 'specs-cli.component.compile', markdown: COMPONENT_COMPILE },
];
