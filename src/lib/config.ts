import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface RepoMetadata {
  url: string;
  ref: string;
  sha: string;
  added_at: string;
}

export interface SkillMetadata {
  repo_alias: string;
  path: string;
  installed_at: string;
}

export interface SkillctlConfig {
  agents: string[];
  default_ref: string;
  repos: Record<string, RepoMetadata>;
  skills: Record<string, SkillMetadata>;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private reposDir: string;

  constructor() {
    this.configDir = process.env.SKILLCTL_HOME || join(homedir(), '.skillctl');
    this.configPath = join(this.configDir, 'skillctl.json');
    this.reposDir = join(this.configDir, 'repos');
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getReposDir(): string {
    return this.reposDir;
  }

  async ensureDirectories(): Promise<void> {
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true });
    }
    if (!existsSync(this.reposDir)) {
      await mkdir(this.reposDir, { recursive: true });
    }
  }

  async load(): Promise<SkillctlConfig> {
    await this.ensureDirectories();

    const configFile = Bun.file(this.configPath);

    if (!(await configFile.exists())) {
      const defaultConfig: SkillctlConfig = {
        agents: [],
        default_ref: 'main',
        repos: {},
        skills: {},
      };
      await this.save(defaultConfig);
      return defaultConfig;
    }

    const config = await configFile.json() as SkillctlConfig;
    
    // Migration: Add repos field if it doesn't exist
    if (!config.repos) {
      config.repos = {};
      await this.save(config);
    }
    
    return config;
  }

  async save(config: SkillctlConfig): Promise<void> {
    await this.ensureDirectories();
    await Bun.write(this.configPath, JSON.stringify(config, null, 2));
  }

  async addSkill(name: string, metadata: SkillMetadata): Promise<void> {
    const config = await this.load();
    config.skills[name] = metadata;
    await this.save(config);
  }

  async removeSkill(name: string): Promise<void> {
    const config = await this.load();
    delete config.skills[name];
    await this.save(config);
  }

  async getSkill(name: string): Promise<SkillMetadata | undefined> {
    const config = await this.load();
    return config.skills[name];
  }

  async addAgent(agentPath: string): Promise<void> {
    const config = await this.load();
    if (!config.agents.includes(agentPath)) {
      config.agents.push(agentPath);
      await this.save(config);
    }
  }

  async removeAgent(agentPath: string): Promise<void> {
    const config = await this.load();
    config.agents = config.agents.filter(a => a !== agentPath);
    await this.save(config);
  }

  async addRepo(alias: string, metadata: RepoMetadata): Promise<void> {
    const config = await this.load();
    config.repos[alias] = metadata;
    await this.save(config);
  }

  async removeRepo(alias: string): Promise<void> {
    const config = await this.load();
    delete config.repos[alias];
    await this.save(config);
  }

  async getRepo(alias: string): Promise<RepoMetadata | undefined> {
    const config = await this.load();
    return config.repos[alias];
  }

  async updateRepo(alias: string, updates: Partial<RepoMetadata>): Promise<void> {
    const config = await this.load();
    if (config.repos[alias]) {
      config.repos[alias] = { ...config.repos[alias], ...updates };
      await this.save(config);
    }
  }

  async getSkillsByRepo(repoAlias: string): Promise<Array<[string, SkillMetadata]>> {
    const config = await this.load();
    return Object.entries(config.skills).filter(
      ([_, skill]) => skill.repo_alias === repoAlias
    );
  }
}
