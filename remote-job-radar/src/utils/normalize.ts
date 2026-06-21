/**
 * Utility functions to normalize job data.
 */

export function normalizeText(text?: string | null): string | undefined {
  if (!text) return undefined;
  // Remove zero-width spaces, multiple spaces, and trim
  const cleaned = text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? undefined : cleaned;
}

export function normalizeUrl(url?: string | null): string {
  if (!url) return '';
  const cleaned = url.trim();
  // Ensure absolute URL if we can, though most APIs give absolute
  return cleaned;
}

export function normalizeDate(dateStr?: string | null | number): string | undefined {
  if (!dateStr) return undefined;
  
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
  } catch {
    return undefined;
  }
}
