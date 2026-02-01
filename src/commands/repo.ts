import { defineCommand, option } from '@bunli/core';
import { z } from 'zod';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { ConfigManager } from '@lib/config';
import { GitManager } from '@lib/git';
import { SymlinkManager } from '@lib/symlink';

export default defineCommand({
  name: 'repo',
  description: 'Manage skill repositories',
  handler: async ({ colors }) => {
    console.log('Use one of the following subcommands:');
    console.log(`  ${colors.cyan('repo add')}     - Register a repository`);
    console.log(`  ${colors.cyan('repo list')}    - List all repositories`);
    console.log(`  ${colors.cyan('repo remove')}  - Remove a repository`);
    console.log(`  ${colors.cyan('repo update')}  - Update a repository`);
    console.log(`  ${colors.cyan('repo info')}    - Show repository info`);
  },
  commands: [
    defineCommand({
      name: 'add',
      description: 'Register a repository',
      options: {
        ref: option(
          z.string().optional(),
          {
            description: 'Git branch/tag to track',
            short: 'r',
          }
        ),
      },
      handler: async ({ positional, flags, spinner, colors }) => {
        if (positional.length < 2) {
          throw new Error(
            'Usage: skillctl repo add <alias> <git-url> [--ref <branch>]\n' +
            'Example: skillctl repo add tavily-ai https://github.com/tavily-ai/skills.git'
          );
        }

        const alias = positional[0];
        const gitUrl = positional[1];

        if (!alias || !gitUrl) {
          throw new Error('Both alias and git URL are required');
        }

        // Validate alias format
        if (!/^[a-z0-9-]+$/.test(alias)) {
          throw new Error(
            'Invalid alias format. Use only lowercase letters, numbers, and hyphens.\n' +
            'Example: tavily-ai, openai-tools, my-repo'
          );
        }

        const configManager = new ConfigManager();
        const gitManager = new GitManager();

        // Load configuration
        const config = await configManager.load();
        const effectiveRef = flags.ref || config.default_ref;

        // Check if alias already exists
        if (config.repos[alias]) {
          throw new Error(
            `Repository "${alias}" is already registered.\n` +
            `Use 'skillctl repo remove ${alias}' to remove it first.`
          );
        }

        const spin = spinner(`Registering repository ${colors.cyan(alias)}...`);
        spin.start();

        try {
          // Clone repository
          const repoDir = join(configManager.getReposDir(), alias);
          
          spin.update(`Cloning repository from ${colors.cyan(gitUrl)}...`);
          const sha = await gitManager.clone(
            { url: gitUrl, ref: effectiveRef },
            repoDir
          );

          // Save repository metadata
          await configManager.addRepo(alias, {
            url: gitUrl,
            ref: effectiveRef,
            sha,
            added_at: new Date().toISOString(),
          });

          spin.succeed(
            `${colors.green('Successfully registered')} ${colors.cyan(alias)}\n` +
            `  URL: ${gitUrl}\n` +
            `  Ref: ${effectiveRef}\n` +
            `  SHA: ${sha.substring(0, 7)}\n` +
            `  Location: ${repoDir}`
          );
        } catch (error) {
          spin.fail(`Failed to register repository ${alias}`);
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'list',
      description: 'List all registered repositories',
      handler: async ({ colors }) => {
        const configManager = new ConfigManager();
        const config = await configManager.load();

        if (Object.keys(config.repos).length === 0) {
          console.log('No repositories registered.');
          console.log(`\nUse ${colors.cyan('skillctl repo add <alias> <url>')} to register a repository.`);
          return;
        }

        console.log(colors.bold('\nRegistered Repositories:'));
        console.log('');

        for (const [alias, metadata] of Object.entries(config.repos)) {
          const skills = await configManager.getSkillsByRepo(alias);
          
          console.log(colors.cyan(`  ${alias}`));
          console.log(`    URL: ${metadata.url}`);
          console.log(`    Ref: ${metadata.ref}`);
          console.log(`    SHA: ${metadata.sha.substring(0, 7)}`);
          console.log(`    Skills: ${skills.length} installed`);
          console.log(`    Added: ${new Date(metadata.added_at).toLocaleString()}`);
          console.log('');
        }

        console.log(colors.dim(`Total: ${Object.keys(config.repos).length} repository(ies)`));
      },
    }),

    defineCommand({
      name: 'remove',
      description: 'Remove a registered repository',
      handler: async ({ positional, prompt, spinner, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl repo remove <alias>\n' +
            'Example: skillctl repo remove tavily-ai'
          );
        }

        const alias = positional[0];
        if (!alias) {
          throw new Error('Repository alias is required');
        }

        const configManager = new ConfigManager();
        const symlinkManager = new SymlinkManager();

        // Check if repo exists
        const repo = await configManager.getRepo(alias);
        if (!repo) {
          throw new Error(`Repository "${alias}" is not registered`);
        }

        // Check for installed skills from this repo
        const skills = await configManager.getSkillsByRepo(alias);
        
        if (skills.length > 0) {
          console.log(colors.yellow(`\nThe following ${skills.length} skill(s) are installed from this repository:`));
          for (const [skillName] of skills) {
            console.log(`  - ${skillName}`);
          }
          console.log('');

          const confirmed = await prompt.confirm(
            `Remove these ${skills.length} skill(s) and the repository?`,
            { default: false }
          );

          if (!confirmed) {
            console.log('Cancelled.');
            return;
          }
        } else {
          // No skills, just confirm repo removal
          const confirmed = await prompt.confirm(
            `Remove repository "${colors.cyan(alias)}"?`,
            { default: false }
          );

          if (!confirmed) {
            console.log('Cancelled.');
            return;
          }
        }

        const spin = spinner(`Removing ${colors.cyan(alias)}...`);
        spin.start();

        try {
          // Remove skills if any
          if (skills.length > 0) {
            const config = await configManager.load();
            
            for (const [skillName] of skills) {
              spin.update(`Removing skill ${colors.cyan(skillName)}...`);
              
              // Remove symlinks from all agents
              await symlinkManager.removeSymlinksForAgents(config.agents, skillName);
              
              // Remove from configuration
              await configManager.removeSkill(skillName);
            }
          }

          // Remove repository directory
          spin.update(`Removing repository files...`);
          const repoDir = join(configManager.getReposDir(), alias);
          if (existsSync(repoDir)) {
            await rm(repoDir, { recursive: true, force: true });
          }

          // Remove from configuration
          await configManager.removeRepo(alias);

          spin.succeed(
            `${colors.green('Successfully removed')} ${colors.cyan(alias)}\n` +
            (skills.length > 0 
              ? `  Removed ${skills.length} skill(s) and repository`
              : '  Removed repository')
          );
        } catch (error) {
          spin.fail(`Failed to remove ${alias}`);
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'update',
      description: 'Update a repository to the latest version',
      options: {
        all: option(
          z.coerce.boolean().default(false),
          {
            description: 'Update all registered repositories',
            short: 'a',
          }
        ),
      },
      handler: async ({ positional, flags, spinner, colors }) => {
        const configManager = new ConfigManager();
        const gitManager = new GitManager();

        // Handle --all flag
        if (flags.all) {
          const config = await configManager.load();
          const repos = Object.entries(config.repos);

          if (repos.length === 0) {
            console.log('No repositories registered.');
            return;
          }

          console.log(colors.bold(`\nUpdating ${repos.length} repository(ies)...\n`));

          let updated = 0;
          let unchanged = 0;
          let failed = 0;

          for (const [alias, repo] of repos) {
            const spin = spinner(`Updating ${colors.cyan(alias)}...`);
            spin.start();

            try {
              // Get repository directory
              const repoDir = join(configManager.getReposDir(), alias);

              // Update repository
              const newSha = await gitManager.update(repoDir, repo.ref);

              // Check if anything changed
              if (newSha === repo.sha) {
                spin.info(`${colors.cyan(alias)} is already up to date`);
                unchanged++;
              } else {
                // Update metadata
                await configManager.updateRepo(alias, { sha: newSha });

                const skills = await configManager.getSkillsByRepo(alias);
                spin.succeed(
                  `${colors.green('Updated')} ${colors.cyan(alias)} ` +
                  `${colors.dim(`(${repo.sha.substring(0, 7)} → ${newSha.substring(0, 7)})`)}\n` +
                  `  ${skills.length} skill(s) updated`
                );
                updated++;
              }
            } catch (error) {
              spin.fail(`${colors.red('Failed to update')} ${colors.cyan(alias)}`);
              if (error instanceof Error) {
                console.error(colors.dim(`  ${error.message}`));
              }
              failed++;
            }
          }

          console.log('');
          console.log(colors.bold('Summary:'));
          console.log(`  ${colors.green('Updated:')} ${updated}`);
          console.log(`  ${colors.blue('Unchanged:')} ${unchanged}`);
          if (failed > 0) {
            console.log(`  ${colors.red('Failed:')} ${failed}`);
          }
          return;
        }

        // Handle single repository update
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl repo update <alias>\n' +
            'Usage: skillctl repo update --all\n' +
            'Example: skillctl repo update tavily-ai'
          );
        }

        const alias = positional[0];
        if (!alias) {
          throw new Error('Repository alias is required');
        }

        // Check if repo exists
        const repo = await configManager.getRepo(alias);
        if (!repo) {
          throw new Error(`Repository "${alias}" is not registered`);
        }

        const spin = spinner(`Updating ${colors.cyan(alias)}...`);
        spin.start();

        try {
          // Get repository directory
          const repoDir = join(configManager.getReposDir(), alias);

          // Update repository
          spin.update(`Fetching latest changes from ${colors.cyan(repo.url)}...`);
          const newSha = await gitManager.update(repoDir, repo.ref);

          // Check if anything changed
          if (newSha === repo.sha) {
            spin.info(`${colors.cyan(alias)} is already up to date`);
            return;
          }

          // Update metadata
          await configManager.updateRepo(alias, { sha: newSha });

          const skills = await configManager.getSkillsByRepo(alias);
          spin.succeed(
            `${colors.green('Successfully updated')} ${colors.cyan(alias)}\n` +
            `  SHA: ${repo.sha.substring(0, 7)} → ${newSha.substring(0, 7)}\n` +
            `  ${skills.length} skill(s) updated`
          );
        } catch (error) {
          spin.fail(`Failed to update ${alias}`);
          throw error;
        }
      },
    }),

    defineCommand({
      name: 'info',
      description: 'Show detailed information about a registered repository',
      handler: async ({ positional, colors }) => {
        if (positional.length === 0) {
          throw new Error(
            'Usage: skillctl repo info <alias>\n' +
            'Example: skillctl repo info tavily-ai'
          );
        }

        const alias = positional[0];
        if (!alias) {
          throw new Error('Repository alias is required');
        }

        const configManager = new ConfigManager();

        // Check if repo exists
        const repo = await configManager.getRepo(alias);
        if (!repo) {
          throw new Error(`Repository "${alias}" is not registered`);
        }

        const repoDir = join(configManager.getReposDir(), alias);
        const skills = await configManager.getSkillsByRepo(alias);

        console.log('');
        console.log(colors.bold(colors.cyan(`Repository: ${alias}`)));
        console.log('');
        console.log(colors.bold('Details:'));
        console.log(`  URL: ${repo.url}`);
        console.log(`  Ref: ${repo.ref}`);
        console.log(`  SHA: ${repo.sha}`);
        console.log(`  Location: ${repoDir}`);
        console.log(`  Added: ${new Date(repo.added_at).toLocaleString()}`);
        console.log('');

        if (skills.length > 0) {
          console.log(colors.bold('Installed Skills:'));
          for (const [skillName, skill] of skills) {
            console.log(`  - ${skillName} ${colors.dim(`(${skill.path})`)}`);
          }
          console.log('');
          console.log(colors.dim(`Total: ${skills.length} skill(s)`));
        } else {
          console.log(colors.yellow('No skills installed from this repository'));
          console.log(`Use ${colors.cyan(`skillctl skill install ${alias} <skill-path>`)} to install skills.`);
        }
        console.log('');
      },
    }),
  ],
});
