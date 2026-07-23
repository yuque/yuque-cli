# AGENTS.md

Guidance for AI agents (and humans) working in this repo.

## What this is

`@yuque/cli` — a command-line interface for the Yuque (语雀) Open API, sibling of
[yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) and built with the same
engineering conventions.

## Architecture

```
bin.ts → cli.ts (commander program, error → exit code)
           └── commands/<domain>.ts   (flags, confirmation, rendering)
                 └── client/api/<domain>.ts  (typed calls, envelope unwrap)
                       └── client/http.ts    (auth header, retry/backoff, YuqueError)
```

- Command surface is **locked 1:1 against `spec/yuque-openapi.yaml`** by
  `tests/spec-coverage.test.ts`. Adding/renaming a command or refreshing the spec means
  updating that table deliberately.
- Both READMEs are locked by `tests/docs/command-surface-docs.test.ts` (exact command
  count in the heading, every command mentioned). Keep README.md and README.zh-CN.md
  strictly isomorphic.
- Exit codes are a stable contract: 0 ok · 1 API/unknown · 2 usage · 3 auth · 4 not
  found · 5 rate limited (`src/errors.ts`).

## Rules

- All HTTP goes through `client/http.ts`; command handlers never call axios directly.
- Destructive commands (`delete`, `member remove`) go through `confirmDestructive` and
  support `--yes`.
- Human output via `src/output.ts`; `--json` always prints the full raw payload.
- `npm run check` (lint + format + typecheck + tests + build + dist smoke) must exit 0 —
  it is the merge gate and matches CI.
