import readline from 'node:readline';
import process from 'node:process';
import chalk from 'chalk';
import figures from 'figures';

import { getToken, setToken, clearToken } from './config.js';
import {
  whoami,
  listRepos,
  listDocs,
  openDoc,
  readDoc,
  searchDocs,
  createDoc
} from './commands.js';

const ICON = {
  ok: chalk.greenBright(figures.tick || 'OK'),
  err: chalk.redBright(figures.cross || 'ERR'),
  hint: chalk.yellowBright(figures.warning || 'TIP'),
  info: chalk.blueBright(figures.info || 'INFO'),
  doc: chalk.magentaBright(figures.page || 'DOC'),
  repo: chalk.cyanBright(figures.folder || 'REPO'),
  search: chalk.magentaBright(figures.search || 'SEARCH')
};

const COMMANDS = [
  'help',
  'clear',
  'exit',
  'quit',
  'auth login',
  'auth logout',
  'whoami',
  'list repos',
  'list docs',
  'use',
  'open',
  'show',
  'search',
  'create doc in'
];

const PAGE_SIZE = 10;
const MAX_LOG_LINES = 260;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function cliCmd(text) {
  return chalk.cyan(text);
}

function helpRow(command, desc) {
  return `  ${chalk.cyan(command.padEnd(28))}${chalk.gray(desc)}`;
}

function banner(user) {
  const line = chalk.gray('-'.repeat(64));
  return [
    line,
    `${chalk.bold.cyan('Yuque CLI')} ${chalk.dim('(v0.1.0)')}`,
    user ? `Connected as: ${chalk.bold(user)}` : 'Not authenticated',
    `${chalk.gray('Type')} ${cliCmd('help')} ${chalk.gray('to see commands,')} ${cliCmd('exit')} ${chalk.gray('to leave.')}`,
    line
  ].join('\n');
}

function helpText() {
  return [
    chalk.bold.white('Commands'),
    helpRow('help', 'Show help'),
    helpRow('clear', 'Clear screen output'),
    helpRow('exit | quit', 'Exit REPL'),
    helpRow('auth login', 'Set token'),
    helpRow('auth logout', 'Clear token'),
    helpRow('whoami', 'Show current user'),
    helpRow('list repos', 'List repositories'),
    helpRow('list docs [repo]', 'List docs for repo'),
    helpRow('use <repo>', 'Set current repo'),
    helpRow('open <repo>/<doc>', 'Open doc in browser'),
    helpRow('show <repo>/<doc>', 'Show doc content as markdown'),
    helpRow('show <doc>', 'Show doc in current repo'),
    helpRow('search <kw> in [repo]', 'Search docs'),
    helpRow('search <kw>', 'Search in current repo'),
    helpRow('create doc in [repo]', 'Create doc (title + body editor)')
  ].join('\n');
}

function noTokenGuideText() {
  const url = 'https://www.yuque.com/settings/tokens';
  const displayUrl = hyperlink(chalk.underline.cyan(url), url);
  const line = chalk.gray('─'.repeat(64));
  return [
    line,
    `${ICON.info} ${chalk.bold.white('需要先配置语雀 Token')}`,
    `${chalk.gray('1. 打开：')} ${displayUrl}`,
    `${chalk.gray('2. 创建个人 Token 后复制')}`,
    `${chalk.gray('3. 回到这里粘贴即可（也可设置环境变量 ')}${chalk.cyan('YUQUE_TOKEN')}${chalk.gray('）')}`,
    line
  ].join('\n');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function hyperlink(label, url) {
  if (!process.stdout.isTTY || !url) return label;
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

function stripControl(input) {
  return String(input)
    .replace(/\u001B\]8;;[^\u0007]*\u0007/g, '')
    .replace(/\u001B\]8;;\u0007/g, '')
    .replace(/\u001B\][^\u0007]*\u0007/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function charDisplayWidth(ch) {
  const cp = ch.codePointAt(0);
  if (!cp) return 0;
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

function visibleLength(input) {
  const plain = stripControl(input);
  let len = 0;
  for (const ch of plain) len += charDisplayWidth(ch);
  return len;
}

function truncatePlain(text, width) {
  const s = String(text ?? '');
  if (width <= 0) return '';
  let totalWidth = 0;
  for (const ch of s) totalWidth += charDisplayWidth(ch);
  if (totalWidth <= width) return s;
  if (width <= 3) return '.'.repeat(width);

  const max = width - 3;
  let out = '';
  let used = 0;
  for (const ch of s) {
    const w = charDisplayWidth(ch);
    if (used + w > max) break;
    out += ch;
    used += w;
  }
  return `${out}...`;
}

function fitColumnWidths(columns, terminalWidth) {
  const mins = columns.map((c) => c.min || 6);
  const widths = columns.map((c) => c.pref || c.min || 12);
  const overhead = 3 * columns.length + 1;
  const available = Math.max(mins.reduce((a, b) => a + b, 0), terminalWidth - overhead);

  let total = widths.reduce((a, b) => a + b, 0);
  while (total > available) {
    let idx = -1;
    let best = -1;
    for (let i = 0; i < widths.length; i += 1) {
      if (widths[i] > mins[i] && widths[i] > best) {
        idx = i;
        best = widths[i];
      }
    }
    if (idx === -1) break;
    widths[idx] -= 1;
    total -= 1;
  }

  return widths;
}

function renderCell(cell, width, align = 'left') {
  const normalized =
    typeof cell === 'object' && cell !== null
      ? { plain: cell.plain ?? '', url: cell.url, style: cell.style }
      : { plain: String(cell ?? '') };

  const plain = truncatePlain(normalized.plain, width);
  let display = normalized.url ? hyperlink(plain, normalized.url) : plain;
  if (typeof normalized.style === 'function') {
    display = normalized.style(display);
  }

  const pad = Math.max(0, width - visibleLength(display));
  if (align === 'right') return `${' '.repeat(pad)}${display}`;
  if (align === 'center') {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return `${' '.repeat(left)}${display}${' '.repeat(right)}`;
  }
  return `${display}${' '.repeat(pad)}`;
}

function buildBorderTable(columns, rows, terminalWidth = process.stdout.columns || 120) {
  const widths = fitColumnWidths(columns, terminalWidth);

  const top = chalk.gray(`┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`);
  const mid = chalk.gray(`├${widths.map((w) => '─'.repeat(w + 2)).join('┼')}┤`);
  const bottom = chalk.gray(`└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`);

  const headerCells = columns.map((col, i) =>
    renderCell({ plain: col.title, style: chalk.bold.cyan }, widths[i], col.align || 'left')
  );
  const headerLine = `│ ${headerCells.join(' │ ')} │`;

  const bodyLines = rows.map((row) => {
    const cells = columns.map((col, i) => renderCell(row[col.key], widths[i], col.align || 'left'));
    return `│ ${cells.join(' │ ')} │`;
  });

  return [top, headerLine, mid, ...bodyLines, bottom];
}

function parseNavKey(str, key) {
  const shiftTab = key?.sequence === '\u001b[Z' || (key?.name === 'tab' && key.shift);
  const char = String(str || '').toLowerCase();
  if (shiftTab || key?.name === 'left') return 'prev';
  if (key?.name === 'tab' || key?.name === 'right') return 'next';
  if (char === 'q' || key?.name === 'escape' || key?.name === 'return' || key?.name === 'enter') return 'quit';
  return null;
}

function parseSearchInput(input, currentRepo) {
  const match = input.match(/^search\s+(.+?)\s+in\s+(.+)$/);
  if (match) {
    return {
      q: match[1].replace(/^"|"$/g, '').trim(),
      repo: match[2].trim()
    };
  }
  return {
    q: input.replace(/^search\s+/, '').replace(/^"|"$/g, '').trim(),
    repo: currentRepo
  };
}

function parseListDocsInput(input, currentRepo) {
  const m = input.match(/^list\s+docs(?:\s+in)?(?:\s+(.+))?$/);
  if (!m) return null;
  const repo = m[1] ? m[1].trim() : '';
  return repo || currentRepo || '';
}

function parseRepoDocInput(input, fallbackRepo) {
  const target = String(input || '').trim();
  if (!target) return null;

  const parts = target.split('/').filter(Boolean);
  if (parts.length >= 3) {
    return {
      repo: `${parts[0]}/${parts[1]}`,
      slug: parts.slice(2).join('/')
    };
  }
  if (!fallbackRepo) return null;
  return { repo: fallbackRepo, slug: target };
}

function wrapByWidth(line, width) {
  const text = String(line ?? '');
  if (width <= 0) return [''];
  if (!text) return [''];

  const out = [];
  let buf = '';
  let used = 0;

  for (const ch of text) {
    const w = charDisplayWidth(ch);
    if (used + w > width) {
      out.push(buf || '');
      buf = ch;
      used = w;
      continue;
    }
    buf += ch;
    used += w;
  }
  out.push(buf || '');
  return out;
}

function getTextPageSize() {
  const rows = process.stdout.rows || 40;
  const target = Math.max(15, Math.min(20, Math.floor(rows * 0.6)));
  const available = Math.max(6, rows - 8);
  return Math.min(target, available);
}

function toMarkdownLines(repo, slug, doc) {
  const title = doc?.title || slug;
  const url = doc?.url || `https://www.yuque.com/${repo}/${slug}`;
  const updated = formatDate(doc?.updated_at || doc?.last_updated_at);
  const body = doc?.body || doc?.body_draft || '';
  const fallbackBody = body || chalk.gray('_No markdown content returned by API._');
  const urlDisplay = hyperlink(url, url);

  return [
    `${chalk.bold.white('#')} ${chalk.bold.white(title)}`,
    '',
    chalk.gray('---'),
    `${chalk.cyan('repo')}: ${chalk.yellow(repo)}`,
    `${chalk.cyan('slug')}: ${chalk.yellow(doc?.slug || slug)}`,
    `${chalk.cyan('updated')}: ${chalk.magenta(updated)}`,
    `${chalk.cyan('url')}: ${chalk.blue(urlDisplay)}`,
    chalk.gray('---'),
    '',
    ...String(fallbackBody).split('\n')
  ];
}

function makeAutoSlug(title) {
  const raw = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  if (raw) return raw;
  return `doc-${Date.now().toString(36)}`;
}

function getSuggestions(input, state) {
  const trimmed = input.trim();
  if (!trimmed) return COMMANDS;

  if (trimmed.startsWith('use ')) {
    const q = trimmed.slice(4);
    return state.repos.filter((r) => r.startsWith(q)).map((r) => `use ${r}`);
  }

  if (trimmed === 'list docs in') {
    return state.repos.map((r) => `list docs in ${r}`);
  }

  if (trimmed.startsWith('list docs in ')) {
    const q = trimmed.slice('list docs in '.length);
    return state.repos.filter((r) => r.startsWith(q)).map((r) => `list docs in ${r}`);
  }

  if (trimmed.startsWith('list docs ')) {
    const q = trimmed.slice('list docs '.length);
    return state.repos.filter((r) => r.startsWith(q)).map((r) => `list docs ${r}`);
  }

  if (trimmed.startsWith('open ')) {
    const rest = trimmed.slice(5);
    if (rest.includes('/')) {
      const [repoPrefix, slugPrefix = ''] = rest.split('/', 2);
      const repo = state.repos.find((r) => r === repoPrefix) || repoPrefix;
      const docs = state.docsByRepo.get(repo) || [];
      return docs
        .filter((d) => d.startsWith(slugPrefix))
        .map((d) => `open ${repo}/${d}`);
    }
    return state.repos.filter((r) => r.startsWith(rest)).map((r) => `open ${r}/`);
  }

  if (trimmed.startsWith('show ')) {
    const rest = trimmed.slice(5);
    if (rest.includes('/')) {
      const [repoPrefix, slugPrefix = ''] = rest.split('/', 2);
      const repo = state.repos.find((r) => r === repoPrefix) || repoPrefix;
      const docs = state.docsByRepo.get(repo) || [];
      return docs
        .filter((d) => d.startsWith(slugPrefix))
        .map((d) => `show ${repo}/${d}`);
    }
    return state.repos.filter((r) => r.startsWith(rest)).map((r) => `show ${r}/`);
  }

  if (trimmed.startsWith('search ') && trimmed.includes(' in ')) {
    const [qPart, repoPart] = trimmed.split(/\s+in\s+/);
    const repoPrefix = repoPart || '';
    return state.repos
      .filter((r) => r.startsWith(repoPrefix))
      .map((r) => `${qPart} in ${r}`);
  }

  return COMMANDS.filter((c) => c.startsWith(trimmed));
}

function isPrintable(str, key) {
  if (!str) return false;
  if (key?.ctrl || key?.meta) return false;
  return str >= ' ' && str <= '~';
}

function toChars(input) {
  return Array.from(String(input ?? ''));
}

function inputLength(input) {
  return toChars(input).length;
}

function inputSlice(input, start = 0, end) {
  return toChars(input).slice(start, end).join('');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function prevWordStart(input, cursor) {
  const chars = toChars(input);
  let i = clamp(cursor, 0, chars.length);
  while (i > 0 && /\s/.test(chars[i - 1])) i -= 1;
  while (i > 0 && !/\s/.test(chars[i - 1])) i -= 1;
  return i;
}

function nextWordEnd(input, cursor) {
  const chars = toChars(input);
  let i = clamp(cursor, 0, chars.length);
  while (i < chars.length && /\s/.test(chars[i])) i += 1;
  while (i < chars.length && !/\s/.test(chars[i])) i += 1;
  return i;
}

export async function startRepl() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Interactive mode requires a TTY terminal.');
    return;
  }

  const state = {
    repo: null,
    repos: [],
    docsByRepo: new Map(),
    user: null,
    logs: [],
    input: '',
    cursor: 0,
    history: [],
    historyIndex: 0,
    dropdown: null,
    modal: null,
    busy: false,
    exiting: false,
    loadingRepos: false,
    spinFrame: 0,
    commandSeq: 0,
    activeCommandId: 0,
    lastWrittenCommandId: 0
  };

  let doneResolve;
  const done = new Promise((resolve) => {
    doneResolve = resolve;
  });

  const pushLines = (lines) => {
    for (const line of lines) {
      state.logs.push(line);
      if (state.logs.length > MAX_LOG_LINES) state.logs.shift();
    }
  };

  const pushResultLines = (lines) => {
    const cid = state.activeCommandId;
    if (cid && state.lastWrittenCommandId !== cid) {
      if (state.logs.length && state.logs[state.logs.length - 1] !== '') {
        pushLines(['']);
      }
      state.lastWrittenCommandId = cid;
    }
    pushLines(lines);
  };

  const pushBlock = (text) => {
    if (!text) return;
    pushResultLines(String(text).split('\n'));
  };

  const setInput = (nextInput, nextCursor = inputLength(nextInput)) => {
    state.input = String(nextInput ?? '');
    state.cursor = clamp(nextCursor, 0, inputLength(state.input));
  };

  const moveCursor = (delta) => {
    state.cursor = clamp(state.cursor + delta, 0, inputLength(state.input));
  };

  const replaceInputRange = (start, end, text = '') => {
    const chars = toChars(state.input);
    const s = clamp(start, 0, chars.length);
    const e = clamp(end, s, chars.length);
    const insert = toChars(text);
    const next = [...chars.slice(0, s), ...insert, ...chars.slice(e)].join('');
    setInput(next, s + insert.length);
  };

  const clearScreen = () => {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  };

  let spinnerTimer = null;
  const shouldSpin = () => (state.busy || state.loadingRepos) && !state.modal;

  const ensureSpinner = () => {
    if (spinnerTimer || !shouldSpin()) return;
    spinnerTimer = setInterval(() => {
      if (!shouldSpin()) {
        clearInterval(spinnerTimer);
        spinnerTimer = null;
        state.spinFrame = 0;
        return;
      }
      state.spinFrame = (state.spinFrame + 1) % SPINNER_FRAMES.length;
      render();
    }, 90);
  };

  const stopSpinner = () => {
    if (!spinnerTimer) return;
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    state.spinFrame = 0;
  };

  const renderDropdown = () => {
    if (!state.dropdown || !state.dropdown.items.length) return [];
    const total = state.dropdown.items.length;
    const maxVisible = Math.max(6, Math.min(12, (process.stdout.rows || 40) - 18));
    const showAll = !state.dropdown.baseInput?.trim() && total <= 20;
    const max = showAll ? total : Math.min(maxVisible, total);
    let start = 0;
    if (total > max) {
      start = clamp(state.dropdown.index - Math.floor(max / 2), 0, total - max);
    }

    const rows = state.dropdown.items.slice(start, start + max).map((item, idx) => {
      const absolute = start + idx;
      const selected = absolute === state.dropdown.index;
      return {
        cmd: {
          plain: `${selected ? '> ' : '  '}${item}`,
          style: selected ? chalk.cyanBright : chalk.gray
        }
      };
    });

    const table = buildBorderTable(
      [
        { key: 'cmd', title: 'Suggestions', min: 22, pref: 62 }
      ],
      rows
    );

    if (total > max) {
      return [...table, chalk.dim(`Suggestions ${start + 1}-${start + max}/${total} · Tab/Shift+Tab 切换`)];
    }
    return table;
  };

  const renderPager = (modal) => {
    if (!modal.rows.length) {
      return [
        `${modal.title} ${chalk.dim('(0 results)')}`,
        `${ICON.hint} 当前没有可展示的数据。`
      ];
    }
    const totalPages = Math.max(1, Math.ceil(modal.rows.length / PAGE_SIZE));
    const start = modal.page * PAGE_SIZE;
    const pageRows = modal.rows.slice(start, start + PAGE_SIZE);
    const table = buildBorderTable(modal.columns, pageRows);
    return [
      `${modal.title} ${chalk.dim(`(page ${modal.page + 1}/${totalPages})`)}`,
      ...table,
      chalk.dim('快捷键：↑/↓ 翻页 · → 下一页 · ← 上一页 · Enter/Esc 关闭')
    ];
  };

  const getFilteredRepos = (modal) => {
    const q = modal.filter.trim().toLowerCase();
    if (!q) return modal.repos;
    return modal.repos.filter((r) => {
      const ns = String(r.namespace || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      return ns.includes(q) || name.includes(q);
    });
  };

  const renderRepoSelector = (modal) => {
    const repos = getFilteredRepos(modal);
    const filterLine = `${chalk.dim('Filter:')} ${modal.filter ? chalk.yellow(modal.filter) : ''}`;
    if (!repos.length) {
      const lines = [
        `${modal.title || `${ICON.repo} Select repo`} ${chalk.dim('(0 results)')}`,
        filterLine,
        `${ICON.hint} 没有匹配的知识库，请继续输入过滤词，或按 Esc 取消。`
      ];
      return {
        lines,
        cursor: { line: 1, col: visibleLength(filterLine) }
      };
    }
    const totalPages = Math.max(1, Math.ceil(repos.length / PAGE_SIZE));
    const maxCursor = Math.max(0, repos.length - 1);
    if (modal.cursor > maxCursor) modal.cursor = maxCursor;
    modal.page = Math.floor(modal.cursor / PAGE_SIZE);

    const start = modal.page * PAGE_SIZE;
    const pageRows = repos.slice(start, start + PAGE_SIZE);

    const rows = pageRows.map((r, idx) => {
      const absolute = start + idx;
      const selected = absolute === modal.cursor;
      const style = selected ? chalk.cyan : undefined;
      return {
        index: { plain: selected ? `> ${idx + 1}` : `  ${idx + 1}`, align: 'right', style },
        namespace: {
          plain: r.namespace,
          url: `https://www.yuque.com/${r.namespace}`,
          style
        },
        name: { plain: r.name || '-', style },
        updated: { plain: formatDate(r.updated_at || r.last_updated_at), style }
      };
    });

    const table = buildBorderTable(
      [
        { key: 'index', title: '#', min: 4, pref: 6, align: 'right' },
        { key: 'namespace', title: 'Namespace', min: 24, pref: 40 },
        { key: 'name', title: 'Name', min: 12, pref: 22 },
        { key: 'updated', title: 'Updated', min: 10, pref: 12 }
      ],
      rows
    );

    const lines = [
      `${modal.title || `${ICON.repo} Select repo`} ${chalk.dim(`(page ${modal.page + 1}/${totalPages}, total ${repos.length})`)}`,
      filterLine,
      ...table,
      chalk.dim(modal.hint || '快捷键：↑/↓ 选择 · → 下一页 · ← 上一页 · Enter 确认 · Esc 取消')
    ];
    return {
      lines,
      cursor: { line: 1, col: visibleLength(filterLine) }
    };
  };

  const getFilteredDocs = (modal) => {
    const q = modal.filter.trim().toLowerCase();
    if (!q) return modal.docs;
    return modal.docs.filter((d) => {
      const slug = String(d.slug || '').toLowerCase();
      const title = String(d.title || '').toLowerCase();
      return slug.includes(q) || title.includes(q);
    });
  };

  const renderDocSelector = (modal) => {
    const docs = getFilteredDocs(modal);
    const filterLine = `${chalk.dim('Filter:')} ${modal.filter ? chalk.yellow(modal.filter) : ''}`;
    if (!docs.length) {
      const lines = [
        `${modal.title || `${ICON.doc} Select doc`} ${chalk.dim('(0 results)')}`,
        filterLine,
        `${ICON.hint} 没有匹配文档，请继续输入过滤词，或按 Esc 取消。`
      ];
      return {
        lines,
        cursor: { line: 1, col: visibleLength(filterLine) }
      };
    }

    const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
    const maxCursor = Math.max(0, docs.length - 1);
    if (modal.cursor > maxCursor) modal.cursor = maxCursor;
    modal.page = Math.floor(modal.cursor / PAGE_SIZE);

    const start = modal.page * PAGE_SIZE;
    const pageRows = docs.slice(start, start + PAGE_SIZE);

    const rows = pageRows.map((d, idx) => {
      const absolute = start + idx;
      const selected = absolute === modal.cursor;
      const style = selected ? chalk.cyan : undefined;
      return {
        index: { plain: selected ? `> ${idx + 1}` : `  ${idx + 1}`, style, align: 'right' },
        slug: { plain: d.slug || '-', style },
        title: { plain: d.title || '-', style },
        updated: { plain: formatDate(d.updated_at || d.last_updated_at), style }
      };
    });

    const table = buildBorderTable(
      [
        { key: 'index', title: '#', min: 4, pref: 6, align: 'right' },
        { key: 'slug', title: 'Slug', min: 16, pref: 28 },
        { key: 'title', title: 'Title', min: 18, pref: 44 },
        { key: 'updated', title: 'Updated', min: 10, pref: 12 }
      ],
      rows
    );

    const lines = [
      `${modal.title || `${ICON.doc} Select doc`} ${chalk.dim(`(page ${modal.page + 1}/${totalPages}, total ${docs.length})`)}`,
      filterLine,
      ...table,
      chalk.dim(modal.hint || '快捷键：↑/↓ 选择 · → 下一页 · ← 上一页 · Enter 下一步 · Esc 取消')
    ];
    return {
      lines,
      cursor: { line: 1, col: visibleLength(filterLine) }
    };
  };

  const renderActionSelector = (modal) => {
    const options = modal.options || [];
    if (!options.length) {
      return [`${modal.title}`, `${ICON.hint} 当前没有可执行操作。`];
    }

    const lines = options.map((item, idx) => {
      const selected = idx === modal.index;
      const pointer = selected ? chalk.cyanBright('›') : chalk.gray('·');
      const name = selected ? chalk.bold.cyan(item.id) : chalk.white(item.id);
      const desc = selected ? chalk.cyan(item.desc || '-') : chalk.gray(item.desc || '-');
      return ` ${pointer} ${name} ${chalk.gray('—')} ${desc}`;
    });

    return [
      modal.title || `${ICON.doc} Choose action`,
      '',
      ...lines,
      '',
      chalk.dim('快捷键：↑/↓ 选择 · Enter 确认 · Esc 取消')
    ];
  };

  const renderEditor = (modal) => {
    const totalLines = modal.lines.length;
    const viewport = Math.max(10, Math.min(20, (process.stdout.rows || 40) - 16));
    if (modal.cursorRow < modal.scroll) modal.scroll = modal.cursorRow;
    if (modal.cursorRow >= modal.scroll + viewport) {
      modal.scroll = modal.cursorRow - viewport + 1;
    }

    const visible = modal.lines.slice(modal.scroll, modal.scroll + viewport);
    const numberWidth = Math.max(3, String(totalLines).length);
    const contentLines = visible.map((line, idx) => {
      const ln = modal.scroll + idx + 1;
      const prefix = `${chalk.gray(String(ln).padStart(numberWidth))} ${chalk.gray('│')} `;
      return `${prefix}${line}`;
    });

    const header = modal.title || `${ICON.doc} Markdown Editor`;
    const hint = chalk.dim('快捷键：Ctrl+S 提交 · Esc 取消 · Enter 换行 · ↑/↓/←/→ 移动');
    const status = chalk.dim(`Lines ${totalLines} · Row ${modal.cursorRow + 1}, Col ${modal.cursorCol + 1}`);

    const cursorLine = 3 + (modal.cursorRow - modal.scroll);
    const cursorPrefix = `${chalk.gray(String(modal.cursorRow + 1).padStart(numberWidth))} ${chalk.gray('│')} `;
    const beforeCursor = inputSlice(modal.lines[modal.cursorRow] || '', 0, modal.cursorCol);
    const cursorCol = visibleLength(cursorPrefix) + visibleLength(beforeCursor);

    return {
      lines: [header, hint, status, ...contentLines, chalk.gray('─'.repeat(Math.min(process.stdout.columns || 120, 120)))],
      cursor: { line: cursorLine, col: cursorCol }
    };
  };

  const renderTextPager = (modal) => {
    const width = Math.max(20, (process.stdout.columns || 120) - 2);
    const wrapped = [];
    for (const line of modal.lines || []) {
      wrapped.push(...wrapByWidth(line, width));
    }
    const pageSize = getTextPageSize();
    const totalPages = Math.max(1, Math.ceil(wrapped.length / pageSize));
    if (modal.page > totalPages - 1) modal.page = totalPages - 1;
    const start = modal.page * pageSize;
    const pageLines = wrapped.slice(start, start + pageSize);

    return [
      `${modal.title} ${chalk.dim(`(page ${modal.page + 1}/${totalPages})`)}`,
      chalk.gray('─'.repeat(Math.min(process.stdout.columns || 120, 120))),
      ...pageLines,
      chalk.gray('─'.repeat(Math.min(process.stdout.columns || 120, 120))),
      chalk.dim('快捷键：↑/↓ 翻页 · → 下一页 · ← 上一页 · Enter/Esc 关闭')
    ];
  };

  const renderPromptModal = (modal) => {
    const val = modal.mask ? '*'.repeat(modal.value.length) : modal.value;
    const line = `${modal.label}${val}`;
    return {
      lines: [line],
      cursor: { line: 0, col: visibleLength(line) }
    };
  };

  const render = () => {
    if (shouldSpin()) {
      ensureSpinner();
    } else {
      stopSpinner();
    }

    clearScreen();

    const lines = [...banner(state.user).split('\n'), '', ...state.logs];
    let focus = null;
    const bodyStart = lines.length;

    if (state.exiting) {
      // Keep final screen clean while process exits.
    } else if (state.modal) {
      let modalOut = { lines: [] };
      if (state.modal.type === 'pager') modalOut = { lines: renderPager(state.modal) };
      if (state.modal.type === 'repo-select') modalOut = renderRepoSelector(state.modal);
      if (state.modal.type === 'doc-select') modalOut = renderDocSelector(state.modal);
      if (state.modal.type === 'action-select') modalOut = { lines: renderActionSelector(state.modal) };
      if (state.modal.type === 'editor') modalOut = renderEditor(state.modal);
      if (state.modal.type === 'text-pager') modalOut = { lines: renderTextPager(state.modal) };
      if (state.modal.type === 'prompt') modalOut = renderPromptModal(state.modal);
      lines.push(...modalOut.lines);

      if (modalOut.cursor) {
        focus = {
          absLine: bodyStart + modalOut.cursor.line,
          col: modalOut.cursor.col
        };
      }
    } else if (state.busy) {
      const frame = SPINNER_FRAMES[state.spinFrame % SPINNER_FRAMES.length];
      lines.push(`${chalk.yellow(frame)} ${chalk.yellow('Processing request...')}`);
    } else if (state.loadingRepos) {
      const frame = SPINNER_FRAMES[state.spinFrame % SPINNER_FRAMES.length];
      lines.push(`${chalk.cyan(frame)} ${chalk.cyan('Loading repo suggestions...')}`);
    } else {
      const repoLabel = state.repo ? chalk.dim(`[${state.repo}] `) : '';
      const promptPrefix = `${chalk.cyan('yuque')}${repoLabel}> `;
      const promptLine = `${promptPrefix}${state.input}`;
      lines.push(promptLine);

      const dropdownLines = renderDropdown();
      lines.push(...dropdownLines);

      const beforeCursor = inputSlice(state.input, 0, state.cursor);
      focus = {
        absLine: lines.length - 1 - dropdownLines.length,
        col: visibleLength(promptPrefix) + visibleLength(beforeCursor)
      };
    }

    process.stdout.write(lines.join('\n'));

    if (focus) {
      const linesBelow = lines.length - 1 - focus.absLine;
      if (linesBelow > 0) readline.moveCursor(process.stdout, 0, -linesBelow);
      readline.cursorTo(process.stdout, focus.col);
    }
  };

  const openPrompt = (label, opts = {}) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'prompt',
        label,
        value: opts.initial || '',
        mask: Boolean(opts.mask),
        resolve
      };
      render();
    });

  const closeModal = (value = null) => {
    const modal = state.modal;
    state.modal = null;
    if (modal && typeof modal.resolve === 'function') {
      modal.resolve(value);
    }
    render();
  };

  const openPager = (title, columns, rows) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'pager',
        title,
        columns,
        rows,
        page: 0,
        resolve
      };
      render();
    });

  const openRepoSelector = (repos, options = {}) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'repo-select',
        repos,
        filter: '',
        cursor: 0,
        page: 0,
        title: options.title || `${ICON.repo} Select repo`,
        hint: options.hint || '快捷键：↑/↓ 选择 · → 下一页 · ← 上一页 · Enter 确认 · Esc 取消',
        resolve
      };
      render();
    });

  const openDocSelector = (repo, docs, options = {}) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'doc-select',
        repo,
        docs,
        filter: '',
        cursor: 0,
        page: 0,
        title: options.title || `${ICON.doc} Document List`,
        hint: options.hint || '快捷键：↑/↓ 选择 · → 下一页 · ← 上一页 · Enter 下一步 · Esc 取消',
        resolve
      };
      render();
    });

  const openActionSelector = (title, options) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'action-select',
        title,
        options,
        index: 0,
        resolve
      };
      render();
    });

  const openTextPager = (title, lines) =>
    new Promise((resolve) => {
      state.modal = {
        type: 'text-pager',
        title,
        lines,
        page: 0,
        resolve
      };
      render();
    });

  const openEditor = (title, initial = '') =>
    new Promise((resolve) => {
      const lines = String(initial || '').split('\n');
      state.modal = {
        type: 'editor',
        title,
        lines: lines.length ? lines : [''],
        cursorRow: lines.length ? lines.length - 1 : 0,
        cursorCol: inputLength(lines[lines.length - 1] || ''),
        scroll: 0,
        resolve
      };
      render();
    });

  const exitApp = () => {
    if (state.exiting) return;
    state.exiting = true;
    stopSpinner();
    pushBlock(chalk.gray('Bye.'));
    render();

    process.stdin.off('keypress', onKeypress);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    doneResolve();
  };

  const finishPagerAndPersist = () => {
    const modal = state.modal;
    if (!modal || modal.type !== 'pager') return;

    const totalPages = Math.max(1, Math.ceil(modal.rows.length / PAGE_SIZE));
    const start = modal.page * PAGE_SIZE;
    const rows = modal.rows.slice(start, start + PAGE_SIZE);

    const lines = [
      `${modal.title} ${chalk.dim(`(page ${modal.page + 1}/${totalPages})`)}`,
      ...buildBorderTable(modal.columns, rows)
    ];

    pushResultLines(lines);
    closeModal(null);
  };

  const finishTextPagerAndPersist = () => {
    const modal = state.modal;
    if (!modal || modal.type !== 'text-pager') return;

    const width = Math.max(20, (process.stdout.columns || 120) - 2);
    const wrapped = [];
    for (const line of modal.lines || []) wrapped.push(...wrapByWidth(line, width));
    const pageSize = getTextPageSize();
    const totalPages = Math.max(1, Math.ceil(wrapped.length / pageSize));
    const page = Math.min(modal.page, totalPages - 1);
    const start = page * pageSize;
    const pageLines = wrapped.slice(start, start + pageSize);

    pushResultLines([
      `${modal.title} ${chalk.dim(`(page ${page + 1}/${totalPages})`)}`,
      chalk.gray('─'.repeat(Math.min(process.stdout.columns || 120, 120))),
      ...pageLines,
      chalk.gray('─'.repeat(Math.min(process.stdout.columns || 120, 120)))
    ]);
    closeModal(null);
  };

  const handleModalKey = (str, key) => {
    const modal = state.modal;
    if (!modal) return;

    if (modal.type === 'prompt') {
      if (key?.name === 'return' || key?.name === 'enter') {
        closeModal(modal.value);
        return;
      }
      if (key?.name === 'escape') {
        closeModal(null);
        return;
      }
      if (key?.name === 'backspace') {
        modal.value = modal.value.slice(0, -1);
        render();
        return;
      }
      if (isPrintable(str, key)) {
        modal.value += str;
        render();
      }
      return;
    }

    if (modal.type === 'editor') {
      const getLine = () => modal.lines[modal.cursorRow] || '';
      const setLine = (value) => {
        modal.lines[modal.cursorRow] = value;
      };
      const replaceRange = (line, start, end, text = '') =>
        `${inputSlice(line, 0, start)}${text}${inputSlice(line, end)}`;

      if (key?.ctrl && key?.name === 's') {
        closeModal(modal.lines.join('\n'));
        return;
      }
      if (key?.name === 'escape') {
        closeModal(null);
        return;
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        const line = getLine();
        const left = inputSlice(line, 0, modal.cursorCol);
        const right = inputSlice(line, modal.cursorCol);
        setLine(left);
        modal.lines.splice(modal.cursorRow + 1, 0, right);
        modal.cursorRow += 1;
        modal.cursorCol = 0;
        render();
        return;
      }
      if (key?.name === 'tab' && !key.shift) {
        const line = getLine();
        setLine(replaceRange(line, modal.cursorCol, modal.cursorCol, '  '));
        modal.cursorCol += 2;
        render();
        return;
      }
      if (key?.name === 'backspace') {
        const line = getLine();
        if (modal.cursorCol > 0) {
          setLine(replaceRange(line, modal.cursorCol - 1, modal.cursorCol, ''));
          modal.cursorCol -= 1;
        } else if (modal.cursorRow > 0) {
          const prev = modal.lines[modal.cursorRow - 1] || '';
          const merged = `${prev}${line}`;
          modal.lines.splice(modal.cursorRow - 1, 2, merged);
          modal.cursorRow -= 1;
          modal.cursorCol = inputLength(prev);
        }
        render();
        return;
      }
      if (key?.name === 'delete') {
        const line = getLine();
        const len = inputLength(line);
        if (modal.cursorCol < len) {
          setLine(replaceRange(line, modal.cursorCol, modal.cursorCol + 1, ''));
        } else if (modal.cursorRow < modal.lines.length - 1) {
          const next = modal.lines[modal.cursorRow + 1] || '';
          modal.lines.splice(modal.cursorRow, 2, `${line}${next}`);
        }
        render();
        return;
      }
      if (key?.name === 'left') {
        if (modal.cursorCol > 0) {
          modal.cursorCol -= 1;
        } else if (modal.cursorRow > 0) {
          modal.cursorRow -= 1;
          modal.cursorCol = inputLength(modal.lines[modal.cursorRow] || '');
        }
        render();
        return;
      }
      if (key?.name === 'right') {
        const len = inputLength(getLine());
        if (modal.cursorCol < len) {
          modal.cursorCol += 1;
        } else if (modal.cursorRow < modal.lines.length - 1) {
          modal.cursorRow += 1;
          modal.cursorCol = 0;
        }
        render();
        return;
      }
      if (key?.name === 'up') {
        if (modal.cursorRow > 0) {
          modal.cursorRow -= 1;
          modal.cursorCol = Math.min(modal.cursorCol, inputLength(getLine()));
        }
        render();
        return;
      }
      if (key?.name === 'down') {
        if (modal.cursorRow < modal.lines.length - 1) {
          modal.cursorRow += 1;
          modal.cursorCol = Math.min(modal.cursorCol, inputLength(getLine()));
        }
        render();
        return;
      }
      if (key?.name === 'home' || (key?.ctrl && key?.name === 'a')) {
        modal.cursorCol = 0;
        render();
        return;
      }
      if (key?.name === 'end' || (key?.ctrl && key?.name === 'e')) {
        modal.cursorCol = inputLength(getLine());
        render();
        return;
      }
      if (key?.ctrl && key?.name === 'u') {
        const line = getLine();
        setLine(replaceRange(line, 0, modal.cursorCol, ''));
        modal.cursorCol = 0;
        render();
        return;
      }
      if (key?.ctrl && key?.name === 'k') {
        const line = getLine();
        setLine(replaceRange(line, modal.cursorCol, inputLength(line), ''));
        render();
        return;
      }
      if (key?.ctrl && key?.name === 'w') {
        const line = getLine();
        const start = prevWordStart(line, modal.cursorCol);
        setLine(replaceRange(line, start, modal.cursorCol, ''));
        modal.cursorCol = start;
        render();
        return;
      }
      if (isPrintable(str, key)) {
        const line = getLine();
        setLine(replaceRange(line, modal.cursorCol, modal.cursorCol, str));
        modal.cursorCol += inputLength(str);
        render();
      }
      return;
    }

    if (modal.type === 'pager') {
      let action = parseNavKey(str, key);
      if (!action && key?.name === 'up') action = 'prev';
      if (!action && key?.name === 'down') action = 'next';
      const totalPages = Math.max(1, Math.ceil(modal.rows.length / PAGE_SIZE));
      if (action === 'next') {
        if (modal.page < totalPages - 1) modal.page += 1;
        render();
        return;
      }
      if (action === 'prev') {
        if (modal.page > 0) modal.page -= 1;
        render();
        return;
      }
      if (action === 'quit') {
        finishPagerAndPersist();
      }
      return;
    }

    if (modal.type === 'text-pager') {
      const width = Math.max(20, (process.stdout.columns || 120) - 2);
      const wrapped = [];
      for (const line of modal.lines || []) wrapped.push(...wrapByWidth(line, width));
      const pageSize = getTextPageSize();
      const totalPages = Math.max(1, Math.ceil(wrapped.length / pageSize));
      let action = parseNavKey(str, key);
      if (!action && key?.name === 'up') action = 'prev';
      if (!action && key?.name === 'down') action = 'next';
      if (action === 'next') {
        if (modal.page < totalPages - 1) modal.page += 1;
        render();
        return;
      }
      if (action === 'prev') {
        if (modal.page > 0) modal.page -= 1;
        render();
        return;
      }
      if (action === 'quit') {
        finishTextPagerAndPersist();
      }
      return;
    }

    if (modal.type === 'action-select') {
      const options = modal.options || [];
      if (!options.length) {
        closeModal(null);
        return;
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        closeModal(options[Math.min(modal.index, options.length - 1)]?.id || null);
        return;
      }
      if (key?.name === 'escape') {
        closeModal(null);
        return;
      }
      if (key?.name === 'up') {
        modal.index = (modal.index - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key?.name === 'down') {
        modal.index = (modal.index + 1) % options.length;
        render();
        return;
      }
      if (isPrintable(str, key)) {
        const char = str.toLowerCase();
        if (char === 'q') {
          closeModal(null);
          return;
        }
        const found = options.findIndex((item) => item.id.startsWith(char));
        if (found >= 0) {
          modal.index = found;
          render();
        }
      }
      return;
    }

    if (modal.type === 'repo-select' || modal.type === 'doc-select') {
      const items = modal.type === 'repo-select' ? getFilteredRepos(modal) : getFilteredDocs(modal);
      if (key?.name === 'return' || key?.name === 'enter') {
        if (!items.length) {
          closeModal(null);
          return;
        }
        const picked = items[Math.min(modal.cursor, items.length - 1)];
        if (modal.type === 'repo-select') {
          closeModal(picked?.namespace || null);
        } else {
          closeModal(picked || null);
        }
        return;
      }

      const action = parseNavKey(str, key);

      if (action === 'next') {
        modal.cursor = Math.min(Math.max(0, items.length - 1), modal.cursor + PAGE_SIZE);
        render();
        return;
      }
      if (action === 'prev') {
        modal.cursor = Math.max(0, modal.cursor - PAGE_SIZE);
        render();
        return;
      }
      if (action === 'quit') {
        closeModal(null);
        return;
      }

      if (key?.name === 'up') {
        modal.cursor = Math.max(0, modal.cursor - 1);
        render();
        return;
      }
      if (key?.name === 'down') {
        modal.cursor = Math.min(Math.max(0, items.length - 1), modal.cursor + 1);
        render();
        return;
      }
      if (key?.name === 'backspace') {
        modal.filter = modal.filter.slice(0, -1);
        modal.cursor = 0;
        render();
        return;
      }
      if (isPrintable(str, key)) {
        const char = str.toLowerCase();
        if (/^[1-9]$/.test(char)) {
          const start = Math.floor(modal.cursor / PAGE_SIZE) * PAGE_SIZE;
          const idx = Number(char) - 1;
          const target = items[start + idx];
          if (target && modal.type === 'repo-select') {
            closeModal(target.namespace);
            return;
          }
          if (target && modal.type === 'doc-select') {
            closeModal(target);
            return;
          }
        }

        modal.filter += str;
        modal.cursor = 0;
        render();
      }
      return;
    }
  };

  const clearDropdown = () => {
    state.dropdown = null;
  };

  const cycleDropdown = (reverse = false) => {
    const baseInput = state.dropdown ? state.dropdown.baseInput : state.input;
    const suggestions = getSuggestions(baseInput, state);
    if (!suggestions.length) {
      clearDropdown();
      return;
    }

    if (
      !state.dropdown ||
      state.dropdown.baseInput !== baseInput ||
      JSON.stringify(state.dropdown.items) !== JSON.stringify(suggestions)
    ) {
      state.dropdown = {
        baseInput,
        items: suggestions,
        index: reverse ? suggestions.length - 1 : 0
      };
      setInput(suggestions[state.dropdown.index]);
      render();
      return;
    }

    const len = state.dropdown.items.length;
    state.dropdown.index = reverse
      ? (state.dropdown.index - 1 + len) % len
      : (state.dropdown.index + 1) % len;

    setInput(state.dropdown.items[state.dropdown.index]);
    render();
  };

  const navigateHistory = (direction) => {
    if (!state.history.length) return;
    clearDropdown();

    if (direction === 'up') {
      state.historyIndex = Math.max(0, state.historyIndex - 1);
    } else {
      state.historyIndex = Math.min(state.history.length, state.historyIndex + 1);
    }

    if (state.historyIndex >= state.history.length) {
      setInput('');
    } else {
      setInput(state.history[state.historyIndex]);
    }

    render();
  };

  const ensureRepoCache = async () => {
    if (state.repos.length || state.loadingRepos) return;
    state.loadingRepos = true;
    render();
    try {
      const repos = await listRepos();
      state.repos = repos.map((r) => r.namespace);
    } catch (err) {
      handleError(err);
    } finally {
      state.loadingRepos = false;
      render();
    }
  };

  const toSearchRows = (results) =>
    results.map((d) => ({
      title: { plain: d.title || d.slug || '-' },
      slug: { plain: d.slug || '-' }
    }));

  const handleError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    if (err?.code === 'NO_TOKEN') {
      pushBlock(
        `${ICON.hint} 还没有配置 Token。可以执行 ${cliCmd('auth login')}，或设置环境变量 ${chalk.cyan('YUQUE_TOKEN')}。`
      );
      return;
    }
    if (msg.includes('scope invalid')) {
      pushBlock(
        `${ICON.hint} 这个知识库范围无效。请先执行 ${cliCmd('list repos')} 查看可用仓库，再用 ${cliCmd('search <关键词> in <repo>')}。`
      );
      return;
    }
    if (msg.includes('not found')) {
      pushBlock(
        `${ICON.hint} 没有找到对应资源。可以先 ${cliCmd('list repos')} 或 ${cliCmd('list docs <repo>')} 确认路径。`
      );
      return;
    }
    pushBlock(`${ICON.hint} ${err?.message || '操作暂时未成功，请稍后重试。'}`);
  };

  const pushCommandHint = (input) => {
    if (input === 'list') {
      pushBlock(`${ICON.hint} 你可以使用：${cliCmd('list repos')} 或 ${cliCmd('list docs <repo>')}。`);
      return;
    }
    if (input.startsWith('search')) {
      pushBlock(
        `${ICON.hint} 搜索示例：${cliCmd('search sdk in barretlee/sec')}，或先 ${cliCmd('use <repo>')} 后执行 ${cliCmd('search sdk')}。`
      );
      return;
    }
    if (input.startsWith('open')) {
      pushBlock(
        `${ICON.hint} 打开文档示例：${cliCmd('open barretlee/sec/slug')}，也可先 ${cliCmd('use <repo>')} 后 ${cliCmd('open slug')}。`
      );
      return;
    }
    if (input.startsWith('show')) {
      pushBlock(
        `${ICON.hint} 查看文档示例：${cliCmd('show barretlee/sec/slug')}，也可先 ${cliCmd('use <repo>')} 后 ${cliCmd('show slug')}。`
      );
      return;
    }
    pushBlock(`${ICON.hint} 没识别这条命令。输入 ${cliCmd('help')} 查看可用命令。`);
  };

  const executeCommand = async (line) => {
    const input = line.trim();
    if (!input) return;

    state.commandSeq += 1;
    state.activeCommandId = state.commandSeq;
    state.busy = true;
    render();

    try {
      if (input === 'help' || input === '?') {
        pushBlock(helpText());
        return;
      }

      if (input === 'clear') {
        state.logs = [];
        return;
      }

      if (input === 'exit' || input === 'quit') {
        exitApp();
        return;
      }

      if (input === 'auth login') {
        const value = await openPrompt(`${ICON.info} Enter Yuque token: `, { mask: true });
        if (value && value.trim()) {
          await setToken(value.trim());
          pushBlock(`${ICON.ok} ${chalk.green('Token saved.')}`);
        }
        return;
      }

      if (input === 'auth logout') {
        await clearToken();
        pushBlock(`${ICON.ok} ${chalk.green('Token cleared.')}`);
        return;
      }

      if (input === 'whoami') {
        const u = await whoami();
        state.user = u?.name || u?.login || null;
        pushBlock(`${ICON.info} ${chalk.cyan(u?.name || u?.login)} ${chalk.gray(`(${u?.id})`)}`);
        return;
      }

      if (input === 'list repos') {
        const repos = await listRepos();
        state.repos = repos.map((r) => r.namespace);
        pushBlock(`${ICON.repo} ${chalk.bold(repos.length)} repos`);
        if (!repos.length) {
          pushBlock(`${ICON.hint} 当前账号还没有可见知识库。`);
          return;
        }

        const picked = await openRepoSelector(repos, {
          title: `${ICON.repo} Repository List`,
          hint: '快捷键：↑/↓ 选择 · → 下一页 · ← 上一页 · Enter 使用该知识库 · Esc 取消'
        });
        if (picked) {
          state.repo = picked;
          pushBlock(`${ICON.ok} 已切换当前知识库：${chalk.cyan(picked)}（等价于 ${cliCmd(`use ${picked}`)}）`);
        }
        return;
      }

      if (input.startsWith('use ')) {
        const repo = input.slice(4).trim();
        if (!repo) {
          pushBlock(`${ICON.hint} 请在 ${cliCmd('use')} 后面加知识库，例如：${cliCmd('use barretlee/sec')}。`);
          return;
        }
        state.repo = repo;
        pushBlock(`${ICON.ok} Current repo: ${chalk.cyan(repo)}`);
        return;
      }

      if (input.startsWith('list docs')) {
        let repo = parseListDocsInput(input, state.repo);
        if (repo === null) {
          pushBlock(
            `${ICON.hint} 查看文档请使用：${cliCmd('list docs')}、${cliCmd('list docs in')} 或 ${cliCmd('list docs <repo>')}。`
          );
          return;
        }
        if (!repo) {
          const repos = await listRepos();
          state.repos = repos.map((r) => r.namespace);
          repo = await openRepoSelector(repos, {
            title: `${ICON.repo} Select repo for docs`
          });
          if (!repo) return;
        }
        if (!repo) {
          return;
        }

        const docs = await listDocs(repo);
        state.docsByRepo.set(repo, docs.map((d) => d.slug));
        state.repo = repo;
        pushBlock(`${ICON.doc} ${chalk.bold(docs.length)} docs in ${chalk.cyan(repo)}`);
        if (!docs.length) {
          pushBlock(`${ICON.hint} 这个知识库里暂时没有文档。`);
          return;
        }

        const pickedDoc = await openDocSelector(repo, docs, {
          title: `${ICON.doc} Document List`,
          hint: '快捷键：↑/↓ 选择文档 · → 下一页 · ← 上一页 · Enter 下一步 · Esc 取消'
        });
        if (!pickedDoc) {
          return;
        }

        const action = await openActionSelector(
          `${ICON.doc} ${pickedDoc.slug} — 选择操作`,
          [
            { id: 'open', desc: '在浏览器打开文档链接' },
            { id: 'show', desc: '获取文档详情并以 Markdown 分页查看' }
          ]
        );
        if (!action) {
          return;
        }

        const slug = pickedDoc.slug;
        if (action === 'open') {
          const target = `${repo}/${slug}`;
          const doc = await openDoc(target, repo);
          pushBlock(`${ICON.ok} 已打开：${chalk.cyan(doc?.url || `https://www.yuque.com/${target}`)}`);
          return;
        }

        if (action === 'show') {
          const doc = await readDoc(repo, slug);
          await openTextPager(`${ICON.doc} ${repo}/${slug}`, toMarkdownLines(repo, slug, doc));
          return;
        }

        return;
      }

      if (input.startsWith('open ')) {
        const target = input.slice(5).trim();
        if (!target) {
          pushBlock(`${ICON.hint} 打开文档请使用：${cliCmd('open <repo>/<doc>')}。`);
          return;
        }
        const doc = await openDoc(target, state.repo);
        const parsed = parseRepoDocInput(target, state.repo);
        const fallbackUrl = parsed ? `https://www.yuque.com/${parsed.repo}/${parsed.slug}` : target;
        pushBlock(`${ICON.ok} 已打开：${chalk.cyan(doc?.url || fallbackUrl)}`);
        return;
      }

      if (input.startsWith('show ')) {
        const target = input.slice(5).trim();
        if (!target) {
          pushBlock(
            `${ICON.hint} 查看文档请使用：${cliCmd('show <repo>/<doc>')}，或先 ${cliCmd('use <repo>')} 后 ${cliCmd('show <doc>')}。`
          );
          return;
        }
        const parsed = parseRepoDocInput(target, state.repo);
        if (!parsed?.repo || !parsed?.slug) {
          pushBlock(
            `${ICON.hint} 还没识别到文档路径。可以用 ${cliCmd('show barretlee/media/slug')}，或先 ${cliCmd('use <repo>')}。`
          );
          return;
        }
        const doc = await readDoc(parsed.repo, parsed.slug);
        await openTextPager(`${ICON.doc} ${parsed.repo}/${parsed.slug}`, toMarkdownLines(parsed.repo, parsed.slug, doc));
        return;
      }

      if (input.startsWith('search ')) {
        const parsed = parseSearchInput(input, state.repo);
        if (!parsed.q) {
          pushBlock(`${ICON.hint} 请提供关键词，例如：${cliCmd('search sdk in barretlee/sec')}。`);
          return;
        }
        if (!parsed.repo) {
          pushBlock(
            `${ICON.hint} 还没指定知识库。可以先 ${cliCmd('use <repo>')}，或直接 ${cliCmd('search <关键词> in <repo>')}。`
          );
          return;
        }

        const results = await searchDocs(parsed.repo, parsed.q);
        pushBlock(`${ICON.search} ${chalk.bold(results.length)} results in ${chalk.cyan(parsed.repo)}`);
        if (!results.length) {
          pushBlock(`${ICON.hint} 没有匹配结果。可以换关键词，或确认 repo 是否正确。`);
          return;
        }

        await openPager(
          `${ICON.search} Search Results`,
          [
            { key: 'title', title: 'Title', min: 24, pref: 44 },
            { key: 'slug', title: 'Slug', min: 20, pref: 30 }
          ],
          toSearchRows(results)
        );
        return;
      }

      if (input.startsWith('create doc in')) {
        let repo = input.replace('create doc in', '').trim() || state.repo;
        if (!repo) {
          const repos = await listRepos();
          state.repos = repos.map((r) => r.namespace);
          repo = await openRepoSelector(repos);
        }
        if (!repo) {
          pushBlock(`${ICON.hint} 创建文档前需要先选知识库。可执行 ${cliCmd('create doc in <repo>')}。`);
          return;
        }

        const title = await openPrompt('Title: ');
        if (title === null) {
          pushBlock(`${ICON.hint} 已取消创建文档。`);
          return;
        }
        if (!title.trim()) {
          pushBlock(`${ICON.hint} 标题不能为空，创建已取消。`);
          return;
        }
        const body = await openEditor(`${ICON.doc} Body Editor`, '');
        if (body === null) {
          pushBlock(`${ICON.hint} 正文编辑已取消。`);
          return;
        }

        const doc = await createDoc(repo, { title, body: body || '', slug: makeAutoSlug(title) });
        pushBlock(`${ICON.ok} Created ${chalk.cyan(doc?.url || title)}`);
        return;
      }

      pushCommandHint(input);
    } catch (err) {
      handleError(err);
    } finally {
      state.busy = false;
      state.activeCommandId = 0;
      if (!state.exiting) render();
    }
  };

  const onKeypress = (str, key) => {
    if (state.exiting) return;

    if (key?.ctrl && key?.name === 'c') {
      if (state.modal) {
        closeModal(null);
        return;
      }
      exitApp();
      return;
    }

    if (state.modal) {
      handleModalKey(str, key);
      return;
    }

    if (state.busy) return;

    if (str === '?' && !key?.ctrl && !key?.meta && !state.input.trim()) {
      clearDropdown();
      setInput('');
      render();
      executeCommand('help');
      return;
    }

    if (key?.ctrl && key?.name === 'a') {
      clearDropdown();
      state.cursor = 0;
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'e') {
      clearDropdown();
      state.cursor = inputLength(state.input);
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'u') {
      clearDropdown();
      if (state.cursor > 0) {
        replaceInputRange(0, state.cursor, '');
      }
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'k') {
      clearDropdown();
      if (state.cursor < inputLength(state.input)) {
        replaceInputRange(state.cursor, inputLength(state.input), '');
      }
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'w') {
      clearDropdown();
      const start = prevWordStart(state.input, state.cursor);
      if (start < state.cursor) {
        replaceInputRange(start, state.cursor, '');
      }
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'b') {
      clearDropdown();
      moveCursor(-1);
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'f') {
      clearDropdown();
      moveCursor(1);
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'd') {
      clearDropdown();
      if (!state.input) {
        exitApp();
        return;
      }
      if (state.cursor < inputLength(state.input)) {
        replaceInputRange(state.cursor, state.cursor + 1, '');
      }
      render();
      return;
    }

    if (key?.ctrl && key?.name === 'l') {
      clearDropdown();
      state.logs = [];
      render();
      return;
    }

    if (key?.meta && key?.name === 'b') {
      clearDropdown();
      state.cursor = prevWordStart(state.input, state.cursor);
      render();
      return;
    }

    if (key?.meta && key?.name === 'f') {
      clearDropdown();
      state.cursor = nextWordEnd(state.input, state.cursor);
      render();
      return;
    }

    if (key?.meta && key?.name === 'backspace') {
      clearDropdown();
      const start = prevWordStart(state.input, state.cursor);
      if (start < state.cursor) replaceInputRange(start, state.cursor, '');
      render();
      return;
    }

    if (key?.name === 'tab') {
      const reverse = key.shift || key.sequence === '\u001b[Z';
      if (state.input.trim().startsWith('list docs') && !state.repos.length) {
        void ensureRepoCache().then(() => cycleDropdown(reverse));
        return;
      }
      cycleDropdown(reverse);
      return;
    }

    if (key?.name === 'up') {
      if (state.dropdown) {
        cycleDropdown(true);
      } else if (state.input.trim().startsWith('list docs')) {
        if (!state.repos.length) {
          void ensureRepoCache().then(() => cycleDropdown(true));
        } else {
          cycleDropdown(true);
        }
      } else {
        navigateHistory('up');
      }
      return;
    }

    if (key?.name === 'down') {
      if (state.dropdown) {
        cycleDropdown(false);
      } else if (state.input.trim().startsWith('list docs')) {
        if (!state.repos.length) {
          void ensureRepoCache().then(() => cycleDropdown(false));
        } else {
          cycleDropdown(false);
        }
      } else {
        navigateHistory('down');
      }
      return;
    }

    if (key?.name === 'left') {
      clearDropdown();
      moveCursor(-1);
      render();
      return;
    }

    if (key?.name === 'right') {
      clearDropdown();
      moveCursor(1);
      render();
      return;
    }

    if (key?.name === 'home') {
      clearDropdown();
      state.cursor = 0;
      render();
      return;
    }

    if (key?.name === 'end') {
      clearDropdown();
      state.cursor = inputLength(state.input);
      render();
      return;
    }

    if (key?.name === 'backspace') {
      clearDropdown();
      if (state.cursor > 0) {
        replaceInputRange(state.cursor - 1, state.cursor, '');
      }
      render();
      return;
    }

    if (key?.name === 'delete') {
      clearDropdown();
      if (state.cursor < inputLength(state.input)) {
        replaceInputRange(state.cursor, state.cursor + 1, '');
      }
      render();
      return;
    }

    if (key?.name === 'return' || key?.name === 'enter') {
      const command = state.input.trim();
      clearDropdown();
      setInput('');
      if (!command) {
        render();
        return;
      }
      state.history.push(command);
      state.historyIndex = state.history.length;
      render();
      executeCommand(command);
      return;
    }

    if (isPrintable(str, key)) {
      clearDropdown();
      replaceInputRange(state.cursor, state.cursor, str);
      render();
    }
  };

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', onKeypress);

  render();

  try {
    const token = await getToken();
    if (!token) {
      pushBlock(noTokenGuideText());
      const t = await openPrompt(`${ICON.info} Paste Yuque token: `, { mask: true });
      if (t && t.trim()) {
        await setToken(t.trim());
        pushBlock(`${ICON.ok} ${chalk.green('Token saved.')}`);
      }
    }

    try {
      const u = await whoami();
      state.user = u?.name || u?.login || null;
    } catch {
      state.user = null;
    }

    render();
    await done;
  } finally {
    stopSpinner();
    process.stdin.off('keypress', onKeypress);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }
}

export const __test__ = {
  visibleLength,
  truncatePlain,
  buildBorderTable,
  inputLength,
  inputSlice,
  prevWordStart,
  nextWordEnd,
  helpText
};
