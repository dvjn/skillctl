import { $ } from 'bun';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';

export interface GitRepo {
  url: string;
  ref: string;
}

export class GitManager {
  async clone(repo: GitRepo, targetDir: string): Promise<string> {
    // Clean up existing directory if it exists
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }

    // Clone the repository
    const gitUrl = this.normalizeGitUrl(repo.url);
    
    try {
      // Clone with specific ref
      await $`git clone --branch ${repo.ref} --depth 1 ${gitUrl} ${targetDir}`.quiet();
    } catch (error) {
      // If branch doesn't exist, try cloning without branch and checkout
      await $`git clone --depth 1 ${gitUrl} ${targetDir}`.quiet();
      await $`git -C ${targetDir} fetch --depth 1 origin ${repo.ref}`.quiet();
      await $`git -C ${targetDir} checkout ${repo.ref}`.quiet();
    }

    // Get the commit SHA
    const sha = await this.getCommitSha(targetDir);
    return sha;
  }

  async update(repoDir: string, ref: string): Promise<string> {
    if (!existsSync(repoDir)) {
      throw new Error(`Repository directory does not exist: ${repoDir}`);
    }

    try {
      // Fetch the latest changes (unshallow if needed for new branches)
      await $`git -C ${repoDir} fetch --depth 1 origin ${ref}:${ref}`.quiet();
      await $`git -C ${repoDir} checkout ${ref}`.quiet();
    } catch (error) {
      // If fetch fails, try unshallowing and fetching again
      try {
        await $`git -C ${repoDir} fetch --unshallow`.quiet();
      } catch {
        // Ignore unshallow errors (repo might not be shallow)
      }
      await $`git -C ${repoDir} fetch origin ${ref}`.quiet();
      await $`git -C ${repoDir} checkout ${ref}`.quiet();
    }

    // Pull latest changes on the current branch
    await $`git -C ${repoDir} pull origin ${ref}`.quiet();

    // Get the new commit SHA
    return await this.getCommitSha(repoDir);
  }

  async getCommitSha(repoDir: string): Promise<string> {
    const result = await $`git -C ${repoDir} rev-parse HEAD`.text();
    return result.trim();
  }

  normalizeGitUrl(url: string): string {
    // Convert github.com/user/repo.git to https://github.com/user/repo.git
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('git@') && !url.startsWith('file://')) {
      return `https://${url}`;
    }
    return url;
  }
}
