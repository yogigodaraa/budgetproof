# BudgetProof

BudgetProof is an income, expense, GST, tax, debt, merchant, and categorisation dashboard built with Next.js.

This public repository contains the app code and extraction scripts only. Personal financial data, raw statements, generated datasets, local environment files, and deployment configuration are intentionally ignored.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `APP_PASSWORD` and `AUTH_SECRET` in `.env.local`, then open `http://localhost:3000`.

If `data/dataset.json` is missing, the app renders an empty dashboard instead of failing. Generate or import your own local dataset in a private working copy.

## Checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```
