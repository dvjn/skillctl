import { existsSync } from 'fs';
import { mkdir, readlink, symlink, unlink } from 'fs/promises';
import { join } from 'path';

export class SymlinkManager {
  async createSymlink(source: string, target: string): Promise<void> {
    if (!existsSync(source)) {
      throw new Error(`Source path does not exist: ${source}`);
    }

    // Create parent directory if it doesn't exist
    const targetDir = join(target, '..');
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    // Remove existing symlink or file
    if (existsSync(target)) {
      try {
        const link = await readlink(target);
        await unlink(target);
      } catch {
        // Not a symlink, just remove it
        await unlink(target);
      }
    }

    // Create symlink
    await symlink(source, target, 'dir');
  }

  async removeSymlink(target: string): Promise<void> {
    if (existsSync(target)) {
      try {
        await readlink(target);
        await unlink(target);
      } catch {
        // Not a symlink, don't remove
        console.warn(`Warning: ${target} is not a symlink, skipping removal`);
      }
    }
  }

  async createSymlinksForAgents(
    agents: string[],
    skillName: string,
    sourcePath: string
  ): Promise<void> {
    for (const agent of agents) {
      const skillsDir = join(agent, 'skills');
      
      // Verify agent has skills directory
      if (!existsSync(skillsDir)) {
        console.warn(`Warning: Agent ${agent} does not have a skills directory, skipping`);
        continue;
      }

      const targetPath = join(skillsDir, skillName);
      await this.createSymlink(sourcePath, targetPath);
    }
  }

  async removeSymlinksForAgents(
    agents: string[],
    skillName: string
  ): Promise<void> {
    for (const agent of agents) {
      const targetPath = join(agent, 'skills', skillName);
      await this.removeSymlink(targetPath);
    }
  }
}
