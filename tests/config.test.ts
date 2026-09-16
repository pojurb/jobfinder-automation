import { existsSync } from 'fs';
import { dirname } from 'path';
import { afterEach, describe, it, expect } from 'vitest';
import { loadPipelineConfig } from '../src/fetchers';
import { loadProfileConfig } from '../src/scoring/pre-filter';
import { getConfigPath, getProfileConfigPath, getProjectRoot } from '../src/utils/paths';

describe('Config Loader', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('loads both config.yaml and config/profile.yaml from the resolved project root', () => {
    process.chdir(dirname(getProjectRoot()));

    const pipelineConfig = loadPipelineConfig();
    const profileConfig = loadProfileConfig();

    expect(existsSync(getConfigPath())).toBe(true);
    expect(existsSync(getProfileConfigPath())).toBe(true);
    expect(pipelineConfig.search.keywords).toContain('Senior Product Manager');
    expect(profileConfig.role).toBe('Senior Product Manager');
    expect(profileConfig.scoring_weights.roleMatch).toBe(30);
    expect(profileConfig.hard_rejects.locations_only).toContain('us only');
    expect(profileConfig.preferences.domains).toContain('SaaS');
  });
});
