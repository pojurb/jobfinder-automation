import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getBaseCvPath,
  getDatabasePath,
  getProjectRoot,
  getProfileConfigPath,
  getReportsDir,
  resolveProjectRoot,
} from '../src/utils/paths';

describe('Project Path Resolution', () => {
  const originalCwd = process.cwd();
  const projectRoot = getProjectRoot();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('resolves the project root when started from the repo root', () => {
    process.chdir(projectRoot);

    expect(resolveProjectRoot(join(projectRoot, 'src', 'server'))).toBe(projectRoot);
    expect(existsSync(getDatabasePath())).toBe(true);
    expect(existsSync(getProfileConfigPath())).toBe(true);
  });

  it('keeps project-rooted paths stable when started from the workspace parent', () => {
    process.chdir(dirname(projectRoot));

    expect(getProjectRoot()).toBe(projectRoot);
    expect(existsSync(getBaseCvPath())).toBe(true);
    expect(existsSync(getReportsDir())).toBe(true);
  });
});
