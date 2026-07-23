import { Command, InvalidArgumentError, Option } from 'commander';
import { getContext } from '../context.js';
import { confirmDestructive } from '../confirm.js';
import { printJson, printOk, printTable } from '../output.js';
import { fetchAllPages } from '../client/paginate.js';
import { listGroupMembers, removeGroupMember, updateGroupMember } from '../client/api/group.js';
import type { V2GroupUser } from '../client/types.js';

const ROLE_LABELS: Record<number, string> = { 0: 'admin', 1: 'member', 2: 'read-only' };

function roleLabel(role: number): string {
  return ROLE_LABELS[role] ?? String(role);
}

function parseOffset(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Expected a non-negative integer.');
  return Number(value);
}

export function registerGroupCommands(program: Command): void {
  // runCli applies exitOverride to the root only after registration, so subcommands
  // must opt in themselves for usage errors to surface as CommanderError (exit 2).
  const group = program
    .command('group')
    .description('Manage groups (团队) and their members')
    .exitOverride();

  const members = group
    .command('members')
    .description('List members of a group')
    .argument('<login>', 'group login or numeric id')
    .addOption(
      new Option('--role <role>', 'filter by role (0: admin, 1: member, 2: read-only)').choices([
        '0',
        '1',
        '2',
      ])
    )
    .option('--offset <n>', 'pagination offset (page size is fixed at 100 by the API)', parseOffset)
    .option('--all', 'fetch all pages')
    .action(async (login: string) => {
      const ctx = getContext(members);
      const opts = members.opts<{ role?: string; offset?: number; all?: boolean }>();
      const role = opts.role === undefined ? undefined : Number(opts.role);
      const rows = opts.all
        ? await fetchAllPages((offset) => listGroupMembers(ctx.http, login, { role, offset }))
        : await listGroupMembers(ctx.http, login, { role, offset: opts.offset });
      if (ctx.json) {
        printJson(rows);
        return;
      }
      printTable<V2GroupUser>(rows, [
        { key: 'login', header: 'LOGIN', format: (m) => m.user?.login ?? '' },
        { key: 'name', header: 'NAME', format: (m) => m.user?.name ?? '' },
        { key: 'role', header: 'ROLE', format: (m) => roleLabel(m.role) },
      ]);
    });

  const member = group.command('member').description('Manage a single group member');

  const set = member
    .command('set')
    .description('Add a member to a group or change their role')
    .argument('<login>', 'group login or numeric id')
    .argument('<user>', 'user login or numeric id')
    .addOption(
      new Option('--role <role>', 'role (0: admin, 1: member, 2: read-only) (required)')
        .choices(['0', '1', '2'])
        .makeOptionMandatory()
    )
    .action(async (login: string, user: string) => {
      const ctx = getContext(set);
      const role = Number(set.opts<{ role: string }>().role);
      const result = await updateGroupMember(ctx.http, login, user, role);
      if (ctx.json) {
        printJson(result);
        return;
      }
      printOk(`Set ${user} in group ${login} to role ${roleLabel(role)}`);
    });

  const remove = member
    .command('remove')
    .description('Remove a member from a group')
    .argument('<login>', 'group login or numeric id')
    .argument('<user>', 'user login or numeric id')
    .option('--yes', 'skip the confirmation prompt')
    .action(async (login: string, user: string) => {
      const opts = remove.opts<{ yes?: boolean }>();
      await confirmDestructive(`remove member ${user} from group ${login}`, Boolean(opts.yes));
      const ctx = getContext(remove);
      const result = await removeGroupMember(ctx.http, login, user);
      if (ctx.json) {
        printJson(result);
        return;
      }
      printOk(`Removed ${user} from group ${login}`);
    });
}
