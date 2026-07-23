import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printTable } from '../output.js';
import { search } from '../client/api/search.js';

const SEARCH_TYPES = ['doc', 'repo'];

// Commander-level validation (makeOptionMandatory/choices/argParser errors) exits
// via process.exit on subcommands, bypassing runCli's exit-code contract — so
// required/enum/integer checks live here and throw UsageError (exit 2) instead.
function pageFlag(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new UsageError(`--page expects a positive integer, got "${value}"`);
  }
  if (Number(value) > 100) {
    throw new UsageError(`--page is capped at 100 by the Yuque API, got ${value}`);
  }
  return Number(value);
}

export function registerSearchCommands(program: Command): void {
  const cmd = program
    .command('search')
    .description('Search docs or repos')
    .argument('<query>', 'search keywords')
    .option('--type <type>', 'what to search for: doc or repo (required)')
    .option('--scope <ns>', 'restrict to a group or group/repo namespace')
    .option('--creator <login>', 'only results created by this user')
    .option('--page <n>', 'page number (page size is fixed at 20)', pageFlag);
  cmd.action(async (query: string) => {
    const opts = cmd.opts<{ type?: string; scope?: string; creator?: string; page?: number }>();
    if (!opts.type) throw new UsageError('--type <doc|repo> is required');
    if (!SEARCH_TYPES.includes(opts.type)) {
      throw new UsageError(`invalid --type "${opts.type}" — expected doc or repo`);
    }
    const ctx = getContext(cmd);
    const results = await search(ctx.http, {
      q: query,
      type: opts.type as 'doc' | 'repo',
      scope: opts.scope,
      creator: opts.creator,
      page: opts.page,
    });
    if (ctx.json) {
      printJson(results);
      return;
    }
    printTable(results, [
      { key: 'type', header: 'TYPE' },
      { key: 'title', header: 'TITLE' },
      { key: 'url', header: 'URL' },
    ]);
  });
}
