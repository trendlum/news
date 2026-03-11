import type { FeedSource, NewsSourceRecord, NewsSourceType } from '../types';
import { fetchSupabaseRows } from './supabase';

const TABLE_NAME = 'news_sources';

function normalizeType(value: string): NewsSourceType | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'gdelt' || normalized === 'rss' || normalized === 'scrape' || normalized === 'api') {
    return normalized;
  }
  return null;
}

function normalizeDomain(rawUrl: string): string | null {
  try {
    const candidate = rawUrl.match(/^https?:\/\//i) ? rawUrl : `https://${rawUrl}`;
    return new URL(candidate).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

async function fetchActiveSources(): Promise<NewsSourceRecord[]> {
  const rows = await fetchSupabaseRows<Array<Omit<NewsSourceRecord, 'type'> & { type: string }>[number]>(
    'news-sources',
    `${TABLE_NAME}?select=id,name,url,type,is_active,created_at&is_active=eq.true&order=id.asc`
  );
  return Array.isArray(rows)
    ? rows
        .map((row) => {
          const type = normalizeType(row.type);
          if (!type) return null;
          return { ...row, type };
        })
        .filter((row): row is NewsSourceRecord => row !== null)
    : [];
}

export async function getActiveNewsSources(): Promise<NewsSourceRecord[]> {
  return fetchActiveSources();
}

export async function getActiveRssFeeds(): Promise<FeedSource[]> {
  const rows = await getActiveNewsSources();
  return rows
    .filter((row) => normalizeType(row.type) === 'rss')
    .map((row) => ({
      name: row.name.trim(),
      url: row.url.trim()
    }))
    .filter((row) => row.name && row.url);
}

export async function getActiveGdeltDomains(): Promise<string[]> {
  const rows = await getActiveNewsSources();
  const domains = rows
    .filter((row) => normalizeType(row.type) === 'gdelt')
    .map((row) => normalizeDomain(row.url))
    .filter((domain): domain is string => Boolean(domain));

  return [...new Set(domains)];
}
