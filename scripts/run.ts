import {
  fetchAllNews,
  fetchCategoryNews,
  getActiveNewsCategories,
  ingestAndClassifyNewsRawItems,
  ingestNewsRawItems,
  type NewsCategory
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

function shouldPersistTaxonomy(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.PERSIST_TAXONOMY || '').trim().toLowerCase());
}

function shouldIngestNewsRaw(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.INGEST_NEWS_RAW || '').trim().toLowerCase());
}

async function persistFetchedItems(items: NewsItem[]): Promise<void> {
  if (!shouldIngestNewsRaw()) return;

  if (shouldPersistTaxonomy()) {
    await ingestAndClassifyNewsRawItems(items);
    return;
  }

  await ingestNewsRawItems(items);
}

function printCategory(title: string, items: NewsItem[]): void {
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
  const categories = await getActiveNewsCategories();
  const argCategory = process.argv[2] as NewsCategory | 'all' | undefined;

  if (argCategory && argCategory !== 'all') {
    const items = await fetchCategoryNews(argCategory, {
      useProxy: false,
      maxItemsFinal: 40,
      timeoutMs: 12000
    });
    await persistFetchedItems(items);
    printCategory(argCategory, items);
    return;
  }

  const all = await fetchAllNews({
    useProxy: false,
    maxItemsFinal: 20,
    timeoutMs: 12000
  });

  const flatItems = categories.flatMap((category) => all[category]);
  await persistFetchedItems(flatItems);

  categories.forEach((category) => {
    printCategory(category, all[category]);
  });
}

main().catch((error) => {
  console.error('Error running news fetch:', error);
  process.exit(1);
});
