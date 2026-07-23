# Functional (e2e) tests

This suite runs the **built binary** (`dist/bin.js`) as a subprocess — argv parsing,
config resolution, HTTP wire format, rendering, retry, and exit codes are all exercised
with zero mocks inside the process under test. Build first, then run:

```bash
npm run build
npm run test:e2e
```

`npm run check` (the merge gate) runs it automatically after the build step.

## Two layers

**1. Mock-server suite** — `read-commands` / `write-commands` / `errors` `.e2e.test.ts`.
Always runs, no network, no credentials. Each test boots a local `FixtureServer`
(an in-process mock of the Yuque Open API) and asserts the exact requests the CLI
produced plus its stdout/stderr/exit code. This is the CI reliability gate.

Note the runner (`run-cli.ts`) is async on purpose: the fixture server lives in the
vitest process, so a synchronous spawn would freeze the event loop and deadlock.

**2. Real-API suite** — `cli.e2e.test.ts`. Skipped by default; gated on env vars so
`npm test` / `npm run check` never touch the network:

| Variable                                                      | Meaning                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `YUQUE_E2E=1`                                                 | Enable read paths + error contract against the live API           |
| `YUQUE_E2E_TOKEN`                                             | Personal token used by the read paths                             |
| `YUQUE_E2E_LOGIN`                                             | Optional login override (otherwise resolved via `auth status`)    |
| `YUQUE_E2E_REPO`                                              | Optional repo to read; **required** when write mode is on         |
| `YUQUE_E2E_WRITE=1`                                           | Enable the doc create/update/delete lifecycle in the sandbox repo |
| `YUQUE_E2E_TEAM_TOKEN` / `YUQUE_E2E_HOST` / `YUQUE_E2E_GROUP` | Team/space-token paths (groups, stats)                            |
| `YUQUE_E2E_REPO_LIFECYCLE=1`                                  | Repo create/delete — local only, never wired into CI              |

CI wiring lives in `.github/workflows/ci.yml`: every push/PR (plus a weekly schedule
for API-drift detection) runs `npm run check`, and the real-API read paths turn on
automatically — on the Node 22 leg only — when the `YUQUE_E2E_TOKEN` repository secret
is configured. Fork PRs see no secrets, so those paths skip and CI stays green.

`YUQUE_E2E_TOKEN` must belong to a **dedicated test account**: on the first run
against an empty account the suite bootstraps a `cli-e2e-sandbox` Book with one
fixture doc (the only write the read paths ever perform) and reuses it afterwards.
The write-mode gates (`YUQUE_E2E_WRITE` / `YUQUE_E2E_REPO_LIFECYCLE`) stay off in CI
on purpose and belong to a human-run sandbox session.
