export type NewsCategory = string;
export type NewsProvider = 'gdelt' | 'rss';
export type NewsSourceType = 'gdelt' | 'rss' | 'scrape' | 'api';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  description?: string;
  pubDate: string;
  timestamp: number;
  category: NewsCategory;
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

export interface EventTaxonomyCategoryRecord {
  id: number;
  label: string;
  parent_category_id: number | null;
  slug: string;
  category_type: 'domain' | 'topic' | 'event_type';
  active_for_trendlum: boolean;
  created_at: string;
}

export interface EventTaxonomyKeywordRecord {
  id: number;
  category_id: number;
  keyword: string;
  match_type: 'contains' | 'exact' | 'prefix' | 'regex';
  weight: number;
  active: boolean;
  created_at: string;
}

export interface KeywordRule {
  keyword: string;
  matchType: EventTaxonomyKeywordRecord['match_type'];
  weight: number;
}

export interface DomainKeywordConfig {
  category: EventTaxonomyCategoryRecord;
  eventTypeIds: number[];
  rssKeywordRules: KeywordRule[];
  gdeltKeywordRules: KeywordRule[];
  rssKeywords: string[];
  gdeltKeywords: string[];
}

export interface FetchOptions {
  maxItemsPerProvider?: number;
  maxItemsFinal?: number;
  useProxy?: boolean;
  timeoutMs?: number;
}

export type CategoryNewsMap = Record<string, NewsItem[]>;
