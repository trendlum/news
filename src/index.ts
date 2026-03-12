export type {
  NewsCategory,
  NewsItem,
  FeedSource,
  FetchOptions,
  CategoryNewsMap,
  EventTaxonomyCategoryRecord,
  EventEntityKeywordRecord,
  EventTaxonomyKeywordRecord,
  DomainKeywordConfig,
  EntityKeywordRule,
  EventTypeKeywordConfig,
  DetectedEntity,
  DocumentTaxonomyClassification,
  TaxonomyCategoryScore,
  TaxonomyKeywordMatch
} from './types';

export {
  getActiveDomainCategories,
  getActiveEventEntityKeywordRules,
  getActiveNewsCategories,
  getDomainKeywordConfig
} from './data/event-taxonomy';
export { fetchCategoryNews, fetchAllNews } from './api/news';
export {
  classifyNewsRawItem,
  classifyPendingNewsRaw,
  classifyRecentNewsRaw
} from './api/news-raw-classification';
export {
  ingestNewsRawItem,
  ingestNewsRawItems,
  ingestAndClassifyNewsRawItem,
  ingestAndClassifyNewsRawItems
} from './api/news-raw';
export { classifyDocumentTaxonomy, detectDocumentEntities } from './utils/taxonomy-score';
