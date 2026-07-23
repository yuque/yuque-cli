<div align="center">

<a href="https://www.yuque.com/"><img src="https://avatars.githubusercontent.com/u/34602419?s=200&v=4" width="96" alt="Yuque logo"></a>

<h1>Yuque CLI</h1>

Your [Yuque (语雀)](https://www.yuque.com/) knowledge base in the terminal —<br>search, read, write, and manage docs from the command line.

[![CI][ci-image]][ci-url] [![npm version][npm-image]][npm-url] [![npm downloads][download-image]][download-url] [![License][license-image]][license-url]

[Quick Start](#quick-start) · [Commands](#commands-26) · [Scripting](#output--scripting) · [Troubleshooting](#troubleshooting) · [中文文档](./README.zh-CN.md)

</div>

Once authenticated, your knowledge base is one command away:

```bash
yuque search "canary release" --type doc          # find that doc you half-remember
yuque doc get team/handbook onboarding > onboarding.md
yuque doc create team/notes --title "Weekly sync" --body-file weekly.md
yuque repo list my-team --group --all --json | jq '.[].name'
```

## Quick Start

**1. Get a token** — create one at [Yuque Developer Settings](https://www.yuque.com/settings/tokens). If you use a team token bound to a Yuque space, also note the space host (e.g. `https://your-space.yuque.com`) — you will pass it as `--host` or `YUQUE_HOST`.

**2. Install and sign in:**

```bash
npm install -g @yuque/cli
export YUQUE_TOKEN=YOUR_TOKEN
yuque auth status
```

<details>
<summary><b>Run without installing (npx)</b></summary>

```bash
YUQUE_TOKEN=YOUR_TOKEN npx @yuque/cli auth status
```

</details>

**3. Start exploring** — `yuque repo list your-login`, then `yuque doc list <repo>`.

## Configuration

| Setting              | Env var / CLI flag        | Description                                                                                                                          |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Token **(required)** | `YUQUE_TOKEN` / `--token` | Personal or team Yuque API token (also reads `YUQUE_PERSONAL_TOKEN` as a compatibility fallback, e.g. shared with @yuque/mcp-server) |
| Host (optional)      | `YUQUE_HOST` / `--host`   | Site or space host, e.g. `https://your-space.yuque.com` — required for space-bound team tokens and private deployments               |

Flags win over env vars, so a one-off `--token` override always works. Site roots are normalized (`/api/v2` is appended automatically); when unset, the host defaults to `https://www.yuque.com`.

## Commands (26)

Each command maps to the [Yuque OpenAPI](https://www.yuque.com/yuque/developer/api) — the mapping is locked by a contract test against the vendored spec.

| Category   | Command                              | Description                                                                        |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| **Auth**   | `ping`                               | Verify connectivity to the Yuque API                                               |
|            | `auth status`                        | Show who you are signed in as                                                      |
| **User**   | `user info`                          | Show the authenticated user                                                        |
|            | `user groups <user>`                 | List groups a user belongs to                                                      |
| **Search** | `search <query>`                     | Search docs or repos, with paging                                                  |
| **Repos**  | `repo list <login>`                  | List repos (知识库) of a user or `--group`                                         |
|            | `repo get <repo>`                    | Show a repo by id or `owner/slug`                                                  |
|            | `repo create <login>`                | Create a repo                                                                      |
|            | `repo update <repo>`                 | Update name, slug, description, visibility, or TOC                                 |
|            | `repo delete <repo>`                 | Delete a repo — asks for confirmation                                              |
| **Docs**   | `doc list <repo>`                    | List docs in a repo, `--all` drains paging                                         |
|            | `doc get <repo> <doc>`               | Print a doc's markdown body; also takes a global `<doc-id>`, `--meta` for metadata |
|            | `doc create <repo>`                  | Create a doc from `--body` or `--body-file`                                        |
|            | `doc update <repo> <doc>`            | Update a doc's body or metadata                                                    |
|            | `doc delete <repo> <doc>`            | Delete a doc — asks for confirmation                                               |
|            | `doc versions <doc-id>`              | List a doc's version history                                                       |
|            | `doc version <version-id>`           | Show one version's content                                                         |
| **TOC**    | `toc get <repo>`                     | Print a repo's table of contents as a tree                                         |
|            | `toc update <repo>`                  | Append, prepend, edit, or remove a TOC node                                        |
| **Groups** | `group members <login>`              | List members of a group                                                            |
|            | `group member set <login> <user>`    | Add a member or change their role                                                  |
|            | `group member remove <login> <user>` | Remove a member — asks for confirmation                                            |
| **Stats**  | `stats group <login>`                | Group-level statistics                                                             |
|            | `stats members <login>`              | Per-member statistics                                                              |
|            | `stats books <login>`                | Per-repo statistics                                                                |
|            | `stats docs <login>`                 | Per-doc statistics                                                                 |

Repos accept either a numeric id or an `owner/slug` namespace everywhere. Run `yuque <command> --help` for all flags.

## Output & scripting

Human-readable tables and records by default; add `--json` to any command for the full API payload:

```bash
yuque doc list team/handbook --all --json | jq -r '.[].slug'
```

Exit codes are stable, so scripts can branch on them:

| Code | Meaning              |
| ---- | -------------------- |
| `0`  | Success              |
| `1`  | API or unknown error |
| `2`  | Usage error          |
| `3`  | Authentication error |
| `4`  | Not found            |
| `5`  | Rate limited         |

Colors are disabled automatically when piping, or force-off with `NO_COLOR=1`. Rate-limited and transient errors are retried with backoff before failing.

## Write access

`create`, `update`, and `delete` commands modify real content, and the CLI can do whatever your token can do. Destructive commands prompt for confirmation on a TTY and require `--yes` in scripts. Keep the token secret, and prefer a space-scoped team token (with `YUQUE_HOST`) when you only work within one space.

## Troubleshooting

| Error                                              | Solution                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `A Yuque API token is required`                    | Set `YUQUE_TOKEN=YOUR_TOKEN` or pass `--token=YOUR_TOKEN`                                      |
| `token invalid or expired` (exit `3`)              | [Regenerate the token](https://www.yuque.com/settings/tokens) or fix `YUQUE_TOKEN` / `--token` |
| `rate limited by the Yuque API` (exit `5`)         | The CLI retries automatically; slow down `--all` loops                                         |
| `the requested resource does not exist` (exit `4`) | Check the repo id / `owner/slug` namespace and the doc slug                                    |
| `npm` command not found                            | Install [Node.js](https://nodejs.org/) v20 or later                                            |

## Development

```bash
git clone https://github.com/yuque/yuque-cli.git
cd yuque-cli
npm install
npm test              # run tests
npm run build         # compile TypeScript
npm run dev -- --help # run from source
```

The command surface is pinned to [spec/yuque-openapi.yaml](./spec/yuque-openapi.yaml) by [tests/spec-coverage.test.ts](./tests/spec-coverage.test.ts); `npm run check` is the merge gate.

## Links

- [Yuque API docs](https://www.yuque.com/yuque/developer/api)
- [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) — the same knowledge base for AI assistants, via MCP
- [Yuque AI Ecosystem](https://yuque.github.io/yuque-ecosystem/)

## License

[MIT](./LICENSE)

[ci-image]: https://img.shields.io/github/actions/workflow/status/yuque/yuque-cli/ci.yml?style=flat-square&label=CI
[ci-url]: https://github.com/yuque/yuque-cli/actions/workflows/ci.yml
[npm-image]: https://img.shields.io/npm/v/%40yuque%2Fcli?style=flat-square
[npm-url]: https://www.npmjs.com/package/@yuque/cli
[download-image]: https://img.shields.io/npm/dm/%40yuque%2Fcli?style=flat-square
[download-url]: https://www.npmjs.com/package/@yuque/cli
[license-image]: https://img.shields.io/github/license/yuque/yuque-cli?style=flat-square
[license-url]: ./LICENSE
