import { persistDocumentTaxonomy } from '../data/document-taxonomy';
import { getActiveEventTypeKeywordConfigs } from '../data/event-taxonomy';
import {
  getNewsRawById,
  getPendingNewsRaw,
  getRecentNewsRaw,
  replacePipelineNewsRawCategories,
  updateNewsRawClassificationState,
  upsertFetchedNewsRawItems
} from '../data/news-raw';
import type { NewsItem, NewsRawCategoryAssignment, NewsRawRecord } from '../types';
import { fetchArticleContent } from '../utils/article-content';
import { scoreEventTypeConfigs } from '../utils/taxonomy-score';

const ingestedNewsRawByUrl = new Map<string, NewsRawRecord | null>();
const inFlightIngestionsByUrl = new Map<string, Promise<NewsRawRecord | null>>();

function normalizeNewsUrl(url: string): string {
  return url.trim();
}

async function enrichNewsItemBody(item: NewsItem): Promise<NewsItem> {
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

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toConfidence(finalScore: number): number {
  // Keep a simple monotonic mapping for the app layer while preserving raw/final scores in the trace tables.
  return Number(clampConfidence(finalScore / 10).toFixed(4));
}

export async function classifyNewsRawItem(newsRawId: number): Promise<void> {
  const item = await getNewsRawById(newsRawId);
  if (!item) return;

  try {
    const eventTypeConfigs = await getActiveEventTypeKeywordConfigs();
    const scores = scoreEventTypeConfigs(
      {
        title: item.title,
        summary: item.summary,
        body: item.body
      },
      eventTypeConfigs,
      item.ingestion_provider === 'gdelt' ? 'gdelt' : 'rss'
    );
    const assignedScores = scores.filter((score) => score.assigned);
    const primaryCategoryId = assignedScores[0]?.categoryId ?? null;

    await persistDocumentTaxonomy({
      documentId: item.id,
      provider: item.ingestion_provider === 'gdelt' ? 'gdelt' : item.source_type,
      primaryCategoryId,
      scores
    });

    const assignments: NewsRawCategoryAssignment[] = assignedScores.map((score) => ({
      news_raw_id: item.id,
      category_id: score.categoryId,
      confidence: toConfidence(score.finalScore),
      is_primary: score.categoryId === primaryCategoryId,
      assigned_by: 'pipeline'
    }));

    await replacePipelineNewsRawCategories(item.id, assignments);
    await updateNewsRawClassificationState(item.id, assignedScores.length > 0 ? 'classified' : 'unclassified');
  } catch (error) {
    await updateNewsRawClassificationState(item.id, 'error');
    throw error;
  }
}

export async function classifyRecentNewsRaw(limit = 50): Promise<void> {
  const items = await getRecentNewsRaw(limit);
  for (const item of items) {
    await classifyNewsRawItem(item.id);
  }
}

export async function classifyPendingNewsRaw(limit = 50): Promise<void> {
  const items = await getPendingNewsRaw(limit);
  for (const item of items) {
    await classifyNewsRawItem(item.id);
  }
}

export async function ingestAndClassifyNewsRawItem(item: NewsItem): Promise<NewsRawRecord | null> {
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

    await classifyNewsRawItem(persistedItem.id);
    ingestedNewsRawByUrl.set(normalizedUrl, persistedItem);
    return persistedItem;
  })().finally(() => {
    inFlightIngestionsByUrl.delete(normalizedUrl);
  });

  inFlightIngestionsByUrl.set(normalizedUrl, task);
  return task;
}

export async function ingestAndClassifyNewsRawItems(items: NewsItem[]): Promise<NewsRawRecord[]> {
  const dedupedItems = [...new Map(items.map((item) => [normalizeNewsUrl(item.link), item] as const)).values()].filter(
    (item) => normalizeNewsUrl(item.link)
  );
  const persistedItems = await Promise.all(dedupedItems.map((item) => ingestAndClassifyNewsRawItem(item)));
  return persistedItems.filter((item): item is NewsRawRecord => item !== null);
}
