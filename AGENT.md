# AGENT.md

> Quick reference for AI agents working on skillctl

## Project Overview

**skillctl** is a cross-agent package manager that manages skills across multiple AI agents (OpenCode, Claude Code, etc.) using a repository-based approach with symlinks.

**Core Concept**: Clone git repositories once → install multiple skills from them → symlink to multiple agent directories → update repos to propagate changes

## Technology Stack

- **Runtime**: Bun v1.3.8+ (JavaScript runtime)
- **Language**: TypeScript v5.9.3 (ESNext target)
- **Dependencies**: 
  - `@bunli/core` - CLI framework
  - `zod` - Schema validation
- **Dev Tools**: `@bunli/test` (tests not implemented yet)

## Architecture

### Project Structure
```
src/
├── cli.ts                 # Entry point - registers commands
├── commands/              # CLI command handlers
│   ├── repo.ts           # Repository management
│   ├── skill.ts          # Skill installation
│   ├── agent.ts          # Agent directory management
│   └── config.ts         # Config viewer
└── lib/                   # Core business logic
    ├── config.ts         # ConfigManager - JSON config CRUD
    ├── git.ts            # GitManager - git operations wrapper
    └── symlink.ts        # SymlinkManager - symlink operations
```

### Path Aliases
- `@lib/*` → `./src/lib/*`
- `@commands/*` → `./src/commands/*`

### Data Storage
```
~/.skillctl/              # Configurable via SKILLCTL_HOME
├── skillctl.json         # Config + metadata
└── repos/                # Cloned repositories
    └── <alias>/
```

## Core Interfaces

```typescript
interface SkillctlConfig {
  agents: string[];                        // Agent directory paths
  default_ref: string;                     // Default git ref
  repos: Record<string, RepoMetadata>;     // Repositories
  skills: Record<string, SkillMetadata>;   // Installed skills
}

interface RepoMetadata {
  url: string;      // Git URL
  ref: string;      // Branch/tag
  sha: string;      // Current commit
  added_at: string; // ISO timestamp
}

interface SkillMetadata {
  repo_alias: string;    // Which repo
  path: string;          // Path in repo
  installed_at: string;  // ISO timestamp
}
```

## Command Flow Examples

### Installing a Skill
```
skillctl skill install tavily-ai skills/crawl
→ Verify repo "tavily-ai" exists
→ Check ~/.skillctl/repos/tavily-ai/skills/crawl exists
→ Derive skill name: "crawl"
→ For each agent: create symlink
→ Save to config.skills
```

### Updating a Repository
```
skillctl repo update tavily-ai
→ git fetch + reset --hard in ~/.skillctl/repos/tavily-ai/
→ Get new SHA
→ Update config.repos["tavily-ai"].sha
→ All skills from repo auto-updated (symlinks)
```

## Development Patterns

### Adding a Command
```typescript
// src/commands/example.ts
import { defineCommand, option } from '@bunli/core';
import { z } from 'zod';

export default defineCommand({
  name: 'example',
  description: 'Example command',
  options: {
    flag: option(z.string().optional(), { short: 'f' }),
  },
  handler: async ({ positional, flags, spinner }) => {
    const spin = spinner('Working...');
    spin.start();
    // ... logic
    spin.succeed('Done!');
  },
});

// Register in src/cli.ts
import example from './commands/example';
cli.command(example);
```

### Error Handling Pattern
- Multi-line errors with actionable suggestions
- Include usage examples in error messages
- Validate early, fail fast
- Use `colors.yellow()` for warnings

### UX Principles
1. Spinners for long operations
2. Confirmation prompts for destructive actions
3. Helpful defaults (`default_ref: 'main'`)
4. Show relevant context in output

## Build & Development

```bash
bun run dev      # Hot reload mode
bun run build    # Create standalone binary (dist/skillctl)
bun test         # Tests (none implemented)
```

## Common Tasks

### Adding a Skill Metadata Field
1. Update `SkillMetadata` interface in `src/lib/config.ts`
2. Update skill install handler in `src/commands/skill.ts`
3. Update skill info/list display

### Supporting New Agent Platform
1. Currently generic - just needs `skills/` subdirectory
2. Modify `SymlinkManager.validateAgentDirectory()` if special logic needed

## Testing Status
- Framework: `@bunli/test` installed
- Tests: None written yet
- Recommendation: Add unit tests for lib/* and integration tests for commands/*

## Troubleshooting

**"Repository not found"** → Check `~/.skillctl/repos/<alias>/` exists, verify git URL  
**Broken symlinks** → Skill path may have changed in repo, reinstall skill  
**Permission errors** → Check write access to agent `skills/` directories  
**"Already installed" but not visible** → Check config manually, possible orphaned entry

## Quick Reference

| Component | Location | Purpose |
|-----------|----------|---------|
| Entry point | `src/cli.ts` | Register commands |
| Config schema | `src/lib/config.ts:6-24` | Interfaces |
| Repo ops | `src/commands/repo.ts` | add/list/update/remove |
| Skill ops | `src/commands/skill.ts` | install/list/info/remove |
| Agent ops | `src/commands/agent.ts` | add/list/remove |

**Environment**: `SKILLCTL_HOME` - override config directory (default: `~/.skillctl`)

## License
Unlicense (public domain)
