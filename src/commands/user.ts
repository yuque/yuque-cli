import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printRecord, printTable } from '../output.js';
import { getCurrentUser, listUserGroups } from '../client/api/user.js';
import { fetchAllPages } from '../client/paginate.js';

// UsageError (not commander's InvalidArgumentError) so the failure maps to
// exit code 2 through runCli instead of commander's process.exit on subcommands.
function intFlag(flag: string): (value: string) => number {
  return (value) => {
    if (!/^\d+$/.test(value)) {
      throw new UsageError(`${flag} expects a non-negative integer, got "${value}"`);
    }
    return Number(value);
  };
}

/** Spec enum for the user-groups role filter: 0 (admin) | 1 (member). */
function roleFlag(value: string): number {
  const role = intFlag('--role')(value);
  if (role !== 0 && role !== 1) {
    throw new UsageError(`--role must be 0 (admin) or 1 (member), got ${value}`);
  }
  return role;
}

export function registerUserCommands(program: Command): void {
  const user = program.command('user').description('Inspect users and their groups');

  const info = user.command('info').description('Show the authenticated user');
  info.action(async () => {
    const ctx = getContext(info);
    const me = await getCurrentUser(ctx.http);
    if (ctx.json) {
      printJson(me);
      return;
    }
    printRecord(me, [
      'id',
      'login',
      'name',
      'description',
      'books_count',
      'public_books_count',
      'followers_count',
      'following_count',
      'created_at',
      'updated_at',
    ]);
  });

  const groups = user
    .command('groups')
    .description('List the groups a user belongs to')
    .argument('<user>', 'user login or numeric id')
    .option('--role <n>', 'filter by role (0: admin, 1: member)', roleFlag)
    .option('--offset <n>', 'pagination offset (page size is fixed at 100)', intFlag('--offset'))
    .option('--all', 'fetch all pages (overrides --offset)');
  groups.action(async (userRef: string) => {
    const ctx = getContext(groups);
    const opts = groups.opts<{ role?: number; offset?: number; all?: boolean }>();
    const rows = opts.all
      ? await fetchAllPages((offset) =>
          listUserGroups(ctx.http, userRef, { role: opts.role, offset })
        )
      : await listUserGroups(ctx.http, userRef, { role: opts.role, offset: opts.offset });
    if (ctx.json) {
      printJson(rows);
      return;
    }
    printTable(rows, [
      { key: 'id', header: 'ID' },
      { key: 'login', header: 'LOGIN' },
      { key: 'name', header: 'NAME' },
      { key: 'members_count', header: 'MEMBERS' },
      { key: 'books_count', header: 'BOOKS' },
    ]);
  });
}
