import { createHash } from 'crypto';

/**
 * Compute a SHA-256 content hash from source + title + company + url.
 * Used to uniquely identify job content and detect duplicates.
 */
export function computeContentHash(
  source: string,
  title: string,
  company: string,
  url: string
): string {
  const content = [
    source.toLowerCase().trim(),
    title.toLowerCase().trim(),
    company.toLowerCase().trim(),
    url.toLowerCase().trim(),
  ].join('|');

  return createHash('sha256').update(content).digest('hex');
}
