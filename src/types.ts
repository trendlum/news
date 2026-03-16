export type NewsProvider = 'gdelt' | 'rss';
export type NewsSourceType = 'gdelt' | 'rss' | 'scrape' | 'api';
export type NewsRawSourceType = 'rss' | 'gdelt' | 'news_api' | 'crawler' | 'manual' | 'other';
export type NewsRawIngestionProvider = 'rss_direct' | 'gdelt' | 'other';
export type KeywordMatchType = 'contains' | 'exact' | 'prefix' | 'regex';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  description?: string;
  body?: string;
  pubDate: string;
  timestamp: number;
  provider: NewsProvider;
}

export interface FeedSource {
  name: string;
  url: string;
}

export interface NewsSourceRecord {
  id: number;
  name: string;
  url: string;
  type: NewsSourceType;
  is_active: boolean;
  created_at: string;
}

export interface NewsRawRecord {
  id: number;
  source_name: string;
  source_type: NewsRawSourceType;
  ingestion_provider: NewsRawIngestionProvider | null;
  title: string | null;
  body: string | null;
  summary: string | null;
  url: string;
  author: string | null;
  published_at: string | null;
  scraped_at: string;
  language_code: string | null;
  raw: unknown;
  created_at: string;
}

export interface SearchKeywordRecord {
  id: number;
  group_id: number;
  keyword: string;
  match_type: KeywordMatchType;
  weight: number;
  active: boolean;
  created_at: string;
}

export interface KeywordRule {
  id: number;
  groupId: number;
  keyword: string;
  matchType: KeywordMatchType;
  weight: number;
}

export interface SearchQueryConfig {
  gdeltKeywordRules: KeywordRule[];
  gdeltKeywords: string[];
}

export interface FetchOptions {
  maxItemsFinal?: number;
  useProxy?: boolean;
  timeoutMs?: number;
}
