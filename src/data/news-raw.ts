import type {
  NewsItem,
  NewsRawCategoryAssignment,
  NewsRawIngestionProvider,
  NewsRawRecord,
  NewsRawSourceType
} from '../types';
import {
  deleteSupabaseRows,
  fetchSupabaseRows,
  patchSupabaseRows,
  upsertSupabaseRows,
  upsertSupabaseRowsReturning
} from './supabase';

interface NewsRawCategoryRow extends NewsRawCategoryAssignment {}
interface PipelineCategoryRefRow {
  news_raw_id: number;
}

interface NewsRawInsertRow {
  id?: number;
  source_name: string;
  source_type: NewsRawSourceType;
  ingestion_provider: NewsRawIngestionProvider;
  title: string | null;
  body: string | null;
  summary: string | null;
  url: string;
  author: string | null;
  published_at: string | null;
  language_code: string | null;
  classification_status?: 'pending' | 'classified' | 'unclassified' | 'error' | null;
  classified_at?: string | null;
  raw: unknown;
}

function normalizeSourceType(value: string): NewsRawSourceType | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'rss' ||
    normalized === 'gdelt' ||
    normalized === 'news_api' ||
    normalized === 'crawler' ||
    normalized === 'manual' ||
    normalized === 'other'
  ) {
    return normalized;
  }
  return null;
}

function normalizeIngestionProvider(value: string): NewsRawIngestionProvider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'rss_direct' || normalized === 'gdelt' || normalized === 'other') {
    return normalized;
  }
  return null;
}

function encodeFilterValue(value: string): string {
  return encodeURIComponent(value);
}

export async function getNewsRawById(id: number): Promise<NewsRawRecord | null> {
  const rows = await fetchSupabaseRows<
    Omit<NewsRawRecord, 'source_type' | 'ingestion_provider'> & { source_type: string; ingestion_provider: string | null }
  >(
    `news-raw-${id}`,
    `news_raw?select=id,source_name,source_type,ingestion_provider,title,body,summary,url,author,published_at,scraped_at,language_code,classification_status,classified_at,raw,created_at&id=eq.${id}&limit=1`
  );

  const row = rows[0];
  if (!row) return null;
  const sourceType = normalizeSourceType(row.source_type);
  const ingestionProvider = row.ingestion_provider ? normalizeIngestionProvider(row.ingestion_provider) : null;
  if (!sourceType) return null;
  return { ...row, source_type: sourceType, ingestion_provider: ingestionProvider };
}

export async function getRecentNewsRaw(limit = 50): Promise<NewsRawRecord[]> {
  const rows = await fetchSupabaseRows<
    Omit<NewsRawRecord, 'source_type' | 'ingestion_provider'> & { source_type: string; ingestion_provider: string | null }
  >(
    `news-raw-recent-${limit}`,
    `news_raw?select=id,source_name,source_type,ingestion_provider,title,body,summary,url,author,published_at,scraped_at,language_code,classification_status,classified_at,raw,created_at&order=scraped_at.desc&limit=${limit}`
  );

  return rows
    .map((row) => {
      const sourceType = normalizeSourceType(row.source_type);
      const ingestionProvider = row.ingestion_provider ? normalizeIngestionProvider(row.ingestion_provider) : null;
      if (!sourceType) return null;
      return { ...row, source_type: sourceType, ingestion_provider: ingestionProvider };
    })
    .filter((row): row is NewsRawRecord => row !== null);
}

export async function getPendingNewsRaw(limit = 50): Promise<NewsRawRecord[]> {
  const windowSize = Math.max(limit * 5, 100);
  const recentItems = await getRecentNewsRaw(windowSize);
  if (recentItems.length === 0) return [];
  return recentItems
    .filter((item) => !item.classification_status || item.classification_status === 'pending')
    .slice(0, limit);
}

export async function replacePipelineNewsRawCategories(
  newsRawId: number,
  assignments: NewsRawCategoryAssignment[]
): Promise<void> {
  await deleteSupabaseRows(
    `news_raw_categories?news_raw_id=eq.${newsRawId}&assigned_by=eq.${encodeFilterValue('pipeline')}`
  );

  if (assignments.length === 0) return;

  const rows: NewsRawCategoryRow[] = assignments.map((assignment) => ({
    news_raw_id: assignment.news_raw_id,
    category_id: assignment.category_id,
    confidence: assignment.confidence,
    is_primary: assignment.is_primary,
    assigned_by: 'pipeline'
  }));

  await upsertSupabaseRows('news_raw_categories', rows, 'news_raw_id,category_id,assigned_by');
}

export async function updateNewsRawClassificationState(
  newsRawId: number,
  status: 'pending' | 'classified' | 'unclassified' | 'error'
): Promise<void> {
  const classifiedAt = status === 'classified' || status === 'unclassified' ? new Date().toISOString() : null;
  await patchSupabaseRows(`news_raw?id=eq.${newsRawId}`, {
    classification_status: status,
    classified_at: classifiedAt
  });
}

function toNewsRawSourceType(provider: NewsItem['provider']): NewsRawSourceType {
  if (provider === 'rss') return 'rss';
  if (provider === 'gdelt') return 'gdelt';
  return 'other';
}

function toNewsRawIngestionProvider(provider: NewsItem['provider']): NewsRawIngestionProvider {
  if (provider === 'rss') return 'rss_direct';
  if (provider === 'gdelt') return 'gdelt';
  return 'other';
}

function toPublishedAt(item: NewsItem): string | null {
  if (item.pubDate) {
    const direct = new Date(item.pubDate);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  }

  if (!Number.isNaN(item.timestamp)) {
    const fallback = new Date(item.timestamp);
    if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  }

  return null;
}

export async function upsertFetchedNewsRawItems(items: NewsItem[]): Promise<NewsRawRecord[]> {
  if (items.length === 0) return [];

  const rows: NewsRawInsertRow[] = items.map((item) => ({
    source_name: item.source,
    source_type: toNewsRawSourceType(item.provider),
    ingestion_provider: toNewsRawIngestionProvider(item.provider),
    title: item.title || null,
    body: item.body || null,
    summary: item.description || null,
    url: item.link,
    author: null,
    published_at: toPublishedAt(item),
    language_code: null,
    classification_status: 'pending',
    classified_at: null,
    raw: {
      provider: item.provider,
      source: item.source,
      category: item.category,
      fetched_item_id: item.id,
      title: item.title,
      description: item.description || '',
      link: item.link,
      pubDate: item.pubDate,
      timestamp: item.timestamp
    }
  }));

  const insertedRows = await upsertSupabaseRowsReturning<
    NewsRawInsertRow,
    Omit<NewsRawRecord, 'source_type' | 'ingestion_provider'> & { source_type: string; ingestion_provider: string | null }
  >('news_raw', rows, 'url');

  return insertedRows
    .map((row) => {
      const sourceType = normalizeSourceType(row.source_type);
      const ingestionProvider = row.ingestion_provider ? normalizeIngestionProvider(row.ingestion_provider) : null;
      if (!sourceType) return null;
      return { ...row, source_type: sourceType, ingestion_provider: ingestionProvider };
    })
    .filter((row): row is NewsRawRecord => row !== null);
}
