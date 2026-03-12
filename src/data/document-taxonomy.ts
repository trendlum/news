import type { DetectedEntity, TaxonomyCategoryScore } from '../types';
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

interface NewsRawDetectedEntityRow {
  news_raw_id: number;
  entity_type: DetectedEntity['entityType'];
  canonical_name: string;
  total_weight: number;
  max_weight: number;
  match_count: number;
  keyword_ids: number[];
  matched_keywords: string[];
  source_fields: Array<'title' | 'summary' | 'body'>;
  first_matched_text: string | null;
}

export interface PersistableDocumentTaxonomy {
  documentId: number;
  provider: PersistenceProvider;
  primaryCategoryId: number | null;
  scores: TaxonomyCategoryScore[];
  detectedEntities?: DetectedEntity[];
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

function toDetectedEntityRowsForDocument(document: PersistableDocumentTaxonomy): NewsRawDetectedEntityRow[] {
  return (document.detectedEntities || []).map((entity) => ({
    news_raw_id: document.documentId,
    entity_type: entity.entityType,
    canonical_name: entity.canonicalName,
    total_weight: entity.totalWeight,
    max_weight: entity.maxWeight,
    match_count: entity.matchCount,
    keyword_ids: entity.keywordIds,
    matched_keywords: entity.matchedKeywords,
    source_fields: entity.sourceFields,
    first_matched_text: entity.evidence[0]?.matchedText || null
  }));
}

async function replaceDocumentTaxonomyRows(document: PersistableDocumentTaxonomy): Promise<void> {
  await deleteSupabaseRows(
    `document_taxonomy_matches?provider=eq.${encodeURIComponent(document.provider)}&document_id=eq.${encodeURIComponent(document.documentId)}`
  );
  await deleteSupabaseRows(
    `document_taxonomy_scores?provider=eq.${encodeURIComponent(document.provider)}&document_id=eq.${encodeURIComponent(document.documentId)}`
  );
  await deleteSupabaseRows(`news_raw_detected_entities?news_raw_id=eq.${encodeURIComponent(document.documentId)}`);

  const scoreRows = toScoreRowsForDocument(document);
  const matchRows = toMatchRowsForDocument(document);
  const detectedEntityRows = toDetectedEntityRowsForDocument(document);

  await upsertSupabaseRows('document_taxonomy_scores', scoreRows, 'provider,document_id,taxonomy_category_id');
  await upsertSupabaseRows(
    'document_taxonomy_matches',
    matchRows,
    'provider,document_id,taxonomy_category_id,keyword_id'
  );
  await upsertSupabaseRows(
    'news_raw_detected_entities',
    detectedEntityRows,
    'news_raw_id,entity_type,canonical_name'
  );
}

export async function persistDocumentTaxonomy(document: PersistableDocumentTaxonomy): Promise<void> {
  await replaceDocumentTaxonomyRows(document);
}
