import type { NewsItem, NewsRawIngestionProvider, NewsRawRecord, NewsRawSourceType } from '../types';
import { upsertSupabaseRowsReturning } from './supabase';

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
    raw: {
      provider: item.provider,
      source: item.source,
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
