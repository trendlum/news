import { classifyNewsRawItem, classifyPendingNewsRaw, classifyRecentNewsRaw } from '../src/index';

async function main(): Promise<void> {
  const rawArg = (process.argv[2] || '').trim();
  const mode = (process.env.NEWS_RAW_MODE || 'pending').trim().toLowerCase();

  if (rawArg) {
    const newsRawId = Number(rawArg);
    if (!Number.isInteger(newsRawId) || newsRawId <= 0) {
      throw new Error(`Invalid news_raw id: ${rawArg}`);
    }

    await classifyNewsRawItem(newsRawId);
    console.log(`Classified news_raw ${newsRawId}`);
    return;
  }

  const limit = Number((process.env.NEWS_RAW_LIMIT || '50').trim());
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

  if (mode === 'recent') {
    await classifyRecentNewsRaw(safeLimit);
    console.log(`Classified latest ${safeLimit} news_raw rows`);
    return;
  }

  await classifyPendingNewsRaw(safeLimit);
  console.log(`Classified up to ${safeLimit} pending news_raw rows`);
}

main().catch((error) => {
  console.error('Error classifying news_raw:', error);
  process.exit(1);
});
