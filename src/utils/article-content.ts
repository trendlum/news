import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fetchTextWithProxy } from '../config/http';
import { decodeEntities, stripTags } from './text';

export interface ArticleContent {
  title: string | null;
  excerpt: string | null;
  body: string | null;
  mediaUrl: string | null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function extractFirstMetaContent(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute('content')?.trim() || '';
    if (value) return value;
  }
  return null;
}

function extractMediaUrl(document: Document, baseUrl: string): string | null {
  const metaCandidate = extractFirstMetaContent(document, [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]'
  ]);
  const imgCandidate = document.querySelector('article img, main img, img')?.getAttribute('src')?.trim() || '';
  const candidate = metaCandidate || imgCandidate;
  if (!candidate) return null;

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchArticleContent(
  url: string,
  options?: { useProxy?: boolean; timeoutMs?: number }
): Promise<ArticleContent> {
  try {
    const html = await fetchTextWithProxy(url, options);
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
      const jsdomError = error as Error & { type?: string };
      if (jsdomError.type === 'css parsing') return;
      console.error(error.message);
    });

    const dom = new JSDOM(html, { url, virtualConsole });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const body = cleanText(article?.textContent);
    const excerpt = cleanText(article?.excerpt);
    const title = cleanText(article?.title);
    const mediaUrl = extractMediaUrl(dom.window.document, url);

    return {
      title,
      excerpt: truncate(excerpt, 400),
      body,
      mediaUrl
    };
  } catch {
    return {
      title: null,
      excerpt: null,
      body: null,
      mediaUrl: null
    };
  }
}
