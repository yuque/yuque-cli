# Yuque CLI

An interactive command-line client for [Yuque](https://www.yuque.com), built with Node.js.

It provides a full-screen REPL with:
- persistent app-style banner
- keyboard-first navigation
- table/list based selection for repos and docs
- `open` and `show` document flows
- markdown pager and in-terminal editor for document body input

中文文档请见: [`README.zh-CN.md`](README.zh-CN.md)

## Features

- Token auth via `YUQUE_TOKEN` or interactive login
- Repo/doc browsing with rich keyboard interactions
- Clickable repo namespace links (OSC8-capable terminals)
- Tab completion and command suggestions
- Friendly prompts and guidance-focused messaging
- Multi-line body editor for `create doc in [repo]`

## Requirements

- Node.js >= 18

## Installation

Install globally from current source:

```bash
npm run install:global
```

For local development (symlink command):

```bash
npm run link:global
```

Verify:

```bash
yuque --version
```

## Authentication

- Environment variable: `YUQUE_TOKEN`
- Or run `auth login` in REPL

Saved token location:

```text
~/.yuque/settings.json
```

Token creation page:

```text
https://www.yuque.com/settings/tokens
```

## Usage

```bash
yuque
```

Or one-shot commands:

```bash
yuque whoami
yuque list repos
yuque list docs <repo>
yuque open <repo>/<doc>
yuque show <repo>/<doc>
yuque search "keyword" <repo>
```

## REPL Commands

```text
help
clear
exit | quit
auth login
auth logout
whoami
list repos
list docs [repo]
use <repo>
open <repo>/<doc>
show <repo>/<doc>
search <kw> in [repo]
search <kw>
create doc in [repo]
```

## Environment Variables

- `YUQUE_TOKEN`: auth token
- `YUQUE_ENDPOINT`: override API endpoint (default `https://www.yuque.com`)

## Development

```bash
npm test
npm run repl
```

## License

MIT
