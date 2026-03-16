import {
  fetchAllNews,
  ingestNewsRawItems
} from '../src/index';
import type { NewsItem } from '../src/types';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return 'invalid-date';
  }
}

function countByProvider(items: NewsItem[]): Record<'gdelt' | 'rss', number> {
  return items.reduce(
    (acc, item) => {
      acc[item.provider] += 1;
      return acc;
    },
    { gdelt: 0, rss: 0 }
  );
}

function shouldIngestNewsRaw(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.INGEST_NEWS_RAW || '').trim().toLowerCase());
}

function shouldFailOnEmptyResults(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.FAIL_ON_EMPTY_RESULTS || '').trim().toLowerCase());
}

function getMinFetchedItems(): number {
  const raw = Number((process.env.MIN_FETCHED_ITEMS || '0').trim());
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

async function persistFetchedItems(items: NewsItem[]): Promise<void> {
  if (!shouldIngestNewsRaw()) return;

  await ingestNewsRawItems(items);
}

function printNews(title: string, items: NewsItem[]): void {
  const counts = countByProvider(items);
  console.log(`\n=== ${title} (${items.length}) | gdelt: ${counts.gdelt} | rss: ${counts.rss} ===`);
  items.slice(0, 8).forEach((item, index) => {
    console.log(`${index + 1}. [${item.provider.toUpperCase()}] ${item.source}`);
    console.log(`   ${item.title}`);
    console.log(`   ${item.link}`);
    console.log(`   ${formatDate(item.timestamp)}`);
  });
}

async function main(): Promise<void> {
  const failOnEmptyResults = shouldFailOnEmptyResults();
  const minFetchedItems = getMinFetchedItems();

  const all = await fetchAllNews({
    useProxy: false,
    maxItemsFinal: 20,
    timeoutMs: 12000
  });

  if (failOnEmptyResults && all.length < Math.max(1, minFetchedItems)) {
    throw new Error(`Fetch returned ${all.length} items`);
  }
  await persistFetchedItems(all);
  printNews('all news', all);
}

main().catch((error) => {
  console.error('Error running news fetch:', error);
  process.exit(1);
});
