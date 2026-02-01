import { defineCommand } from '@bunli/core';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '@lib/config';
import { SymlinkManager } from '@lib/symlink';

export default defineCommand({
  name: 'agent',
  description: 'Manage agent directories',
  handler: async ({ colors }) => {
    console.log('Use one of the following subcommands:');
    console.log(`  ${colors.cyan('agent add')}     - Add an agent directory`);
    console.log(`  ${colors.cyan('agent list')}    - List all agents`);
    console.log(`  ${colors.cyan('agent remove')}  - Remove an agent directory`);
  },
  commands: [
    defineCommand({
      name: 'add',
      description: 'Add an agent directory to configuration',
      handler: async ({ positional, spinner, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl agent add <path>\n' +
            'Example: skillctl agent add /home/user/.opencode\n' +
            'Example: skillctl agent add ~/.claude-code'
          );
        }

        let agentPath = positional[0];
        if (!agentPath) {
          throw new Error('Agent path is required');
        }

        // Expand home directory
        if (agentPath.startsWith('~')) {
          const { homedir } = await import('os');
          agentPath = agentPath.replace('~', homedir());
        }

        // Convert to absolute path
        if (!agentPath.startsWith('/')) {
          const { resolve } = await import('path');
          agentPath = resolve(agentPath);
        }

        // Check if directory exists
        if (!existsSync(agentPath)) {
          throw new Error(`Directory does not exist: ${agentPath}`);
        }

        // Check if skills directory exists
        const skillsDir = join(agentPath, 'skills');
        if (!existsSync(skillsDir)) {
          throw new Error(
            `Agent directory must have a 'skills' subdirectory.\n` +
            `Expected: ${skillsDir}\n` +
            `Create it first or choose a different directory.`
          );
        }

        const configManager = new ConfigManager();
        const symlinkManager = new SymlinkManager();

        const config = await configManager.load();

        // Check if already added
        if (config.agents.includes(agentPath)) {
          console.log(`${colors.yellow('Agent already configured:')} ${agentPath}`);
          return;
        }

        const spin = spinner(`Adding agent ${colors.cyan(agentPath)}...`);
        spin.start();

        try {
          // Add agent to configuration
          await configManager.addAgent(agentPath);

          // Create symlinks for all installed skills
          const skillCount = Object.keys(config.skills).length;
          if (skillCount > 0) {
            spin.update(`Creating symlinks for ${skillCount} skill(s)...`);

            for (const [skillName, skill] of Object.entries(config.skills)) {
              const repoDir = join(configManager.getReposDir(), skill.repo_alias);
              const skillSourcePath = join(repoDir, skill.path);

              await symlinkManager.createSymlinksForAgents(
                [agentPath],
                skillName,
                skillSourcePath
              );
            }
          }

          spin.succeed(
            `${colors.green('Successfully added agent:')} ${agentPath}\n` +
            (skillCount > 0
              ? `  Linked ${skillCount} skill(s)`
              : '  No skills to link yet')
          );
        } catch (error) {
          spin.fail('Failed to add agent');
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'list',
      description: 'List all configured agent directories',
      handler: async ({ colors }) => {
        const configManager = new ConfigManager();
        const config = await configManager.load();

        if (config.agents.length === 0) {
          console.log('No agents configured.');
          console.log(`\nUse ${colors.cyan('skillctl agent add <path>')} to add an agent directory.`);
          return;
        }

        console.log(colors.bold('\nConfigured Agents:'));
        console.log('');

        for (const agent of config.agents) {
          console.log(colors.cyan(`  ${agent}`));
          const skillsDir = join(agent, 'skills');
          console.log(colors.dim(`    Skills directory: ${skillsDir}`));
          console.log('');
        }

        console.log(colors.dim(`Total: ${config.agents.length} agent(s)`));

        if (Object.keys(config.skills).length > 0) {
          console.log(colors.dim(`\n${Object.keys(config.skills).length} skill(s) linked to these agents`));
          console.log(colors.dim(`Use ${colors.cyan('skillctl skill list')} to see details`));
        }
      },
    }),

    defineCommand({
      name: 'remove',
      description: 'Remove an agent directory from configuration',
      handler: async ({ positional, prompt, spinner, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl agent remove <path>\n' +
            'Example: skillctl agent remove /home/user/.opencode'
          );
        }

        let agentPath = positional[0];
        if (!agentPath) {
          throw new Error('Agent path is required');
        }

        // Expand home directory
        if (agentPath.startsWith('~')) {
          const { homedir } = await import('os');
          agentPath = agentPath.replace('~', homedir());
        }

        // Convert to absolute path
        if (!agentPath.startsWith('/')) {
          const { resolve } = await import('path');
          agentPath = resolve(agentPath);
        }

        const configManager = new ConfigManager();
        const symlinkManager = new SymlinkManager();

        const config = await configManager.load();

        // Check if agent is configured
        if (!config.agents.includes(agentPath)) {
          throw new Error(`Agent not found in configuration: ${agentPath}`);
        }

        // Confirm removal
        const confirmed = await prompt.confirm(
          `Remove agent "${colors.cyan(agentPath)}" and clean up symlinks?`,
          { default: false }
        );

        if (!confirmed) {
          console.log('Cancelled.');
          return;
        }

        const spin = spinner(`Removing agent ${colors.cyan(agentPath)}...`);
        spin.start();

        try {
          // Remove symlinks for all skills
          const skillCount = Object.keys(config.skills).length;
          if (skillCount > 0) {
            spin.update(`Removing symlinks for ${skillCount} skill(s)...`);

            for (const skillName of Object.keys(config.skills)) {
              await symlinkManager.removeSymlinksForAgents([agentPath], skillName);
            }
          }

          // Remove agent from configuration
          await configManager.removeAgent(agentPath);

          spin.succeed(
            `${colors.green('Successfully removed agent:')} ${agentPath}\n` +
            (skillCount > 0
              ? `  Removed ${skillCount} symlink(s)`
              : '  No symlinks to remove')
          );
        } catch (error) {
          spin.fail('Failed to remove agent');
          throw error;
        }
      },
    }),
  ],
});
