import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { confirmDestructive } from '../confirm.js';
import { printJson, printOk, printRecord, printTable } from '../output.js';
import { parseRepoRef } from '../client/repo-ref.js';
import { fetchAllPages } from '../client/paginate.js';
import {
  createRepo,
  deleteRepo,
  getRepo,
  listRepos,
  updateRepo,
  type CreateRepoBody,
  type RepoOwner,
  type UpdateRepoBody,
} from '../client/api/repo.js';
import type { V2Book } from '../client/types.js';

function parseNonNegativeInt(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new UsageError(`Expected a non-negative integer, got "${value}"`);
  }
  return Number(value);
}

/** The spec caps `limit` at 100 for repo listing. */
function parseLimit(value: string): number {
  const limit = parseNonNegativeInt(value);
  if (limit > 100) throw new UsageError(`--limit is capped at 100 by the Yuque API, got ${limit}`);
  return limit;
}

/** Spec enum for repo visibility. */
function parsePublic(value: string): number {
  if (!['0', '1', '2'].includes(value.trim())) {
    throw new UsageError(
      `--public must be 0 (private), 1 (public), or 2 (org-only), got "${value}"`
    );
  }
  return Number(value);
}

const LIST_TYPES = ['Book', 'Design', 'all'];

/** `all` (like omitting the flag) means no server-side filter; the spec enum is Book|Design. */
function typeFilter(value: string | undefined): string | undefined {
  if (value === undefined || value === 'all') return undefined;
  if (!LIST_TYPES.includes(value)) {
    throw new UsageError(`Invalid --type "${value}" — expected one of: ${LIST_TYPES.join(', ')}`);
  }
  return value;
}

function repoLabel(book: V2Book): string {
  return String(book.namespace ?? book.slug);
}

export function registerRepoCommands(program: Command): void {
  const repo = program.command('repo').description('Manage knowledge bases (知识库)');

  const list = repo
    .command('list')
    .description('List the repos of a user or group')
    .argument('<login>', 'user/group login or id')
    .option('--group', 'treat <login> as a group instead of a user')
    .option('--type <type>', 'filter by repo type: Book, Design, or all')
    .option(
      '--filter-by-ability <ability>',
      'only repos where the token has this ability, e.g. create_doc'
    )
    .option('--offset <n>', 'pagination offset', parseNonNegativeInt)
    .option('--limit <n>', 'page size, max 100', parseLimit)
    .option('--all', 'fetch every page (overrides --offset/--limit)')
    .action(
      async (
        login: string,
        opts: {
          group?: boolean;
          type?: string;
          filterByAbility?: string;
          offset?: number;
          limit?: number;
          all?: boolean;
        }
      ) => {
        const type = typeFilter(opts.type);
        const ctx = getContext(list);
        const owner: RepoOwner = opts.group ? 'group' : 'user';
        const filterByAbility = opts.filterByAbility;
        const books = opts.all
          ? await fetchAllPages((offset, limit) =>
              listRepos(ctx.http, owner, login, { offset, limit, type, filterByAbility })
            )
          : await listRepos(ctx.http, owner, login, {
              offset: opts.offset,
              limit: opts.limit,
              type,
              filterByAbility,
            });
        if (ctx.json) {
          printJson(books);
          return;
        }
        printTable(books, [
          { key: 'namespace', header: 'NAMESPACE', format: repoLabel },
          { key: 'name', header: 'NAME' },
          { key: 'items_count', header: 'ITEMS' },
          { key: 'updated_at', header: 'UPDATED' },
        ]);
      }
    );

  const get = repo
    .command('get')
    .description('Show the details of a repo')
    .argument('<repo>', 'repo id or group/slug namespace')
    .action(async (repoArg: string) => {
      const ref = parseRepoRef(repoArg);
      const ctx = getContext(get);
      const book = await getRepo(ctx.http, ref);
      if (ctx.json) {
        printJson(book);
        return;
      }
      printRecord(book, [
        'id',
        'type',
        'namespace',
        'name',
        'slug',
        'description',
        'public',
        'items_count',
        'created_at',
        'updated_at',
      ]);
    });

  const create = repo
    .command('create')
    .description('Create a repo under a user or group')
    .argument('<login>', 'owner user/group login or id')
    .requiredOption('--name <name>', 'repo name (required)')
    .requiredOption('--slug <slug>', 'repo path (slug) (required)')
    .option('--group', 'create under a group instead of a user')
    .option('--description <description>', 'repo description')
    .option('--public <n>', 'visibility: 0 private, 1 public, 2 org-only', parsePublic)
    .option('--enhanced-privacy', 'restrict access to team admins only (增强私密性)')
    .action(
      async (
        login: string,
        opts: {
          name: string;
          slug: string;
          group?: boolean;
          description?: string;
          public?: number;
          enhancedPrivacy?: boolean;
        }
      ) => {
        const ctx = getContext(create);
        const body: CreateRepoBody = { name: opts.name, slug: opts.slug };
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.public !== undefined) body.public = opts.public;
        if (opts.enhancedPrivacy) body.enhancedPrivacy = true;
        const book = await createRepo(ctx.http, opts.group ? 'group' : 'user', login, body);
        if (ctx.json) {
          printJson(book);
          return;
        }
        printOk(`Created repo ${repoLabel(book)} (id: ${book.id})`);
      }
    );

  const update = repo
    .command('update')
    .description('Update the settings of a repo')
    .argument('<repo>', 'repo id or group/slug namespace')
    .option('--name <name>', 'new name')
    .option('--slug <slug>', 'new path (slug)')
    .option('--description <description>', 'new description')
    .option('--public <n>', 'visibility: 0 private, 1 public, 2 org-only', parsePublic)
    .option('--toc <markdown>', 'replace the table of contents (Markdown list)')
    .action(
      async (
        repoArg: string,
        opts: { name?: string; slug?: string; description?: string; public?: number; toc?: string }
      ) => {
        const ref = parseRepoRef(repoArg);
        const body: UpdateRepoBody = {};
        if (opts.name !== undefined) body.name = opts.name;
        if (opts.slug !== undefined) body.slug = opts.slug;
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.public !== undefined) body.public = opts.public;
        if (opts.toc !== undefined) body.toc = opts.toc;
        if (Object.keys(body).length === 0) {
          throw new UsageError(
            'Nothing to update — pass at least one of --name/--slug/--description/--public/--toc.'
          );
        }
        const ctx = getContext(update);
        const book = await updateRepo(ctx.http, ref, body);
        if (ctx.json) {
          printJson(book);
          return;
        }
        printOk(`Updated repo ${repoLabel(book)}`);
      }
    );

  const del = repo
    .command('delete')
    .description('Delete a repo')
    .argument('<repo>', 'repo id or group/slug namespace')
    .option('--yes', 'skip the confirmation prompt')
    .action(async (repoArg: string, opts: { yes?: boolean }) => {
      const ref = parseRepoRef(repoArg);
      await confirmDestructive(`delete repo ${repoArg}`, Boolean(opts.yes));
      const ctx = getContext(del);
      const book = await deleteRepo(ctx.http, ref);
      if (ctx.json) {
        printJson(book);
        return;
      }
      printOk(`Deleted repo ${repoLabel(book)}`);
    });
}
