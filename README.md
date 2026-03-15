# News Pipeline

Internal TypeScript pipeline for:

- fetching news from GDELT and RSS
- ingesting normalized records into `news_raw`
- classifying stored records with taxonomy rules

## Manual Workflows

GitHub Actions is the operational entrypoint:

- `Fetch All News`
- `Fetch Category News`
- `Classify News Raw`
- `Classify News Raw By Id`

`Fetch All News` also runs automatically every 15 minutes. Scheduled runs ingest into `news_raw`, fail if the fetch returns no items, and then classify a pending batch.

## Local Commands

```bash
npm run check
npm run check:public
npm run run:news
npm run run:news-raw
```

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_KEY`
