import { upsertFetchedNewsRawItems } from '../data/news-raw';
import type { NewsItem, NewsRawRecord } from '../types';
import { classifyNewsRawItem, classifyPendingNewsRaw, classifyRecentNewsRaw } from './news-raw-classification';

const ingestedNewsRawByUrl = new Map<string, NewsRawRecord | null>();
const inFlightIngestionsByUrl = new Map<string, Promise<NewsRawRecord | null>>();

function normalizeNewsUrl(url: string): string {
  return url.trim();
}

function hasSufficientInlineContent(item: NewsItem): boolean {
  const bodyLength = (item.body || '').trim().length;
  const descriptionLength = (item.description || '').trim().length;
  return bodyLength >= 1200 || (bodyLength >= 600 && descriptionLength >= 160);
}

async function enrichNewsItemBody(item: NewsItem): Promise<NewsItem> {
  if (hasSufficientInlineContent(item)) {
    return item;
  }

  const { fetchArticleContent } = await import('../utils/article-content');
  const article = await fetchArticleContent(item.link, {
    useProxy: true,
    timeoutMs: 12000
  });

  return {
    ...item,
    title: article.title || item.title,
    description: item.description || article.excerpt || '',
    body: article.body || item.body
  };
}

export async function ingestNewsRawItem(item: NewsItem): Promise<NewsRawRecord | null> {
  const normalizedUrl = normalizeNewsUrl(item.link);
  if (!normalizedUrl) return null;

  const cached = ingestedNewsRawByUrl.get(normalizedUrl);
  if (cached !== undefined) return cached;

  const pending = inFlightIngestionsByUrl.get(normalizedUrl);
  if (pending) return pending;

  const task = (async () => {
    const enrichedItem = await enrichNewsItemBody({ ...item, link: normalizedUrl });
    const [persistedItem] = await upsertFetchedNewsRawItems([enrichedItem]);
    if (!persistedItem) {
      ingestedNewsRawByUrl.set(normalizedUrl, null);
      return null;
    }

    ingestedNewsRawByUrl.set(normalizedUrl, persistedItem);
    return persistedItem;
  })().finally(() => {
    inFlightIngestionsByUrl.delete(normalizedUrl);
  });

  inFlightIngestionsByUrl.set(normalizedUrl, task);
  return task;
}

export async function ingestNewsRawItems(items: NewsItem[]): Promise<NewsRawRecord[]> {
  const dedupedItems = [...new Map(items.map((item) => [normalizeNewsUrl(item.link), item] as const)).values()].filter(
    (item) => normalizeNewsUrl(item.link)
  );
  const persistedItems = await Promise.all(dedupedItems.map((item) => ingestNewsRawItem(item)));
  return persistedItems.filter((item): item is NewsRawRecord => item !== null);
}

export async function ingestAndClassifyNewsRawItem(item: NewsItem): Promise<NewsRawRecord | null> {
  const persistedItem = await ingestNewsRawItem(item);
  if (!persistedItem) return null;

  await classifyNewsRawItem(persistedItem.id);
  return persistedItem;
}

export async function ingestAndClassifyNewsRawItems(items: NewsItem[]): Promise<NewsRawRecord[]> {
  const persistedItems = await ingestNewsRawItems(items);
  for (const item of persistedItems) {
    await classifyNewsRawItem(item.id);
  }
  return persistedItems;
}
