# Changelog

## 1.0.0

Complete rewrite. Replaces the previous interactive REPL implementation
(`yuque-cli@0.1.x`) with a spec-driven, scriptable CLI:

- 26 noun-verb commands covering all 38 operations of the Yuque OpenAPI —
  auth/ping, user, search, repos, docs (incl. version history), TOC, group
  members, and team statistics; repos accept a numeric id or `owner/slug`
  everywhere.
- Token auth via `YUQUE_TOKEN` / `--token` (flag wins; `YUQUE_PERSONAL_TOKEN`
  compatibility fallback); custom hosts via `YUQUE_HOST` / `--host`; timeouts
  via `YUQUE_TIMEOUT_MS` / `--timeout`.
- Human-readable output with `--json` full-payload mode, stable exit codes
  (0/1/2/3/4/5), `--all` pagination, automatic backoff on rate limits (writes
  are never silently replayed), and confirmation gates on destructive commands.
- Command surface locked 1:1 against the vendored OpenAPI spec by contract
  tests; functional e2e suite drives the built binary in CI.
