import type {
  DomainKeywordConfig,
  EntityKeywordRule,
  EventEntityKeywordRecord,
  EventTaxonomyCategoryRecord,
  EventTaxonomyKeywordRecord,
  EventTypeKeywordConfig,
  KeywordRule,
  NewsCategory
} from '../types';
import { fetchSupabaseRows } from './supabase';

const TABLE_NAME = 'event_taxonomy_categories';
const KEYWORDS_TABLE_NAME = 'event_taxonomy_keywords';
const ENTITY_KEYWORDS_TABLE_NAME = 'event_entity_keywords';
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

export async function getActiveEventTypeKeywordConfigs(): Promise<EventTypeKeywordConfig[]> {
  const [domainCategories, eventTypeCategories, keywords, entityKeywordRules] = await Promise.all([
    getActiveDomainCategories(),
    getActiveEventTypeCategories(),
    getActiveKeywords(),
    getActiveEventEntityKeywordRules()
  ]);

  const sortedKeywords = [...keywords].sort((a, b) => b.weight - a.weight || a.id - b.id);

  return eventTypeCategories.map((eventType) => {
    const eventKeywords = sortedKeywords.filter((row) => row.category_id === eventType.id);
    const parentCategory = domainCategories.find((row) => row.id === eventType.parent_category_id) ?? null;

    return {
      category: eventType,
      parentCategory,
      rssKeywordRules: toKeywordRules(eventKeywords),
      gdeltKeywordRules: toKeywordRules(eventKeywords),
      entityKeywordRules
    };
  });
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

function normalizeEntityType(value: string): EventEntityKeywordRecord['entity_type'] | null {
  const normalized = value.trim().toLowerCase();
  const allowedEntityTypes: EventEntityKeywordRecord['entity_type'][] = [
    'country',
    'region',
    'city',
    'waterway',
    'leader',
    'political_party',
    'military',
    'international_organization',
    'central_bank',
    'stock_index',
    'currency',
    'rating_agency',
    'company',
    'bank',
    'commodity',
    'pipeline',
    'port',
    'airport',
    'bridge',
    'canal',
    'data_center',
    'satellite',
    'space_agency',
    'militia',
    'terrorist_group',
    'military_base',
    'disease',
    'virus',
    'vaccine',
    'health_agency',
    'climate_event',
    'natural_disaster'
  ];

  return allowedEntityTypes.includes(normalized as EventEntityKeywordRecord['entity_type'])
    ? (normalized as EventEntityKeywordRecord['entity_type'])
    : null;
}

async function getActiveEntityKeywords(): Promise<EventEntityKeywordRecord[]> {
  const rows = await fetchSupabaseRows<
    Omit<EventEntityKeywordRecord, 'entity_type' | 'match_type' | 'weight'> & {
      entity_type: string;
      match_type: string;
      weight: string | number;
    }
  >(
    'event-entity-keywords',
    `${ENTITY_KEYWORDS_TABLE_NAME}?select=id,entity_type,canonical_name,keyword,match_type,weight,active,created_at&active=eq.true&order=weight.desc,id.asc`
  );

  return rows
    .map((row) => {
      const entityType = normalizeEntityType(row.entity_type);
      const matchType = normalizeMatchType(row.match_type);
      const canonicalName = row.canonical_name.trim();
      const keyword = row.keyword.trim();
      const weight = Number(row.weight);
      if (!entityType || !matchType || !canonicalName || !keyword || Number.isNaN(weight)) return null;
      return {
        ...row,
        entity_type: entityType,
        canonical_name: canonicalName,
        keyword,
        match_type: matchType,
        weight
      };
    })
    .filter((row): row is EventEntityKeywordRecord => row !== null);
}

function uniqueKeywords(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function toKeywordRules(rows: EventTaxonomyKeywordRecord[]): KeywordRule[] {
  return rows
    .map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      keyword: row.keyword.trim().toLowerCase(),
      matchType: row.match_type,
      weight: row.weight
    }))
    .filter((row) => row.keyword);
}

function toEntityKeywordRules(rows: EventEntityKeywordRecord[]): EntityKeywordRule[] {
  return rows
    .map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      canonicalName: row.canonical_name.trim(),
      keyword: row.keyword.trim().toLowerCase(),
      matchType: row.match_type,
      weight: row.weight
    }))
    .filter((row) => row.canonicalName && row.keyword);
}

export async function getActiveEventEntityKeywordRules(): Promise<EntityKeywordRule[]> {
  const rows = await getActiveEntityKeywords();
  return toEntityKeywordRules(rows);
}

export async function getDomainKeywordConfig(category: NewsCategory): Promise<DomainKeywordConfig | null> {
  const [domainCategories, eventTypeCategories, keywords, entityKeywordRules] = await Promise.all([
    getActiveDomainCategories(),
    getActiveEventTypeCategories(),
    getActiveKeywords(),
    getActiveEventEntityKeywordRules()
  ]);

  const domainCategory = domainCategories.find((row) => row.slug.trim().toLowerCase() === category);
  if (!domainCategory) return null;

  const childEventTypes = eventTypeCategories.filter((row) => row.parent_category_id === domainCategory.id);
  const eventTypeIds = childEventTypes.map((row) => row.id);
  if (eventTypeIds.length === 0) {
    return {
      category: domainCategory,
      eventTypes: [],
      rssKeywordRules: [],
      gdeltKeywordRules: [],
      entityKeywordRules,
      rssKeywords: [],
      gdeltKeywords: []
    };
  }

  const keywordRows = keywords.filter((row) => eventTypeIds.includes(row.category_id));
  const sortedKeywords = keywordRows.sort((a, b) => b.weight - a.weight || a.id - b.id);
  const eventTypes: EventTypeKeywordConfig[] = childEventTypes.map((eventType) => {
    const eventKeywords = sortedKeywords.filter((row) => row.category_id === eventType.id);
    return {
      category: eventType,
      parentCategory: domainCategory,
      rssKeywordRules: toKeywordRules(eventKeywords),
      gdeltKeywordRules: toKeywordRules(eventKeywords),
      entityKeywordRules
    };
  });
  const rssKeywordRules = toKeywordRules(sortedKeywords);
  const gdeltKeywordRules = toKeywordRules(sortedKeywords);
  const rssKeywords = uniqueKeywords(rssKeywordRules.map((row) => row.keyword));
  const gdeltKeywords = uniqueKeywords(gdeltKeywordRules.map((row) => row.keyword));

  return {
    category: domainCategory,
    eventTypes,
    rssKeywordRules,
    gdeltKeywordRules,
    entityKeywordRules,
    rssKeywords,
    gdeltKeywords
  };
}

export async function getActiveNewsCategories(): Promise<NewsCategory[]> {
  const rows = await getActiveDomainCategories();
  return rows.map((row) => row.slug.trim().toLowerCase()).filter(Boolean);
}
