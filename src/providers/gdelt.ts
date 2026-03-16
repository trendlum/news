import { fetchWithProxy } from '../config/http';
import { getSearchQueryConfig } from '../data/search-query-config';
import { getActiveGdeltDomains } from '../data/news-sources';
import type { FetchOptions, NewsItem } from '../types';
import { toId } from '../utils/hash';

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string;
  domain?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

const GDELT_MIN_INTERVAL_MS = 4000;
const GDELT_MAX_ATTEMPTS = 3;
const GDELT_DOMAIN_CHUNK_SIZE = 3;
const GDELT_KEYWORD_CHUNK_SIZE = 4;

let lastGdeltRequestAt = 0;
let gdeltQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGdeltTerm(keyword: string): string {
  const cleaned = keyword.trim();
  if (!cleaned) return '';
  return cleaned.includes(' ') ? `"${cleaned}"` : cleaned;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json');
}

async function waitForGdeltSlot(): Promise<void> {
  const previous = gdeltQueue;
  let release!: () => void;
  gdeltQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  const waitMs = Math.max(0, GDELT_MIN_INTERVAL_MS - (Date.now() - lastGdeltRequestAt));
  if (waitMs > 0) await sleep(waitMs);
  lastGdeltRequestAt = Date.now();
  release();
}

function parseGdeltDate(input: string): number {
  const match = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).getTime();
  }
  const parsed = new Date(input).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function toNewsItem(article: GdeltArticle, index: number): NewsItem {
  const title = (article.title || '').trim();
  const link = (article.url || '').trim();
  const pubDate = (article.seendate || '').trim();
  const timestamp = parseGdeltDate(pubDate);
  const source = (article.domain || 'GDELT').trim();

  return {
    id: `gdelt-${toId([link, pubDate, String(index)])}`,
    title,
    link,
    source,
    description: '',
    pubDate,
    timestamp,
    provider: 'gdelt'
  };
}

export async function fetchFromGdelt(options?: FetchOptions): Promise<NewsItem[]> {
  const queryConfig = await getSearchQueryConfig().catch(() => null);
  if (!queryConfig || queryConfig.gdeltKeywordRules.length === 0) return [];

  const keywordGroups = chunk(uniqueKeywords(queryConfig.gdeltKeywordRules.map((rule) => rule.keyword)), GDELT_KEYWORD_CHUNK_SIZE);
  const domains = await getActiveGdeltDomains().catch(() => []);
  const domainGroups = domains.length > 0 ? chunk(domains, GDELT_DOMAIN_CHUNK_SIZE) : [[]];
  const merged: NewsItem[] = [];

  try {
    for (const keywords of keywordGroups) {
      const query = `(${keywords.map((keyword) => toGdeltTerm(keyword)).join(' OR ')})`;

      for (const group of domainGroups) {
        const domainFilter = group.length > 0 ? ` (${group.map((domain) => `domain:${domain}`).join(' OR ')})` : '';
        const fullQuery = `${query}${domainFilter} sourcelang:english`;
        const url =
          'https://api.gdeltproject.org/api/v2/doc/doc?' +
          `query=${encodeURIComponent(fullQuery)}&timespan=7d&mode=artlist&format=json&sort=date`;

        for (let attempt = 1; attempt <= GDELT_MAX_ATTEMPTS; attempt += 1) {
          await waitForGdeltSlot();
          const response = await fetchWithProxy(url, {
            useProxy: options?.useProxy,
            timeoutMs: options?.timeoutMs
          });

          if (response.status === 429) {
            if (attempt === GDELT_MAX_ATTEMPTS) break;
            await sleep(GDELT_MIN_INTERVAL_MS);
            continue;
          }

          if (!response.ok || !isJsonResponse(response)) break;

          const raw = (await response.json()) as GdeltResponse;
          const articles = raw.articles || [];
          const newsItems = articles
            .map((item, index) => toNewsItem(item, merged.length + index))
            .filter((item) => item.title && item.link);
          merged.push(...newsItems);
          break;
        }
      }
    }

    return merged;
  } catch {
    return [];
  }
}
