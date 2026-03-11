export type NewsCategory = string;
export type NewsProvider = 'gdelt' | 'rss';
export type NewsSourceType = 'gdelt' | 'rss' | 'scrape' | 'api';
export type NewsRawSourceType = 'rss' | 'gdelt' | 'news_api' | 'crawler' | 'manual' | 'other';
export type NewsRawIngestionProvider = 'rss_direct' | 'gdelt' | 'other';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  description?: string;
  body?: string;
  newsRawId?: number;
  pubDate: string;
  timestamp: number;
  category: NewsCategory;
  provider: NewsProvider;
  taxonomy?: DocumentTaxonomyClassification;
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
  classification_status: 'pending' | 'classified' | 'unclassified' | 'error' | null;
  classified_at: string | null;
  raw: unknown;
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
  id: number;
  categoryId: number;
  keyword: string;
  matchType: EventTaxonomyKeywordRecord['match_type'];
  weight: number;
}

export interface EventTypeKeywordConfig {
  category: EventTaxonomyCategoryRecord;
  parentCategory: EventTaxonomyCategoryRecord | null;
  rssKeywordRules: KeywordRule[];
  gdeltKeywordRules: KeywordRule[];
}

export interface DomainKeywordConfig {
  category: EventTaxonomyCategoryRecord;
  eventTypes: EventTypeKeywordConfig[];
  rssKeywordRules: KeywordRule[];
  gdeltKeywordRules: KeywordRule[];
  rssKeywords: string[];
  gdeltKeywords: string[];
}

export interface TaxonomyKeywordMatch {
  keywordId: number;
  keyword: string;
  matchType: EventTaxonomyKeywordRecord['match_type'];
  weight: number;
  effectiveWeight: number;
  categoryId: number;
  wasSuppressed: boolean;
  matchedText: string | null;
  matchStart: number | null;
  matchEnd: number | null;
  sourceField: 'title' | 'summary' | 'body' | null;
}

export interface TaxonomyCategoryScore {
  categoryId: number;
  categorySlug: string;
  categoryLabel: string;
  rawScore: number;
  finalScore: number;
  matchedKeywordsCount: number;
  strongKeywordsCount: number;
  hasVeryStrongKeyword: boolean;
  assigned: boolean;
  matches: TaxonomyKeywordMatch[];
}

export interface DocumentTaxonomyClassification {
  primaryCategoryId: number | null;
  primaryCategorySlug: string | null;
  domainScore: number;
  assigned: boolean;
  eventTypeScores: TaxonomyCategoryScore[];
}

export interface DocumentTaxonomyInput {
  title?: string | null;
  summary?: string | null;
  body?: string | null;
}

export interface NewsRawCategoryAssignment {
  news_raw_id: number;
  category_id: number;
  confidence: number;
  is_primary: boolean;
  assigned_by: 'pipeline';
}

export interface FetchOptions {
  maxItemsPerProvider?: number;
  maxItemsFinal?: number;
  useProxy?: boolean;
  timeoutMs?: number;
  ingestNewsRaw?: boolean;
}

export type CategoryNewsMap = Record<string, NewsItem[]>;
