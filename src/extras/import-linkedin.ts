import { readFileSync } from 'fs';
import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema';
import { computeContentHash } from '../utils/hash';
import { normalizeDate, normalizeText, normalizeUrl } from '../utils/normalize';

export interface LinkedInCapture {
  id: string;
  title: string;
  company: string;
  location?: string;
  remoteRegion?: string;
  url: string;
  description: string;
  postedAt?: string;
  salary?: string;
}

export interface LinkedInCaptureFile {
  capturedAt?: string;
  jobs: LinkedInCapture[];
}

export interface LinkedInImportResult {
  imported: number;
  skippedExisting: number;
  skippedInvalid: number;
}

export function parseLinkedInCaptureFile(content: string): LinkedInCaptureFile {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
    throw new Error('Capture file must be a JSON object containing a jobs array.');
  }
  return parsed as LinkedInCaptureFile;
}

export async function importLinkedInCaptures(
  captureFile: string,
  dryRun = false,
): Promise<LinkedInImportResult> {
  const parsed = parseLinkedInCaptureFile(readFileSync(resolve(captureFile), 'utf-8'));
  const result: LinkedInImportResult = { imported: 0, skippedExisting: 0, skippedInvalid: 0 };

  for (const capture of parsed.jobs) {
    const id = String(capture.id ?? '').trim();
    const title = normalizeText(capture.title ?? '');
    const company = normalizeText(capture.company ?? '');
    const url = normalizeUrl(capture.url ?? '');
    const description = normalizeText(capture.description ?? '');
    if (!id || !title || !company || !url || !description) {
      result.skippedInvalid++;
      continue;
    }

    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.source, 'linkedin'), eq(jobs.sourceJobId, id)))
      .limit(1);
    if (existing.length > 0) {
      result.skippedExisting++;
      continue;
    }

    if (!dryRun) {
      await db.insert(jobs).values({
        source: 'linkedin',
        sourceJobId: id,
        title,
        company,
        location: normalizeText(capture.location ?? '') || undefined,
        remoteRegion: normalizeText(capture.remoteRegion ?? '') || undefined,
        url,
        description,
        salary: normalizeText(capture.salary ?? '') || undefined,
        postedAt: normalizeDate(capture.postedAt ?? '') || undefined,
        contentHash: computeContentHash(title, company, url),
        rawJson: { capturedFrom: 'linkedin-browser', capturedAt: parsed.capturedAt, linkedInJobId: id },
      });
    }
    result.imported++;
  }

  return result;
}
