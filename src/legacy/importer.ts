import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';
import { db } from '../db';
import { applications, jobs } from '../db/schema';
import { computeContentHash } from '../utils/hash';
import { normalizeDate, normalizeText, normalizeUrl } from '../utils/normalize';
import { getProjectRoot } from '../utils/paths';

export interface LegacyMarkdownJob {
  filename: string;
  metadata: Record<string, unknown>;
  description: string;
}

export interface LegacyImportOptions {
  directory?: string;
  dryRun?: boolean;
}

export interface LegacyImportResult {
  discovered: number;
  imported: number;
  skippedExisting: number;
  skippedInvalid: number;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function toLegacySourceId(filename: string): string {
  return createHash('sha256').update(filename).digest('hex');
}

function normalizeStatus(value: unknown): string {
  const status = asText(value).toLowerCase();
  if (!status) return 'pending';
  if (status === 'ready to apply') return 'pending';
  if (status === 'junk') return 'rejected';
  return status.replace(/\s+/g, '-');
}

/** Parses the YAML frontmatter used by the original Python job tracker. */
export function parseLegacyMarkdownJob(filename: string, content: string): LegacyMarkdownJob {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) {
    return { filename, metadata: {}, description: content.trim() };
  }

  const parsed = parse(match[1]);
  return {
    filename,
    metadata: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
    description: match[2].trim(),
  };
}

function readLegacyJobs(directory: string): LegacyMarkdownJob[] {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.md'))
    .sort()
    .map((filename) => parseLegacyMarkdownJob(filename, readFileSync(join(directory, filename), 'utf-8')));
}

/**
 * Imports the previous Markdown job archive into the canonical SQLite database.
 * The original score breakdown remains in rawJson; every imported record is left
 * unscored so the current deterministic scorer remains the single source of truth.
 */
export async function importLegacyMarkdownJobs(
  options: LegacyImportOptions = {},
): Promise<LegacyImportResult> {
  const directory = resolve(options.directory ?? join(getProjectRoot(), 'legacy', 'markdown-jobs'));
  const legacyJobs = readLegacyJobs(directory);
  const existingRows = await db.select({ contentHash: jobs.contentHash }).from(jobs);
  const existingHashes = new Set(existingRows.map((row) => row.contentHash).filter(Boolean));
  const result: LegacyImportResult = {
    discovered: legacyJobs.length,
    imported: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
  };

  for (const legacyJob of legacyJobs) {
    const title = normalizeText(asText(legacyJob.metadata.title));
    const company = normalizeText(asText(legacyJob.metadata.company)) || 'Unknown company';
    const rawUrl = asText(legacyJob.metadata.url);
    const url = normalizeUrl(rawUrl) || `legacy://markdown/${encodeURIComponent(legacyJob.filename)}`;

    if (!title) {
      result.skippedInvalid++;
      continue;
    }

    const contentHash = computeContentHash(title, company, url);
    if (existingHashes.has(contentHash)) {
      result.skippedExisting++;
      continue;
    }

    if (options.dryRun) {
      result.imported++;
      existingHashes.add(contentHash);
      continue;
    }

    const inserted = await db.insert(jobs).values({
      source: 'legacy-markdown',
      sourceJobId: toLegacySourceId(legacyJob.filename),
      title,
      company,
      location: normalizeText(asText(legacyJob.metadata.location)) || undefined,
      remoteRegion: normalizeText(asText(legacyJob.metadata.work_type)) || undefined,
      url,
      description: legacyJob.description || undefined,
      postedAt: normalizeDate(asText(legacyJob.metadata.date_added)) || undefined,
      contentHash,
      rawJson: {
        legacyFilename: legacyJob.filename,
        legacyMetadata: legacyJob.metadata,
      },
    }).returning({ id: jobs.id });

    const legacyStatus = normalizeStatus(legacyJob.metadata.status);
    await db.insert(applications).values({
      jobId: inserted[0].id,
      status: legacyStatus,
      notes: `Imported from legacy Markdown archive (${legacyJob.filename}).`,
      appliedAt: legacyStatus === 'applied' ? new Date() : undefined,
    });

    result.imported++;
    existingHashes.add(contentHash);
  }

  return result;
}
