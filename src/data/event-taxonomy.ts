import type {
  DomainKeywordConfig,
  EventTaxonomyCategoryRecord,
  EventTaxonomyKeywordRecord,
  KeywordRule,
  NewsCategory
} from '../types';
import { fetchSupabaseRows } from './supabase';

const TABLE_NAME = 'event_taxonomy_categories';
const KEYWORDS_TABLE_NAME = 'event_taxonomy_keywords';
const MAX_GDELT_KEYWORDS = 8;

function normalizeCategoryType(value: string): EventTaxonomyCategoryRecord['category_type'] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'domain' || normalized === 'topic' || normalized === 'event_type') return normalized;
  return null;
}

export async function getActiveDomainCategories(): Promise<EventTaxonomyCategoryRecord[]> {
  const rows = await fetchSupabaseRows<
    Omit<EventTaxonomyCategoryRecord, 'category_type'> & { category_type: string }
  >(
    'event-taxonomy-categories',
    `${TABLE_NAME}?select=id,label,parent_category_id,slug,category_type,active_for_trendlum,created_at&active_for_trendlum=eq.true&category_type=eq.domain&order=id.asc`
  );

  return rows
    .map((row) => {
      const categoryType = normalizeCategoryType(row.category_type);
      if (!categoryType) return null;
      return { ...row, category_type: categoryType };
    })
    .filter((row): row is EventTaxonomyCategoryRecord => row !== null);
}

async function getActiveEventTypeCategories(): Promise<EventTaxonomyCategoryRecord[]> {
  const rows = await fetchSupabaseRows<
    Omit<EventTaxonomyCategoryRecord, 'category_type'> & { category_type: string }
  >(
    'event-taxonomy-event-types',
    `${TABLE_NAME}?select=id,label,parent_category_id,slug,category_type,active_for_trendlum,created_at&active_for_trendlum=eq.true&category_type=eq.event_type&order=id.asc`
  );

  return rows
    .map((row) => {
      const categoryType = normalizeCategoryType(row.category_type);
      if (!categoryType) return null;
      return { ...row, category_type: categoryType };
    })
    .filter((row): row is EventTaxonomyCategoryRecord => row !== null);
}

function normalizeMatchType(value: string): EventTaxonomyKeywordRecord['match_type'] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'contains' || normalized === 'exact' || normalized === 'prefix' || normalized === 'regex') {
    return normalized;
  }
  return null;
}

async function getActiveKeywords(): Promise<EventTaxonomyKeywordRecord[]> {
  const rows = await fetchSupabaseRows<
    Omit<EventTaxonomyKeywordRecord, 'match_type' | 'weight'> & { match_type: string; weight: string | number }
  >(
    'event-taxonomy-keywords',
    `${KEYWORDS_TABLE_NAME}?select=id,category_id,keyword,match_type,weight,active,created_at&active=eq.true&order=weight.desc,id.asc`
  );

  return rows
    .map((row) => {
      const matchType = normalizeMatchType(row.match_type);
      const weight = Number(row.weight);
      if (!matchType || Number.isNaN(weight)) return null;
      return { ...row, match_type: matchType, weight };
    })
    .filter((row): row is EventTaxonomyKeywordRecord => row !== null);
}

function uniqueKeywords(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function toKeywordRules(rows: EventTaxonomyKeywordRecord[]): KeywordRule[] {
  return rows
    .map((row) => ({
      keyword: row.keyword.trim().toLowerCase(),
      matchType: row.match_type,
      weight: row.weight
    }))
    .filter((row) => row.keyword);
}

export async function getDomainKeywordConfig(category: NewsCategory): Promise<DomainKeywordConfig | null> {
  const [domainCategories, eventTypes, keywords] = await Promise.all([
    getActiveDomainCategories(),
    getActiveEventTypeCategories(),
    getActiveKeywords()
  ]);

  const domainCategory = domainCategories.find((row) => row.slug.trim().toLowerCase() === category);
  if (!domainCategory) return null;

  const childEventTypes = eventTypes.filter((row) => row.parent_category_id === domainCategory.id);
  const eventTypeIds = childEventTypes.map((row) => row.id);
  if (eventTypeIds.length === 0) {
    return {
      category: domainCategory,
      eventTypeIds: [],
      rssKeywordRules: [],
      gdeltKeywordRules: [],
      rssKeywords: [],
      gdeltKeywords: []
    };
  }

  const keywordRows = keywords.filter((row) => eventTypeIds.includes(row.category_id));
  const sortedKeywords = keywordRows.sort((a, b) => b.weight - a.weight || a.id - b.id);
  const rssKeywordRules = toKeywordRules(sortedKeywords);
  const gdeltKeywordRules = toKeywordRules(sortedKeywords.slice(0, MAX_GDELT_KEYWORDS));
  const rssKeywords = uniqueKeywords(rssKeywordRules.map((row) => row.keyword));
  const gdeltKeywords = uniqueKeywords(gdeltKeywordRules.map((row) => row.keyword));

  return {
    category: domainCategory,
    eventTypeIds,
    rssKeywordRules,
    gdeltKeywordRules,
    rssKeywords,
    gdeltKeywords
  };
}

export async function getActiveNewsCategories(): Promise<NewsCategory[]> {
  const rows = await getActiveDomainCategories();
  return rows.map((row) => row.slug.trim().toLowerCase()).filter(Boolean);
}
