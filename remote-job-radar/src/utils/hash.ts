import { createHash } from 'crypto';

/**
 * Compute a SHA-256 content hash from title + company + url.
 * Source is intentionally excluded so the same job from different
 * sources (e.g. Remotive vs Greenhouse) produces the same hash.
 */
export function computeContentHash(
  title: string,
  company: string,
  url: string
): string {
  const content = [
    title.toLowerCase().trim(),
    company.toLowerCase().trim(),
    url.toLowerCase().trim(),
  ].join('|');

  return createHash('sha256').update(content).digest('hex');
}