/**
 * Shared types for the job fetcher pipeline.
 */

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  title: string;
  company: string;
  location?: string;
  remoteRegion?: string;
  url: string;
  description?: string;
  salary?: string;
  postedAt?: string;
  contentHash: string;
  rawJson: unknown;
}

export interface JobFetcher {
  name: string;
  fetch(): Promise<NormalizedJob[]>;
}

export interface FetchStats {
  source: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}
