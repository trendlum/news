import { fetchFromGdelt } from '../providers/gdelt';
import { fetchFromRss } from '../providers/rss';
import type { FetchOptions, NewsItem } from '../types';
import { dedupeNews } from '../utils/dedupe';

const DEFAULT_OPTIONS: Required<Pick<FetchOptions, 'maxItemsFinal' | 'useProxy' | 'timeoutMs'>> = {
  maxItemsFinal: 50,
  useProxy: true,
  timeoutMs: 15000
};

function mergeOptions(options?: FetchOptions): Required<FetchOptions> {
  return {
    maxItemsFinal: options?.maxItemsFinal ?? DEFAULT_OPTIONS.maxItemsFinal,
    useProxy: options?.useProxy ?? DEFAULT_OPTIONS.useProxy,
    timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs
  };
}

function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchAllNews(options?: FetchOptions): Promise<NewsItem[]> {
  const cfg = mergeOptions(options);
  const [gdeltItems, rssItems] = await Promise.all([fetchFromGdelt(cfg).catch(() => []), fetchFromRss(cfg).catch(() => [])]);
  return sortNews(dedupeNews([...gdeltItems, ...rssItems])).slice(0, cfg.maxItemsFinal);
}
