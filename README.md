# News Module (GDELT + RSS)

Reusable TypeScript module to fetch and merge news from:
- GDELT (JSON API)
- Multiple RSS/Atom feeds

## Structure

- `src/types.ts`: shared types
- `src/config/feeds.ts`: categories, GDELT queries, RSS feeds
- `src/config/http.ts`: proxy + timeout fetch helpers
- `src/providers/gdelt.ts`: GDELT extractor
- `src/providers/rss.ts`: RSS/Atom extractor
- `src/utils/dedupe.ts`: deduplication logic
- `src/api/news.ts`: aggregator entry points
- `src/index.ts`: public exports

## Quick Usage

```ts
import { fetchCategoryNews, fetchAllNews } from './src/index';

const politics = await fetchCategoryNews('politics');
const all = await fetchAllNews();
```

## Notes

- This module assumes `fetch` is available (browser, SvelteKit, Node 18+).
- CORS proxies are enabled by default for browser usage.
- For server-only usage, set `useProxy: false` in options.
