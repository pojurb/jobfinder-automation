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

const COMPANY_SUFFIXES = new Set([
  'pt',
  'tbk',
  'inc',
  'ltd',
  'llc',
  'corp',
  'co',
  'group',
  'holdings',
  'indonesia',
]);

function companyNameWords(name?: string | null): string[] {
  if (!name || typeof name !== 'string') return [];

  let s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Strip/decode common HTML entities
  s = s
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z0-9#x]+;/gi, ' ');

  s = s.toLowerCase();

  // Strip leading PT / PT.
  s = s.replace(/^pt\.?\s+/i, '');

  // Replace punctuation with space, preserving letters, digits, and spaces
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s.split(' ').filter(Boolean);
}

/**
 * Normalizes a company name for matching:
 * - Lowercase
 * - Strips accents, HTML entities, and punctuation
 * - Strips leading PT / PT.
 * - Drops trailing suffixes (pt, tbk, inc, ltd, llc, corp, co, group, holdings, indonesia)
 */
export function normalizeCompanyName(name?: string | null): string {
  const words = companyNameWords(name);

  // Drop trailing suffixes iteratively
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }

  return words.join(' ').trim();
}

// Pure legal-form words: dropping them never changes WHICH company a name refers to.
// Descriptive suffixes (group, holdings, indonesia) do, so they are kept in the full form.
const LEGAL_FORM_SUFFIXES = new Set(['pt', 'tbk', 'inc', 'ltd', 'llc', 'corp', 'co']);

/**
 * Same cleaning as normalizeCompanyName but keeps DESCRIPTIVE trailing suffix
 * words (group, holdings, indonesia); only pure legal-form words (inc, ltd, ...)
 * are dropped. Use this to decide whether two names are the same company; the
 * more aggressive normalizeCompanyName form is only safe for generating slug
 * guesses ("FUSE GROUP" must not be satisfied by a board called "fuse").
 */
export function normalizeCompanyNameFull(name?: string | null): string {
  const words = companyNameWords(name);
  while (words.length > 1 && LEGAL_FORM_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(' ').trim();
}

/**
 * Checks if a company name is obviously invalid:
 * - Longer than 60 chars
 * - Contains URLs
 * - Contains sentences / sentence phrases
 * - Empty or missing alphanumeric characters
 */
export function isInvalidCompanyName(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 60) return true;

  // URLs
  if (/https?:\/\/|www\.|\.com\/|\.org\/|\.net\//i.test(trimmed)) {
    return true;
  }

  // Sentences indicators
  if (/[?!]/.test(trimmed)) return true;
  if (/\.\s+[A-Z0-9]/i.test(trimmed)) return true;

  const sentencePhraseRegex =
    /\b(is hiring|are hiring|we are|i am|i'm|interested in|looking to|could you|can confirm|apply at|please contact|refer me)\b/i;
  if (sentencePhraseRegex.test(trimmed)) return true;

  const norm = normalizeCompanyName(trimmed);
  if (!norm || norm.length < 2) return true;
  if (!/[a-z0-9]/i.test(norm)) return true;

  return false;
}

