import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printRecord, printTable, type Column } from '../output.js';
import type { YuqueHttp } from '../client/http.js';
import {
  getGroupStatistics,
  listBookStatistics,
  listDocStatistics,
  listMemberStatistics,
  type DocStatsListParams,
} from '../client/api/stats.js';
import type { V2BookStatistics, V2DocStatistics, V2MemberStatistics } from '../client/types.js';

/** Spec maximum for `limit` on the statistics list endpoints. */
const MAX_PAGE_SIZE = 20;

const GROUP_FIELDS = [
  'bizdate',
  'member_count',
  'collaborator_count',
  'doc_count',
  'book_count',
  'write_count',
  'read_count',
  'comment_count',
  'like_count',
  'data_usage',
];

const MEMBER_SORT_FIELDS = ['write_doc_count', 'write_count', 'read_count', 'like_count'];

const BOOK_SORT_FIELDS = [
  'content_updated_at_ms',
  'word_count',
  'post_count',
  'read_count',
  'like_count',
  'watch_count',
  'comment_count',
];

const DOC_SORT_FIELDS = [
  'content_updated_at',
  'word_count',
  'read_count',
  'like_count',
  'comment_count',
  'created_at',
];

const MEMBER_COLUMNS: Column<V2MemberStatistics>[] = [
  { key: 'user', header: 'NAME', format: (row) => row.user?.name ?? String(row.user_id ?? '') },
  { key: 'user_id', header: 'USER ID' },
  { key: 'write_doc_count', header: 'DOCS' },
  { key: 'write_count', header: 'WRITES' },
  { key: 'read_count', header: 'READS' },
  { key: 'like_count', header: 'LIKES' },
];

const BOOK_COLUMNS: Column<V2BookStatistics>[] = [
  { key: 'book_id', header: 'ID' },
  { key: 'name', header: 'NAME' },
  { key: 'slug', header: 'SLUG' },
  { key: 'post_count', header: 'DOCS' },
  { key: 'word_count', header: 'WORDS' },
  { key: 'read_count', header: 'READS' },
  { key: 'like_count', header: 'LIKES' },
];

const DOC_COLUMNS: Column<V2DocStatistics>[] = [
  { key: 'doc_id', header: 'ID' },
  { key: 'title', header: 'TITLE' },
  { key: 'slug', header: 'SLUG' },
  { key: 'book_id', header: 'BOOK ID' },
  { key: 'read_count', header: 'READS' },
  { key: 'like_count', header: 'LIKES' },
  { key: 'comment_count', header: 'COMMENTS' },
];

interface ListOptions {
  name?: string;
  range?: number;
  page?: number;
  limit?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  all?: boolean;
  bookId?: number;
}

function parsePositiveInt(flag: string): (value: string) => number {
  return (value) => {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new UsageError(`${flag} expects a positive integer, got "${value}"`);
    }
    return Number(value);
  };
}

function limitFlag(value: string): number {
  const limit = parsePositiveInt('--limit')(value);
  if (limit > MAX_PAGE_SIZE) {
    throw new UsageError(`--limit is capped at ${MAX_PAGE_SIZE} by the Yuque API, got ${limit}`);
  }
  return limit;
}

// Enum validation lives in argParsers (not Option.choices) so violations throw
// UsageError and exit 2; commander's own choices error path calls process.exit
// on subcommands created before runCli installs exitOverride on the root.
function parseChoice(flag: string, choices: readonly string[]): (value: string) => string {
  return (value) => {
    if (!choices.includes(value)) {
      throw new UsageError(`${flag} must be one of: ${choices.join(', ')} (got "${value}")`);
    }
    return value;
  };
}

function parseRange(value: string): number {
  return Number(parseChoice('--range', ['0', '30', '365'])(value));
}

function withListOptions(cmd: Command, sortFields: string[]): Command {
  return cmd
    .option('--name <name>', 'filter by name')
    .option('--range <days>', 'time range in days: 0 (all time), 30 or 365', parseRange)
    .option('--page <n>', 'page number', parsePositiveInt('--page'))
    .option('--limit <n>', 'page size (max 20)', limitFlag)
    .option(
      '--sort-field <field>',
      `field to sort by: ${sortFields.join(', ')}`,
      parseChoice('--sort-field', sortFields)
    )
    .option(
      '--sort-order <order>',
      'sort direction: desc or asc',
      parseChoice('--sort-order', ['desc', 'asc'])
    )
    .option('--all', 'fetch every page (takes precedence over --page/--limit)');
}

interface StatsPage<T> {
  rows: T[];
  total?: number;
}

// --json prints the same `{ <rows-key>: [...], total }` object in both paging
// modes, preserving the API's pagination metadata (with --all, `total` is the
// server total from the last page and the rows span every page).
async function runList<T extends Record<string, unknown>>(
  cmd: Command,
  rowsKey: 'members' | 'books' | 'docs',
  fetchPage: (http: YuqueHttp, params: DocStatsListParams) => Promise<StatsPage<T>>,
  columns: Column<T>[]
): Promise<void> {
  const ctx = getContext(cmd);
  const opts = cmd.opts<ListOptions>();
  const filters: DocStatsListParams = {
    name: opts.name,
    range: opts.range,
    sortField: opts.sortField,
    sortOrder: opts.sortOrder,
    bookId: opts.bookId,
  };
  let rows: T[];
  let total: number | undefined;
  if (opts.all) {
    rows = [];
    for (let page = 1; ; page++) {
      const result = await fetchPage(ctx.http, { ...filters, page, limit: MAX_PAGE_SIZE });
      rows.push(...result.rows);
      total = result.total ?? total;
      if (result.rows.length < MAX_PAGE_SIZE) break;
    }
  } else {
    const result = await fetchPage(ctx.http, { ...filters, page: opts.page, limit: opts.limit });
    rows = result.rows;
    total = result.total;
  }
  if (ctx.json) {
    printJson({ [rowsKey]: rows, ...(total !== undefined && { total }) });
  } else {
    printTable(rows, columns);
  }
}

export function registerStatsCommands(program: Command): void {
  const stats = program.command('stats').description('Team (group) statistics');

  const groupCmd = stats
    .command('group <login>')
    .description('Aggregate statistics for a group')
    .action(async (login: string) => {
      const ctx = getContext(groupCmd);
      const data = await getGroupStatistics(ctx.http, login);
      if (ctx.json) {
        printJson(data);
      } else {
        printRecord(data, GROUP_FIELDS);
      }
    });

  const membersCmd = withListOptions(
    stats.command('members <login>').description('Per-member statistics for a group'),
    MEMBER_SORT_FIELDS
  ).action(async (login: string) => {
    await runList(
      membersCmd,
      'members',
      async (http, params) => {
        const page = await listMemberStatistics(http, login, params);
        return { rows: page.members, total: page.total };
      },
      MEMBER_COLUMNS
    );
  });

  const booksCmd = withListOptions(
    stats.command('books <login>').description('Per-book statistics for a group'),
    BOOK_SORT_FIELDS
  ).action(async (login: string) => {
    await runList(
      booksCmd,
      'books',
      async (http, params) => {
        const page = await listBookStatistics(http, login, params);
        return { rows: page.books, total: page.total };
      },
      BOOK_COLUMNS
    );
  });

  const docsCmd = withListOptions(
    stats.command('docs <login>').description('Per-doc statistics for a group'),
    DOC_SORT_FIELDS
  )
    .option('--book-id <id>', 'only docs in this book (repo id)', parsePositiveInt('--book-id'))
    .action(async (login: string) => {
      await runList(
        docsCmd,
        'docs',
        async (http, params) => {
          const page = await listDocStatistics(http, login, params);
          return { rows: page.docs, total: page.total };
        },
        DOC_COLUMNS
      );
    });
}
