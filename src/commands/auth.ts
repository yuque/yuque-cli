import type { Command } from 'commander';
import { getContext } from '../context.js';
import { resolveHost } from '../config.js';
import { printJson, printOk } from '../output.js';
import { getCurrentUser, hello } from '../client/api/user.js';

export function registerAuthCommands(program: Command): void {
  const ping = program
    .command('ping')
    .description('Check connectivity and token validity against the Yuque API');
  ping.action(async () => {
    const ctx = getContext(ping);
    const data = await hello(ctx.http);
    if (ctx.json) {
      printJson(data);
      return;
    }
    printOk(data.message ?? 'ok');
  });

  const auth = program.command('auth').description('Authentication status');
  const status = auth.command('status').description('Show which account the token belongs to');
  status.action(async () => {
    const ctx = getContext(status);
    const user = await getCurrentUser(ctx.http);
    if (ctx.json) {
      printJson(user);
      return;
    }
    const host = resolveHost(status.optsWithGlobals<{ host?: string }>().host);
    process.stdout.write(`Logged in to ${host} as ${user.name} (@${user.login})\n`);
  });
}
