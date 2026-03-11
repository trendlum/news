export type {
  NewsCategory,
  NewsItem,
  FeedSource,
  FetchOptions,
  CategoryNewsMap,
  EventTaxonomyCategoryRecord,
  EventTaxonomyKeywordRecord,
  DomainKeywordConfig,
  EventTypeKeywordConfig,
  DocumentTaxonomyClassification,
  TaxonomyCategoryScore,
  TaxonomyKeywordMatch
} from './types';

export { getActiveDomainCategories, getActiveNewsCategories, getDomainKeywordConfig } from './data/event-taxonomy';
export { persistNewsTaxonomy } from './data/document-taxonomy';
export { fetchCategoryNews, fetchAllNews } from './api/news';
export {
  classifyNewsRawItem,
  classifyPendingNewsRaw,
  classifyRecentNewsRaw,
  ingestAndClassifyNewsRawItem,
  ingestAndClassifyNewsRawItems
} from './api/news-raw';
export { classifyDocumentTaxonomy } from './utils/taxonomy-score';
