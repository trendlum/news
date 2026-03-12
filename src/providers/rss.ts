import { fetchTextWithProxy } from '../config/http';
import { getDomainKeywordConfig } from '../data/event-taxonomy';
import { getActiveRssFeeds } from '../data/news-sources';
import type { FeedSource, FetchOptions, NewsCategory, NewsItem } from '../types';
import { toId } from '../utils/hash';
import { classifyDocumentTaxonomy } from '../utils/taxonomy-score';
import { cleanXmlValue } from '../utils/text';

function extractTag(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(pattern);
  return cleanXmlValue(match?.[1] || '');
}

function extractLinkFromAtom(block: string): string {
  const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch?.[1]) return hrefMatch[1].trim();
  return extractTag(block, 'link');
}

function parseItems(xml: string, entryTag: 'item' | 'entry'): string[] {
  const pattern = new RegExp(`<${entryTag}[^>]*>([\\s\\S]*?)<\\/${entryTag}>`, 'gi');
  const blocks: string[] = [];
  let match = pattern.exec(xml);
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(xml);
  }
  return blocks;
}

function parseDate(raw: string): number {
  const value = new Date(raw).getTime();
  return Number.isNaN(value) ? Date.now() : value;
}

function toNewsItem(
  block: string,
  category: NewsCategory,
  feed: FeedSource,
  index: number,
  isAtom: boolean
): NewsItem | null {
  const title = extractTag(block, 'title');
  const link = isAtom ? extractLinkFromAtom(block) : extractTag(block, 'link');
  const description = extractTag(block, 'description') || extractTag(block, 'summary');
  const body =
    extractTag(block, 'content:encoded') ||
    extractTag(block, 'content') ||
    extractTag(block, 'media:description') ||
    description;
  const pubDate = isAtom ? extractTag(block, 'updated') || extractTag(block, 'published') : extractTag(block, 'pubDate');
  const timestamp = parseDate(pubDate);

  if (!title || !link) return null;

  return {
    id: `rss-${toId([category, feed.name, link, String(index)])}`,
    title,
    link,
    source: feed.name,
    description,
    body,
    pubDate,
    timestamp,
    category,
    provider: 'rss'
  };
}

export async function fetchFromSingleRssFeed(
  category: NewsCategory,
  feed: FeedSource,
  options?: FetchOptions
): Promise<NewsItem[]> {
  try {
    const xml = await fetchTextWithProxy(feed.url, {
      useProxy: options?.useProxy,
      timeoutMs: options?.timeoutMs
    });

    const itemBlocks = parseItems(xml, 'item');
    const atomBlocks = itemBlocks.length === 0 ? parseItems(xml, 'entry') : [];
    const isAtom = itemBlocks.length === 0;
    const blocks = isAtom ? atomBlocks : itemBlocks;
    const items = blocks
      .map((block, index) => toNewsItem(block, category, feed, index, isAtom))
      .filter((item): item is NewsItem => item !== null);
    return items;
  } catch {
    return [];
  }
}

export async function fetchFromRssCategory(
  category: NewsCategory,
  options?: FetchOptions
): Promise<NewsItem[]> {
  const keywordConfig = await getDomainKeywordConfig(category).catch(() => null);
  if (!keywordConfig || keywordConfig.rssKeywordRules.length === 0) return [];

  const dynamicFeeds = await getActiveRssFeeds().catch(() => []);
  if (dynamicFeeds.length === 0) return [];

  const settled = await Promise.allSettled(
    dynamicFeeds.map((feed) => fetchFromSingleRssFeed(category, feed, options))
  );

  const merged: NewsItem[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') merged.push(...result.value);
  }

  return merged.flatMap((item) => {
    const taxonomy = classifyDocumentTaxonomy(
      {
        title: item.title,
        summary: item.description || '',
        body: item.body || ''
      },
      keywordConfig,
      'rss'
    );
    if (!taxonomy.assigned) return [];
    return [{ ...item, taxonomy }];
  });
}
