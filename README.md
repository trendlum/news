# News Pipeline

Internal TypeScript pipeline for:

- fetching news from GDELT and RSS
- ingesting normalized records into `news_raw`

## Manual Workflows

GitHub Actions is the operational entrypoint:

- `Fetch All News`

`Fetch All News` also runs automatically every 15 minutes. Scheduled runs only scrape and ingest into `news_raw`.

## Local Commands

```bash
npm run check
npm run check:public
npm run run:news
```

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_KEY`
