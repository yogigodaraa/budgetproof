# BudgetProof

BudgetProof is a local-first budget, income, and expense tracker for imported bank data.

The first public version keeps financial data in the user's browser using IndexedDB. Users can import CSV exports, edit categories, review dashboard totals, and export an encrypted-ready JSON backup file. No transaction data is sent to an app server.

## MVP scope

- Browser-based storage with export/import backup
- CSV transaction import
- JSON backup import
- Editable categories and merchant grouping
- Dashboard totals by month and category
- Synthetic demo data only

## Not included yet

- PDF/OCR bank statement extraction
- Email/password accounts
- Cloud sync
- AI categorisation

These can be added after the local data model is stable.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
