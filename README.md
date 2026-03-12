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

Workflow docs: `docs/github-actions-pipeline.md`

## Local Commands

```bash
npm run check
npm run check:public
npm run run:news
npm run run:news-raw
```

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
