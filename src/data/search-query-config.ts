import type { KeywordRule, SearchKeywordRecord, SearchQueryConfig } from '../types';
import { fetchSupabaseRows } from './supabase';

const SEARCH_KEYWORDS_TABLE_NAME = process.env.SCRAPER_KEYWORDS_TABLE || 'event_taxonomy_keywords';

interface SearchKeywordRow {
  id: number;
  category_id: number;
  keyword: string;
  match_type: string;
  weight: string | number;
  active: boolean;
  created_at: string;
}

function normalizeMatchType(value: string): SearchKeywordRecord['match_type'] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'contains' || normalized === 'exact' || normalized === 'prefix' || normalized === 'regex') {
    return normalized;
  }
  return null;
}

function uniqueKeywords(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function toKeywordRules(rows: SearchKeywordRecord[]): KeywordRule[] {
  return rows
    .map((row) => ({
      id: row.id,
      groupId: row.group_id,
      keyword: row.keyword.trim().toLowerCase(),
      matchType: row.match_type,
      weight: row.weight
    }))
    .filter((row) => row.keyword);
}

async function getActiveSearchKeywordRows(): Promise<SearchKeywordRecord[]> {
  const rows = await fetchSupabaseRows<SearchKeywordRow>(
    'search-query-keywords',
    `${SEARCH_KEYWORDS_TABLE_NAME}?select=id,category_id,keyword,match_type,weight,active,created_at&active=eq.true&order=weight.desc,id.asc`
  );

  return rows
    .map((row) => {
      const matchType = normalizeMatchType(row.match_type);
      const weight = Number(row.weight);
      if (!matchType || Number.isNaN(weight)) return null;
      return {
        id: row.id,
        group_id: row.category_id,
        keyword: row.keyword,
        match_type: matchType,
        weight,
        active: row.active,
        created_at: row.created_at
      };
    })
    .filter((row): row is SearchKeywordRecord => row !== null);
}

export async function getSearchQueryConfig(): Promise<SearchQueryConfig> {
  const keywordRows = await getActiveSearchKeywordRows();
  const keywordRules = toKeywordRules(keywordRows);

  return {
    gdeltKeywordRules: keywordRules,
    gdeltKeywords: uniqueKeywords(keywordRules.map((row) => row.keyword))
  };
}
