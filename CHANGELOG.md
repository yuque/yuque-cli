# Changelog

## 0.1.0 (unreleased)

- Initial release: 26 commands covering the full Yuque OpenAPI surface (38 operations) —
  auth/ping, user, search, repos, docs (incl. version history), TOC, group members, and
  team statistics.
- Token auth via `YUQUE_TOKEN` / `--token`; custom hosts via `YUQUE_HOST` / `--host`.
- Human-readable output with `--json` raw mode, stable exit codes, automatic retry with
  backoff on rate limits, `--all` pagination, and confirmation gates on destructive
  commands.
