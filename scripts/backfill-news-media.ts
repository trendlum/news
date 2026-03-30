import { fetchArticleContent } from '../src/utils/article-content';
import { patchSupabaseRows, fetchSupabaseRows } from '../src/data/supabase';

interface NewsRawBackfillCandidate {
  id: number;
  url: string;
  source_name: string;
  source_type: string;
  has_media: boolean | null;
  media_url: string | null;
}

function getLimit(): number {
  const raw = Number.parseInt(process.argv[2] || '10', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 10;
}

async function getCandidates(limit: number): Promise<NewsRawBackfillCandidate[]> {
  return fetchSupabaseRows<NewsRawBackfillCandidate>(
    `news-raw-backfill-${limit}`,
    `news_raw?select=id,url,source_name,source_type,has_media,media_url&source_type=eq.rss&has_media=is.false&order=id.desc&limit=${limit}`
  );
}

async function backfillCandidate(candidate: NewsRawBackfillCandidate): Promise<{
  id: number;
  source: string;
  updated: boolean;
  media_url: string | null;
}> {
  const article = await fetchArticleContent(candidate.url, {
    useProxy: true,
    timeoutMs: 12000
  });

  if (!article.mediaUrl) {
    return {
      id: candidate.id,
      source: candidate.source_name,
      updated: false,
      media_url: null
    };
  }

  await patchSupabaseRows(`news_raw?id=eq.${candidate.id}`, {
    has_media: true,
    media_url: article.mediaUrl
  });

  return {
    id: candidate.id,
    source: candidate.source_name,
    updated: true,
    media_url: article.mediaUrl
  };
}

async function main(): Promise<void> {
  const limit = getLimit();
  const candidates = await getCandidates(limit);
  const results = [];

  for (const candidate of candidates) {
    results.push(await backfillCandidate(candidate));
  }

  const updated = results.filter((result) => result.updated).length;
  console.log(JSON.stringify({ candidates: candidates.length, updated, results }, null, 2));
}

main().catch((error) => {
  console.error('Error backfilling media:', error);
  process.exit(1);
});
