import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';

interface RateLimits {
  [source: string]: number;
}

function loadRateLimits(): RateLimits {
  try {
    const configPath = join(process.cwd(), 'config.yaml');
    const configFile = readFileSync(configPath, 'utf-8');
    const config = parse(configFile);
    return config.rate_limits || {};
  } catch {
    return {};
  }
}

const rateLimits = loadRateLimits();

// Realistic browser User-Agent to avoid being blocked (especially by RemoteOK)
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Create an Axios HTTP client with retry logic and rate limiting.
 */
export function createHttpClient(sourceName: string): AxiosInstance {
  const client = axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  // Configure axios-retry with exponential backoff
  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount) => {
      const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
      logger.warn(`[${sourceName}] Retry #${retryCount} — waiting ${delay}ms`);
      return delay;
    },
    retryCondition: (error) => {
      const status = error.response?.status;
      // Retry on rate limits and server errors
      return status === 429 || status === 500 || status === 502 || status === 503;
    },
  });

  // Request logging
  client.interceptors.request.use((config) => {
    logger.debug(`[${sourceName}] GET ${config.url}`);
    return config;
  });

  // Response logging
  client.interceptors.response.use(
    (response) => {
      logger.debug(
        `[${sourceName}] ${response.status} ${response.statusText} (${
          JSON.stringify(response.data).length
        } bytes)`
      );
      return response;
    },
    (error) => {
      const status = error.response?.status || 'NETWORK_ERROR';
      logger.error(`[${sourceName}] Request failed: ${status} ${error.message}`);
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Wait for the per-source rate limit before the next request.
 */
export async function rateLimit(sourceName: string): Promise<void> {
  const delay = rateLimits[sourceName] || 500;
  await new Promise((resolve) => setTimeout(resolve, delay));
}
