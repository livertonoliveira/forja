# Changelog

## [0.1.4] — 2026-04-20
### Added
- Cache token cost tracking: `cache_creation_input_tokens` and `cache_read_input_tokens` from the Claude API are now priced correctly (write = 1.25×, read = 0.10× of input price) and stored in both DB and JSONL modes
- Auto-migration for local databases: pending migrations are applied automatically on startup
- Pending migration warning for remote databases: a clear message tells users to run `forja infra migrate`

### Migration notes
- **Database migration required**: run `forja infra migrate` if using a remote/managed database. Local databases (localhost) will auto-migrate on next startup.

## [0.1.0] — 2026-04-17
### Adicionado
- Esqueleto inicial do projeto (M0 Fundação)
