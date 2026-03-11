import { getActiveNewsCategories } from '../data/event-taxonomy';
import { fetchFromGdelt } from '../providers/gdelt';
import { fetchFromRssCategory } from '../providers/rss';
import type { CategoryNewsMap, FetchOptions, NewsCategory, NewsItem } from '../types';
import { dedupeNews } from '../utils/dedupe';

const DEFAULT_OPTIONS: Required<Pick<FetchOptions, 'maxItemsPerProvider' | 'maxItemsFinal' | 'useProxy' | 'timeoutMs'>> = {
  maxItemsPerProvider: 30,
  maxItemsFinal: 50,
  useProxy: true,
  timeoutMs: 15000
};

function mergeOptions(options?: FetchOptions): Required<FetchOptions> {
  return {
    maxItemsPerProvider: options?.maxItemsPerProvider ?? DEFAULT_OPTIONS.maxItemsPerProvider,
    maxItemsFinal: options?.maxItemsFinal ?? DEFAULT_OPTIONS.maxItemsFinal,
    useProxy: options?.useProxy ?? DEFAULT_OPTIONS.useProxy,
    timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs
  };
}

function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchCategoryNews(
  category: NewsCategory,
  options?: FetchOptions
): Promise<NewsItem[]> {
  const cfg = mergeOptions(options);

  const [gdelt, rss] = await Promise.all([
    fetchFromGdelt(category, cfg),
    fetchFromRssCategory(category, cfg)
  ]);

  const merged = dedupeNews([...gdelt, ...rss]);
  return sortNews(merged).slice(0, cfg.maxItemsFinal);
}

export async function fetchAllNews(options?: FetchOptions): Promise<CategoryNewsMap> {
  const categories = await getActiveNewsCategories();
  const result: CategoryNewsMap = Object.fromEntries(categories.map((category) => [category, []]));

  const settled = await Promise.allSettled(
    categories.map((category) => fetchCategoryNews(category, options))
  );

  settled.forEach((entry, index) => {
    const category = categories[index];
    result[category] = entry.status === 'fulfilled' ? entry.value : [];
  });

  return result;
}
