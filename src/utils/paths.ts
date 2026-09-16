import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

const ROOT_OVERRIDE_ENV = 'REMOTE_JOB_RADAR_ROOT';

function looksLikeProjectRoot(dir: string): boolean {
  return (
    existsSync(join(dir, 'package.json')) &&
    existsSync(join(dir, 'src', 'server', 'dashboard.html')) &&
    existsSync(join(dir, 'drizzle.config.ts'))
  );
}

export function resolveProjectRoot(startDir: string = __dirname): string {
  const override = process.env[ROOT_OVERRIDE_ENV];
  if (override) {
    const resolvedOverride = resolve(override);
    if (!looksLikeProjectRoot(resolvedOverride)) {
      throw new Error(
        `REMOTE_JOB_RADAR_ROOT does not point to a valid project root: ${resolvedOverride}`
      );
    }
    return resolvedOverride;
  }

  let currentDir = resolve(startDir);

  while (true) {
    if (looksLikeProjectRoot(currentDir)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(
        `Unable to locate Remote Job Radar project root from start directory: ${startDir}`
      );
    }

    currentDir = parentDir;
  }
}

const projectRoot = resolveProjectRoot(__dirname);

export function getProjectRoot(): string {
  return projectRoot;
}

export function projectPath(...segments: string[]): string {
  return join(projectRoot, ...segments);
}

export function getDatabasePath(): string {
  return projectPath('sqlite.db');
}

export function getConfigPath(): string {
  return projectPath('config.yaml');
}

export function getProfileConfigPath(): string {
  return projectPath('config', 'profile.yaml');
}

export function getBaseCvPath(): string {
  return projectPath('base-cv.md');
}

export function getReportsDir(): string {
  return projectPath('reports');
}

export function getTailoredCvsDir(): string {
  return projectPath('tailored-cvs');
}

export function getMigrationsDir(): string {
  return projectPath('drizzle');
}

export interface RuntimeStatusCheck {
  path: string;
  exists: boolean;
}

export interface RuntimeStatus {
  ok: boolean;
  projectRoot: string;
  files: {
    database: RuntimeStatusCheck;
    config: RuntimeStatusCheck;
    profileConfig: RuntimeStatusCheck;
    baseCv: RuntimeStatusCheck;
    migrationsDir: RuntimeStatusCheck;
  };
  directories: {
    reports: RuntimeStatusCheck;
    tailoredCvs: RuntimeStatusCheck;
  };
  problems: string[];
}

export function getRuntimeStatus(): RuntimeStatus {
  const status: RuntimeStatus = {
    ok: true,
    projectRoot,
    files: {
      database: { path: getDatabasePath(), exists: existsSync(getDatabasePath()) },
      config: { path: getConfigPath(), exists: existsSync(getConfigPath()) },
      profileConfig: { path: getProfileConfigPath(), exists: existsSync(getProfileConfigPath()) },
      baseCv: { path: getBaseCvPath(), exists: existsSync(getBaseCvPath()) },
      migrationsDir: { path: getMigrationsDir(), exists: existsSync(getMigrationsDir()) },
    },
    directories: {
      reports: { path: getReportsDir(), exists: existsSync(getReportsDir()) },
      tailoredCvs: { path: getTailoredCvsDir(), exists: existsSync(getTailoredCvsDir()) },
    },
    problems: [],
  };

  if (!status.files.config.exists) {
    status.problems.push(`Missing fetch config: ${status.files.config.path}`);
  }
  if (!status.files.profileConfig.exists) {
    status.problems.push(`Missing scoring profile config: ${status.files.profileConfig.path}`);
  }

  status.ok = status.problems.length === 0;
  return status;
}
