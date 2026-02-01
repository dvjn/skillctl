#!/usr/bin/env bun
import { createCLI } from '@bunli/core';
import skill from './commands/skill';
import agent from './commands/agent';
import config from './commands/config';
import repo from './commands/repo';

const cli = await createCLI({
  name: 'skillctl',
  version: '0.1.0',
  description: 'A cross-agent package manager for installing and managing skills',
});

cli.command(skill);
cli.command(agent);
cli.command(config);
cli.command(repo);

await cli.run();
