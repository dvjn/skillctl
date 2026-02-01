import { defineCommand } from '@bunli/core';
import { ConfigManager } from '@lib/config';

export default defineCommand({
  name: 'config',
  description: 'Show global configuration',
  handler: async ({ colors }) => {
    const configManager = new ConfigManager();
    const config = await configManager.load();

    console.log('');
    console.log(colors.bold('Configuration:'));
    console.log('');
    console.log(colors.bold('Location:'));
    console.log(`  Config: ${configManager.getConfigDir()}/skillctl.json`);
    console.log(`  Repos: ${configManager.getReposDir()}/`);
    console.log('');
    console.log(colors.bold('Settings:'));
    console.log(`  Default Ref: ${config.default_ref}`);
    console.log('');

    if (config.agents.length > 0) {
      console.log(colors.bold('Configured Agents:'));
      for (const agent of config.agents) {
        console.log(`  - ${agent}`);
      }
    } else {
      console.log(colors.yellow('No agents configured'));
      console.log(`Use ${colors.cyan('skillctl agent add <path>')} to add agents.`);
    }
    console.log('');

    if (Object.keys(config.repos).length > 0) {
      console.log(colors.bold('Registered Repositories:'));
      console.log(colors.dim(`  ${Object.keys(config.repos).length} repo(s) registered`));
      console.log(colors.dim(`  Use ${colors.cyan('skillctl repo list')} to see details`));
    } else {
      console.log('No repositories registered');
      console.log(`Use ${colors.cyan('skillctl repo add <alias> <url>')} to add repositories.`);
    }
    console.log('');

    if (Object.keys(config.skills).length > 0) {
      console.log(colors.bold('Installed Skills:'));
      console.log(colors.dim(`  ${Object.keys(config.skills).length} skill(s) installed`));
      console.log(colors.dim(`  Use ${colors.cyan('skillctl skill list')} to see details`));
    } else {
      console.log('No skills installed');
    }
    console.log('');
  },
});
