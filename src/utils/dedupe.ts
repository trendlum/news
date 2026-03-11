import type { NewsItem } from '../types';
import { toId } from './hash';

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.searchParams.sort();
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const keyByUrl = normalizeUrl(item.link);
    const keyByText = toId([
      item.title.trim().toLowerCase(),
      item.source.trim().toLowerCase(),
      String(item.timestamp || 0)
    ]);
    const key = keyByUrl || keyByText;

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}
