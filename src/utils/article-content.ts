import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fetchTextWithProxy } from '../config/http';
import { decodeEntities, stripTags } from './text';

export interface ArticleContent {
  title: string | null;
  excerpt: string | null;
  body: string | null;
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

    return {
      title,
      excerpt: truncate(excerpt, 400),
      body
    };
  } catch {
    return {
      title: null,
      excerpt: null,
      body: null
    };
  }
}
