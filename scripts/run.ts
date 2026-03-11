import {
  fetchAllNews,
  fetchCategoryNews,
  getActiveNewsCategories,
  persistNewsTaxonomy,
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

function printCategory(title: string, items: Awaited<ReturnType<typeof fetchCategoryNews>>): void {
  const counts = countByProvider(items);
  console.log(`\n=== ${title} (${items.length}) | gdelt: ${counts.gdelt} | rss: ${counts.rss} ===`);
  items.slice(0, 8).forEach((item, index) => {
    console.log(`${index + 1}. [${item.provider.toUpperCase()}] ${item.source}`);
    console.log(`   ${item.title}`);
    console.log(`   ${item.link}`);
    console.log(`   ${formatDate(item.timestamp)}`);
    if (shouldDebugTaxonomy() && item.taxonomy) {
      const primary = item.taxonomy.eventTypeScores.find((score) => score.categoryId === item.taxonomy?.primaryCategoryId);
      console.log(
        `   taxonomy: primary=${item.taxonomy.primaryCategorySlug || 'none'} domainScore=${item.taxonomy.domainScore.toFixed(3)}`
      );

      if (primary) {
        const matches = primary.matches
          .map((match) => `${match.keyword} (${match.effectiveWeight.toFixed(1)}${match.wasSuppressed ? ', suppressed' : ''})`)
          .join(', ');
        console.log(
          `   score: final=${primary.finalScore.toFixed(3)} raw=${primary.rawScore.toFixed(3)} matches=${primary.matchedKeywordsCount}`
        );
        console.log(`   keywords: ${matches || 'none'}`);
      }
    }
  });
}

function shouldPersistTaxonomy(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.PERSIST_TAXONOMY || '').trim().toLowerCase());
}

function shouldIngestNewsRaw(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.INGEST_NEWS_RAW || '').trim().toLowerCase());
}

function shouldDebugTaxonomy(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.DEBUG_TAXONOMY || '').trim().toLowerCase());
}

async function main(): Promise<void> {
  const categories = await getActiveNewsCategories();
  const argCategory = process.argv[2] as NewsCategory | 'all' | undefined;
  const persistTaxonomy = shouldPersistTaxonomy();
  const ingestNewsRaw = shouldIngestNewsRaw();

  if (argCategory && argCategory !== 'all') {
    const items = await fetchCategoryNews(argCategory, {
      useProxy: false,
      maxItemsPerProvider: 20,
      maxItemsFinal: 40,
      timeoutMs: 12000,
      ingestNewsRaw
    });
    if (persistTaxonomy && ingestNewsRaw) {
      await persistNewsTaxonomy(items);
    }
    printCategory(argCategory, items);
    return;
  }

  const all = await fetchAllNews({
    useProxy: false,
    maxItemsPerProvider: 12,
    maxItemsFinal: 20,
    timeoutMs: 12000,
    ingestNewsRaw
  });

  if (persistTaxonomy && ingestNewsRaw) {
    await persistNewsTaxonomy(categories.flatMap((category) => all[category]));
  }

  categories.forEach((category) => {
    printCategory(category, all[category]);
  });
}

main().catch((error) => {
  console.error('Error running news fetch:', error);
  process.exit(1);
});
