import { readFileSync } from 'node:fs';
import { Option, type Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { confirmDestructive } from '../confirm.js';
import { printJson, printOk, printRecord, printTable } from '../output.js';
import { parseRepoRef } from '../client/repo-ref.js';
import { fetchAllPages } from '../client/paginate.js';
import {
  createDoc,
  deleteDoc,
  getDoc,
  getDocById,
  getDocVersion,
  listDocVersions,
  listDocs,
  updateDoc,
  type DocListParams,
  type DocWritePayload,
} from '../client/api/doc.js';
import type { V2DocDetail } from '../client/types.js';

const REPO_ARG_HELP = 'repo id or group/slug namespace';

const DOC_META_FIELDS = [
  'id',
  'slug',
  'title',
  'format',
  'public',
  'status',
  'word_count',
  'read_count',
  'created_at',
  'updated_at',
];

const VERSION_META_FIELDS = ['id', 'doc_id', 'slug', 'title', 'format', 'created_at', 'updated_at'];

function parseIntFlag(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`${flag} expects a non-negative integer, got "${value}"`);
  }
  const parsed = Number(value);
  if (flag === '--limit' && parsed > 100) {
    throw new UsageError(`--limit is capped at 100 by the Yuque API, got ${parsed}`);
  }
  return parsed;
}

interface BodyOpts {
  body?: string;
  bodyFile?: string;
}

/** Resolve the doc body from --body / --body-file; the two flags are mutually exclusive. */
function resolveBody(opts: BodyOpts): string | undefined {
  if (opts.body !== undefined && opts.bodyFile !== undefined) {
    throw new UsageError('--body and --body-file are mutually exclusive');
  }
  if (opts.bodyFile === undefined) return opts.body;
  try {
    return readFileSync(opts.bodyFile, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`cannot read --body-file ${opts.bodyFile}: ${reason}`);
  }
}

interface DocWriteOpts extends BodyOpts {
  title?: string;
  slug?: string;
  format?: string;
  public?: string;
}

function buildWritePayload(opts: DocWriteOpts): DocWritePayload {
  const payload: DocWritePayload = {};
  if (opts.title !== undefined) payload.title = opts.title;
  if (opts.slug !== undefined) payload.slug = opts.slug;
  const body = resolveBody(opts);
  if (body !== undefined) payload.body = body;
  if (opts.format !== undefined) payload.format = opts.format;
  if (opts.public !== undefined) payload.public = Number(opts.public);
  return payload;
}

function formatOption(): Option {
  return new Option('--format <format>', 'content format').choices(['markdown', 'html', 'lake']);
}

function publicOption(): Option {
  return new Option('--public <level>', 'visibility (0 private, 1 public, 2 org-only)').choices([
    '0',
    '1',
    '2',
  ]);
}

/** Stream the doc body to stdout as-is (markdown pipes cleanly), newline-terminated. */
function writeBody(body: unknown): void {
  const text = typeof body === 'string' ? body : '';
  if (text === '') return;
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function registerDocCommands(program: Command): void {
  const doc = program.command('doc').description('Work with documents (文档)');

  const list = doc.command('list');
  list
    .description('List the docs of a repo')
    .argument('<repo>', REPO_ARG_HELP)
    .option('--offset <n>', 'pagination offset')
    .option('--limit <n>', 'page size (max 100)')
    .option('--all', 'fetch all pages (overrides --offset/--limit)')
    .option('--deleted', 'list deleted docs')
    .option('--changed-at-gte <datetime>', 'only docs changed at or after this ISO 8601 time')
    .option(
      '--optional-properties <fields>',
      'extra fields, comma-separated: hits, tags, latest_version_id'
    )
    .action(
      async (
        repo: string,
        opts: {
          offset?: string;
          limit?: string;
          all?: boolean;
          deleted?: boolean;
          changedAtGte?: string;
          optionalProperties?: string;
        }
      ) => {
        const ctx = getContext(list);
        const ref = parseRepoRef(repo);
        // Validate unconditionally so `--all --limit banana` still exits 2;
        // with --all the paginator overrides these values.
        const offset = parseIntFlag(opts.offset, '--offset');
        const limit = parseIntFlag(opts.limit, '--limit');
        const filters: DocListParams = {};
        if (opts.deleted) filters.deleted = true;
        if (opts.changedAtGte !== undefined) filters.changed_at_gte = opts.changedAtGte;
        if (opts.optionalProperties !== undefined) {
          filters.optional_properties = opts.optionalProperties;
        }
        const docs = opts.all
          ? await fetchAllPages((pageOffset, pageLimit) =>
              listDocs(ctx.http, ref, { ...filters, offset: pageOffset, limit: pageLimit })
            )
          : await listDocs(ctx.http, ref, { ...filters, offset, limit });
        if (ctx.json) {
          printJson(docs);
          return;
        }
        printTable(docs, [
          { key: 'slug', header: 'SLUG' },
          { key: 'title', header: 'TITLE' },
          { key: 'word_count', header: 'WORDS' },
          { key: 'updated_at', header: 'UPDATED' },
        ]);
      }
    );

  const get = doc.command('get');
  get
    .description('Show a doc: `doc get <repo> <doc>` or `doc get <doc-id>`')
    .argument('<target...>', '<repo> <doc slug or id>, or a single global numeric doc id')
    .option('--meta', 'print metadata instead of the body')
    .action(async (target: string[], opts: { meta?: boolean }) => {
      const ctx = getContext(get);
      let detail: V2DocDetail;
      if (target.length === 2) {
        detail = await getDoc(ctx.http, parseRepoRef(target[0]), target[1]);
      } else if (target.length === 1) {
        if (!/^\d+$/.test(target[0])) {
          throw new UsageError(
            `"${target[0]}" is not a numeric doc id — pass <repo> <doc> or a global numeric doc id`
          );
        }
        detail = await getDocById(ctx.http, Number(target[0]));
      } else {
        throw new UsageError('doc get takes <repo> <doc> or a single numeric <doc-id>');
      }
      if (ctx.json) {
        printJson(detail);
        return;
      }
      if (opts.meta) {
        printRecord(detail, DOC_META_FIELDS);
        return;
      }
      writeBody(detail.body);
    });

  const create = doc.command('create');
  create
    .description('Create a doc in a repo')
    .argument('<repo>', REPO_ARG_HELP)
    .requiredOption('--title <title>', 'doc title (required)')
    .option('--slug <slug>', 'doc slug (URL path)')
    .option('--body <content>', 'doc body content')
    .option('--body-file <path>', 'read the doc body from a file')
    .addOption(formatOption())
    .addOption(publicOption())
    .action(async (repo: string, opts: DocWriteOpts) => {
      const ctx = getContext(create);
      const payload = buildWritePayload(opts);
      if (payload.body === undefined) {
        throw new UsageError(
          'a doc body is required — pass --body <content> or --body-file <path>'
        );
      }
      const created = await createDoc(ctx.http, parseRepoRef(repo), payload);
      if (ctx.json) {
        printJson(created);
        return;
      }
      printOk(`Created doc ${repo}/${created.slug} (id ${created.id}): ${created.title}`);
    });

  const update = doc.command('update');
  update
    .description('Update a doc (only the given fields are changed)')
    .argument('<repo>', REPO_ARG_HELP)
    .argument('<doc>', 'doc slug or id')
    .option('--title <title>', 'doc title')
    .option('--slug <slug>', 'doc slug (URL path)')
    .option('--body <content>', 'doc body content')
    .option('--body-file <path>', 'read the doc body from a file')
    .addOption(formatOption())
    .addOption(publicOption())
    .action(async (repo: string, docRef: string, opts: DocWriteOpts) => {
      const ctx = getContext(update);
      const payload = buildWritePayload(opts);
      if (Object.keys(payload).length === 0) {
        throw new UsageError(
          'nothing to update — pass at least one of --title/--slug/--body/--body-file/--format/--public'
        );
      }
      const updated = await updateDoc(ctx.http, parseRepoRef(repo), docRef, payload);
      if (ctx.json) {
        printJson(updated);
        return;
      }
      printOk(`Updated doc ${repo}/${docRef}`);
    });

  const del = doc.command('delete');
  del
    .description('Delete a doc')
    .argument('<repo>', REPO_ARG_HELP)
    .argument('<doc>', 'doc slug or id')
    .option('--yes', 'skip the confirmation prompt')
    .action(async (repo: string, docRef: string, opts: { yes?: boolean }) => {
      await confirmDestructive(`delete doc ${repo}/${docRef}`, Boolean(opts.yes));
      const ctx = getContext(del);
      const deleted = await deleteDoc(ctx.http, parseRepoRef(repo), docRef);
      if (ctx.json) {
        printJson(deleted);
        return;
      }
      printOk(`Deleted doc ${repo}/${docRef}`);
    });

  const versions = doc.command('versions');
  versions
    .description('List the published versions of a doc (most recent 100)')
    .argument('<doc-id>', 'numeric doc id')
    .action(async (docId: string) => {
      if (!/^\d+$/.test(docId)) {
        throw new UsageError(`<doc-id> expects a numeric doc id, got "${docId}"`);
      }
      const ctx = getContext(versions);
      const items = await listDocVersions(ctx.http, Number(docId));
      if (ctx.json) {
        printJson(items);
        return;
      }
      printTable(items, [
        { key: 'id', header: 'ID' },
        { key: 'title', header: 'TITLE' },
        { key: 'updated_at', header: 'UPDATED' },
        { key: 'user', header: 'USER', format: (row) => row.user?.name ?? '' },
      ]);
    });

  const version = doc.command('version');
  version
    .description('Show one published version of a doc')
    .argument('<version-id>', 'numeric version id')
    .option('--meta', 'print metadata instead of the body')
    .action(async (versionId: string, opts: { meta?: boolean }) => {
      if (!/^\d+$/.test(versionId)) {
        throw new UsageError(`<version-id> expects a numeric version id, got "${versionId}"`);
      }
      const ctx = getContext(version);
      const detail = await getDocVersion(ctx.http, Number(versionId));
      if (ctx.json) {
        printJson(detail);
        return;
      }
      if (opts.meta) {
        printRecord(detail, VERSION_META_FIELDS);
        return;
      }
      writeBody(detail.body_md ?? detail.body);
    });
}
