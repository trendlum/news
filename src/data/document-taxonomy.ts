import type { NewsItem, TaxonomyCategoryScore } from '../types';
import { deleteSupabaseRows, upsertSupabaseRows } from './supabase';

type PersistenceProvider = 'rss' | 'news_api' | 'crawler' | 'manual' | 'other' | 'x' | 'gdelt';

interface DocumentTaxonomyScoreRow {
  document_id: number;
  provider: PersistenceProvider;
  document_category_slug: string;
  taxonomy_category_id: number;
  raw_score: number;
  final_score: number;
  matched_keywords_count: number;
  strong_keywords_count: number;
  has_very_strong_keyword: boolean;
  assigned: boolean;
  is_primary: boolean;
}

interface DocumentTaxonomyMatchRow {
  document_id: number;
  provider: PersistenceProvider;
  taxonomy_category_id: number;
  keyword_id: number;
  matched_keyword: string;
  match_type: 'contains' | 'exact' | 'prefix' | 'regex';
  keyword_weight: number;
  effective_weight: number;
  was_suppressed: boolean;
  matched_text: string | null;
  match_start: number | null;
  match_end: number | null;
  source_field: 'title' | 'summary' | 'body' | null;
}

export interface PersistableDocumentTaxonomy {
  documentId: number;
  provider: PersistenceProvider;
  primaryCategoryId: number | null;
  scores: TaxonomyCategoryScore[];
}

function toPersistenceProvider(provider: NewsItem['provider']): PersistenceProvider {
  if (provider === 'rss') return 'rss';
  if (provider === 'gdelt') return 'gdelt';
  return 'other';
}

function toScoreRowsForDocument(document: PersistableDocumentTaxonomy): DocumentTaxonomyScoreRow[] {
  return document.scores
    .filter((score) => score.matchedKeywordsCount > 0)
    .map((score) => ({
      document_id: document.documentId,
      provider: document.provider,
      document_category_slug: score.categorySlug,
      taxonomy_category_id: score.categoryId,
      raw_score: score.rawScore,
      final_score: score.finalScore,
      matched_keywords_count: score.matchedKeywordsCount,
      strong_keywords_count: score.strongKeywordsCount,
      has_very_strong_keyword: score.hasVeryStrongKeyword,
      assigned: score.assigned,
      is_primary: score.categoryId === document.primaryCategoryId
    }));
}

function toMatchRowsForDocument(document: PersistableDocumentTaxonomy): DocumentTaxonomyMatchRow[] {
  return document.scores.flatMap((score) =>
    score.matches.map((match) => ({
      document_id: document.documentId,
      provider: document.provider,
      taxonomy_category_id: score.categoryId,
      keyword_id: match.keywordId,
      matched_keyword: match.keyword,
      match_type: match.matchType,
      keyword_weight: match.weight,
      effective_weight: match.effectiveWeight,
      was_suppressed: match.wasSuppressed,
      matched_text: match.matchedText,
      match_start: match.matchStart,
      match_end: match.matchEnd,
      source_field: match.sourceField
    }))
  );
}

function toScoreRows(items: NewsItem[]): DocumentTaxonomyScoreRow[] {
  return items.flatMap((item) => {
    if (!item.taxonomy) return [];
    if (!item.newsRawId) return [];
    return toScoreRowsForDocument({
      documentId: item.newsRawId,
      provider: toPersistenceProvider(item.provider),
      primaryCategoryId: item.taxonomy.primaryCategoryId,
      scores: item.taxonomy.eventTypeScores
    });
  });
}

function toMatchRows(items: NewsItem[]): DocumentTaxonomyMatchRow[] {
  return items.flatMap((item) => {
    if (!item.taxonomy) return [];
    if (!item.newsRawId) return [];
    return toMatchRowsForDocument({
      documentId: item.newsRawId,
      provider: toPersistenceProvider(item.provider),
      primaryCategoryId: item.taxonomy.primaryCategoryId,
      scores: item.taxonomy.eventTypeScores
    });
  });
}

async function replaceDocumentTaxonomyRows(document: PersistableDocumentTaxonomy): Promise<void> {
  await deleteSupabaseRows(
    `document_taxonomy_matches?provider=eq.${encodeURIComponent(document.provider)}&document_id=eq.${encodeURIComponent(document.documentId)}`
  );
  await deleteSupabaseRows(
    `document_taxonomy_scores?provider=eq.${encodeURIComponent(document.provider)}&document_id=eq.${encodeURIComponent(document.documentId)}`
  );

  const scoreRows = toScoreRowsForDocument(document);
  const matchRows = toMatchRowsForDocument(document);

  await upsertSupabaseRows('document_taxonomy_scores', scoreRows, 'provider,document_id,taxonomy_category_id');
  await upsertSupabaseRows(
    'document_taxonomy_matches',
    matchRows,
    'provider,document_id,taxonomy_category_id,keyword_id'
  );
}

export async function persistNewsTaxonomy(items: NewsItem[]): Promise<void> {
  const classifiedItems = items.filter((item) => item.taxonomy);
  if (classifiedItems.length === 0) return;

  for (const item of classifiedItems) {
    const taxonomy = item.taxonomy;
    if (!taxonomy) continue;
    if (!item.newsRawId) continue;
    await replaceDocumentTaxonomyRows({
      documentId: item.newsRawId,
      provider: toPersistenceProvider(item.provider),
      primaryCategoryId: taxonomy.primaryCategoryId,
      scores: taxonomy.eventTypeScores
    });
  }
}

export async function persistDocumentTaxonomy(document: PersistableDocumentTaxonomy): Promise<void> {
  await replaceDocumentTaxonomyRows(document);
}
