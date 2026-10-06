# DeckChek database

DeckChek uses SQLite.

Development initialization:

```sh
sqlite3 deckchek.db < database/migrations/0001_initial.sql
sqlite3 deckchek.db < database/seed.sql
```

The application should run migrations itself in production. These shell commands are only a development/manual inspection path.

The starter seed is source-backed and deliberately small. It exists to exercise catalog, comparison, provenance, and DVS-media UI. Manufacturer specifications must remain distinct from DeckChek measurements.

See:
- `docs/SPEC-04-comparison-database.md`
- `docs/SPEC-07-data-model-api.md`
- `docs/RESEARCH.md`
