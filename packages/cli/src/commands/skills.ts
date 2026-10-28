/**
 * Skills Command
 *
 * `specs skills install` — emit the canonical orchestration skills (premerge,
 * release) from CLI package assets into the consuming project's skill
 * directory. Emitted skills are canonical: a refresh overwrites them without
 * asking. Local customization belongs in an override layer the refresh never
 * touches (planned, not yet implemented).
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { SKILL_ASSETS } from '../skills/index.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

const install = new Command('install')
  .description('Emit the canonical premerge and release skills into .claude/skills/, overwriting existing copies')
  .option('--dir <path>', 'Skill directory to emit into', '.claude/skills')
  .action((options: { dir: string }) => {
    try {
      const target = path.resolve(options.dir);
      for (const skill of SKILL_ASSETS) {
        const dir = path.join(target, skill.name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), skill.markdown);
        console.log(`✓ ${path.join(dir, 'SKILL.md')}`);
      }
      console.log(`${SKILL_ASSETS.length} skills installed (canonical — refresh overwrites them).`);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });

export const Skills = new Command('skills')
  .description('Manage the orchestration skills distributed with the CLI')
  .addCommand(install);
