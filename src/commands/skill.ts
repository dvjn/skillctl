import { defineCommand, option } from '@bunli/core';
import { z } from 'zod';
import { join } from 'path';
import { existsSync } from 'fs';
import { ConfigManager } from '@lib/config';
import { GitManager } from '@lib/git';
import { SymlinkManager } from '@lib/symlink';

export default defineCommand({
  name: 'skill',
  description: 'Manage skills',
  handler: async ({ colors }) => {
    console.log('Use one of the following subcommands:');
    console.log(`  ${colors.cyan('skill install')} - Install a skill from a registered repository`);
    console.log(`  ${colors.cyan('skill list')}    - List all skills`);
    console.log(`  ${colors.cyan('skill remove')}  - Remove a skill`);
    console.log(`  ${colors.cyan('skill info')}    - Show skill info`);
  },
  commands: [
    defineCommand({
      name: 'install',
      description: 'Install a skill from a registered repository',
      options: {
        name: option(
          z.string().optional(),
          {
            description: 'Custom name for the skill',
            short: 'n',
          }
        ),
      },
      handler: async ({ positional, flags, spinner, colors }) => {
        if (positional.length < 2) {
          throw new Error(
            'Usage: skillctl skill install <repo-alias> <skill-path> [--name <custom-name>]\n' +
            'Example: skillctl skill install tavily-ai skills/crawl\n' +
            'Example: skillctl skill install tavily-ai skills/search --name custom-search'
          );
        }

        const repoAlias = positional[0];
        const skillPath = positional[1];

        if (!repoAlias || !skillPath) {
          throw new Error('Both repository alias and skill path are required');
        }

        const configManager = new ConfigManager();
        const symlinkManager = new SymlinkManager();

        // Load configuration and verify repo exists
        const config = await configManager.load();
        const repo = config.repos[repoAlias];

        if (!repo) {
          throw new Error(
            `Repository "${repoAlias}" is not registered.\n` +
            `Use 'skillctl repo add ${repoAlias} <git-url>' to register it first.\n` +
            `Or use 'skillctl repo list' to see available repositories.`
          );
        }

        // Determine skill name
        const skillName = flags.name || skillPath.split('/').pop() || 'skill';

        // Check if skill already exists
        if (config.skills[skillName]) {
          throw new Error(
            `Skill "${skillName}" is already installed. ` +
            `Use a different name with --name or remove it first.`
          );
        }

        const spin = spinner(`Installing ${colors.cyan(skillName)}...`);
        spin.start();

        try {
          // Verify skill path exists in repo
          const repoDir = join(configManager.getReposDir(), repoAlias);
          const skillSourcePath = join(repoDir, skillPath);

          if (!existsSync(skillSourcePath)) {
            throw new Error(
              `Skill path "${skillPath}" not found in repository "${repoAlias}".\n` +
              `Checked: ${skillSourcePath}`
            );
          }

          // Create symlinks for all configured agents
          if (config.agents.length === 0) {
            console.warn(
              `${colors.yellow('Warning:')} No agents configured. ` +
              `The skill is installed but not linked.\n` +
              `Use 'skillctl agent add <path>' to add agent directories.`
            );
          } else {
            spin.update(`Creating symlinks for ${config.agents.length} agent(s)...`);
            await symlinkManager.createSymlinksForAgents(
              config.agents,
              skillName,
              skillSourcePath
            );
          }

          // Save skill metadata
          await configManager.addSkill(skillName, {
            repo_alias: repoAlias,
            path: skillPath,
            installed_at: new Date().toISOString(),
          });

          spin.succeed(
            `${colors.green('Successfully installed')} ${colors.cyan(skillName)}\n` +
            `  Repository: ${repoAlias} (${repo.url})\n` +
            `  Path: ${skillPath}\n` +
            `  SHA: ${repo.sha.substring(0, 7)}\n` +
            `  Agents: ${config.agents.length > 0 ? config.agents.join(', ') : 'none'}`
          );
        } catch (error) {
          spin.fail(`Failed to install ${skillName}`);
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'list',
      description: 'List all installed skills',
      handler: async ({ colors }) => {
        const configManager = new ConfigManager();
        const config = await configManager.load();

        if (Object.keys(config.skills).length === 0) {
          console.log('No skills installed.');
          console.log(`\nUse ${colors.cyan('skillctl skill install <repo-alias> <path>')} to install a skill.`);
          console.log(`First register a repository with ${colors.cyan('skillctl repo add <alias> <url>')}`);
          return;
        }

        console.log(colors.bold('\nInstalled Skills:'));
        console.log('');

        for (const [name, metadata] of Object.entries(config.skills)) {
          const repo = config.repos[metadata.repo_alias];
          
          console.log(colors.cyan(`  ${name}`));
          console.log(`    Repository: ${metadata.repo_alias} (${repo?.url || 'unknown'})`);
          console.log(`    Path: ${metadata.path}`);
          if (repo) {
            console.log(`    SHA: ${repo.sha.substring(0, 7)}`);
          }
          console.log(`    Installed: ${new Date(metadata.installed_at).toLocaleString()}`);
          console.log('');
        }

        console.log(colors.dim(`Total: ${Object.keys(config.skills).length} skill(s)`));
        
        if (config.agents.length > 0) {
          console.log(colors.dim(`\nLinked to ${config.agents.length} agent(s):`));
          for (const agent of config.agents) {
            console.log(colors.dim(`  - ${agent}`));
          }
        } else {
          console.log(colors.yellow('\nWarning: No agents configured.'));
          console.log(`Use ${colors.cyan('skillctl agent add <path>')} to add agents.`);
        }
      },
    }),

    defineCommand({
      name: 'remove',
      description: 'Remove an installed skill',
      handler: async ({ positional, prompt, spinner, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl skill remove <skill-name>\n' +
            'Example: skillctl skill remove my-skill'
          );
        }

        const skillName = positional[0];
        if (!skillName) {
          throw new Error('Skill name is required');
        }

        const configManager = new ConfigManager();
        const symlinkManager = new SymlinkManager();

        // Check if skill exists
        const skill = await configManager.getSkill(skillName);
        if (!skill) {
          throw new Error(`Skill "${skillName}" is not installed`);
        }

        // Confirm removal
        const confirmed = await prompt.confirm(
          `Remove skill "${colors.cyan(skillName)}"?`,
          { default: false }
        );

        if (!confirmed) {
          console.log('Cancelled.');
          return;
        }

        const spin = spinner(`Removing ${colors.cyan(skillName)}...`);
        spin.start();

        try {
          // Remove symlinks from all agents
          const config = await configManager.load();
          spin.update(`Removing symlinks from ${config.agents.length} agent(s)...`);
          await symlinkManager.removeSymlinksForAgents(config.agents, skillName);

          // Remove from configuration
          await configManager.removeSkill(skillName);

          spin.succeed(
            `${colors.green('Successfully removed')} ${colors.cyan(skillName)}\n` +
            `Note: The parent repository remains registered. Use ${colors.cyan('skillctl repo remove')} to remove it.`
          );
        } catch (error) {
          spin.fail(`Failed to remove ${skillName}`);
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'info',
      description: 'Show detailed information about an installed skill',
      handler: async ({ positional, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl skill info <skill-name>\n' +
            'Example: skillctl skill info my-skill'
          );
        }

        const skillName = positional[0];
        if (!skillName) {
          throw new Error('Skill name is required');
        }

        const configManager = new ConfigManager();

        // Check if skill exists
        const skill = await configManager.getSkill(skillName);
        if (!skill) {
          throw new Error(`Skill "${skillName}" is not installed`);
        }

        const config = await configManager.load();
        const repo = config.repos[skill.repo_alias];
        
        if (!repo) {
          throw new Error(`Repository "${skill.repo_alias}" not found in configuration`);
        }

        const repoDir = join(configManager.getReposDir(), skill.repo_alias);
        const skillSourcePath = join(repoDir, skill.path);

        console.log('');
        console.log(colors.bold(colors.cyan(`Skill: ${skillName}`)));
        console.log('');
        console.log(colors.bold('Repository:'));
        console.log(`  Alias: ${skill.repo_alias}`);
        console.log(`  URL: ${repo.url}`);
        console.log(`  Ref: ${repo.ref}`);
        console.log(`  SHA: ${repo.sha}`);
        console.log('');
        console.log(colors.bold('Location:'));
        console.log(`  Source: ${skillSourcePath}`);
        console.log(`  Path: ${skill.path}`);
        console.log('');
        console.log(colors.bold('Installation:'));
        console.log(`  Installed: ${new Date(skill.installed_at).toLocaleString()}`);
        console.log('');

        if (config.agents.length > 0) {
          console.log(colors.bold('Linked Agents:'));
          for (const agent of config.agents) {
            const linkPath = join(agent, 'skills', skillName);
            console.log(`  ${agent}`);
            console.log(colors.dim(`    → ${linkPath}`));
          }
        } else {
          console.log(colors.yellow('Not linked to any agents'));
          console.log(`Use ${colors.cyan('skillctl agent add <path>')} to add agents.`);
        }
        console.log('');
      },
    }),
  ],
});
