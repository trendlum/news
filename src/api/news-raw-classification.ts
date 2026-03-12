import { persistDocumentTaxonomy } from '../data/document-taxonomy';
import { getActiveEventEntityKeywordRules, getActiveEventTypeKeywordConfigs } from '../data/event-taxonomy';
import {
  getNewsRawById,
  getPendingNewsRaw,
  getRecentNewsRaw,
  replacePipelineNewsRawCategories,
  updateNewsRawClassificationState
} from '../data/news-raw';
import type { NewsRawCategoryAssignment } from '../types';
import { detectDocumentEntities, scoreEventTypeConfigs } from '../utils/taxonomy-score';

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toConfidence(finalScore: number): number {
  return Number(clampConfidence(finalScore / 10).toFixed(4));
}

export async function classifyNewsRawItem(newsRawId: number): Promise<void> {
  const item = await getNewsRawById(newsRawId);
  if (!item) return;

  try {
    const [eventTypeConfigs, entityKeywordRules] = await Promise.all([
      getActiveEventTypeKeywordConfigs(),
      getActiveEventEntityKeywordRules()
    ]);
    const input = {
      title: item.title,
      summary: item.summary,
      body: item.body
    };
    const detectedEntities = detectDocumentEntities(input, entityKeywordRules);
    const scores = scoreEventTypeConfigs(
      input,
      eventTypeConfigs,
      item.ingestion_provider === 'gdelt' ? 'gdelt' : 'rss',
      entityKeywordRules
    );
    const assignedScores = scores.filter((score) => score.assigned);
    const primaryCategoryId = assignedScores[0]?.categoryId ?? null;

    await persistDocumentTaxonomy({
      documentId: item.id,
      provider: item.ingestion_provider === 'gdelt' ? 'gdelt' : item.source_type,
      primaryCategoryId,
      scores,
      detectedEntities
    });

    const assignments: NewsRawCategoryAssignment[] = assignedScores.map((score) => ({
      news_raw_id: item.id,
      category_id: score.categoryId,
      confidence: toConfidence(score.finalScore),
      is_primary: score.categoryId === primaryCategoryId,
      assigned_by: 'pipeline'
    }));

    await replacePipelineNewsRawCategories(item.id, assignments);
    await updateNewsRawClassificationState(item.id, assignedScores.length > 0 ? 'classified' : 'unclassified');
  } catch (error) {
    await updateNewsRawClassificationState(item.id, 'error');
    throw error;
  }
}

export async function classifyRecentNewsRaw(limit = 50): Promise<void> {
  const items = await getRecentNewsRaw(limit);
  for (const item of items) {
    await classifyNewsRawItem(item.id);
  }
}

export async function classifyPendingNewsRaw(limit = 50): Promise<void> {
  const items = await getPendingNewsRaw(limit);
  for (const item of items) {
    await classifyNewsRawItem(item.id);
  }
}
