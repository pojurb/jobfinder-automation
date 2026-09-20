import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { getConfigPath } from '../utils/paths';

export interface TitleSearchConfig {
  keywords: string[];
  excluded_keywords: string[];
}

/**
 * Apply the pipeline's title keyword rules before fetching expensive job details.
 */
export function matchesTitleKeywords(title: string, config: TitleSearchConfig): boolean {
  const normalizedTitle = title.toLowerCase();
  const keywords = config.keywords.map((keyword) => keyword.toLowerCase());
  const excluded = config.excluded_keywords.map((keyword) => keyword.toLowerCase());

  return (
    !excluded.some((keyword) => normalizedTitle.includes(keyword)) &&
    keywords.some((keyword) => normalizedTitle.includes(keyword))
  );
}

export function loadTitleSearchConfig(): TitleSearchConfig {
  const config = parse(readFileSync(getConfigPath(), 'utf-8')) as {
    search: TitleSearchConfig;
  };
  return config.search;
}
