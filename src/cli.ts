import { createRequire } from 'node:module';
import { Command, CommanderError } from 'commander';
import { CliError, YuqueError, exitCodeForStatus } from './errors.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerUserCommands } from './commands/user.js';
import { registerSearchCommands } from './commands/search.js';
import { registerRepoCommands } from './commands/repo.js';
import { registerDocCommands } from './commands/doc.js';
import { registerTocCommands } from './commands/toc.js';
import { registerGroupCommands } from './commands/group.js';
import { registerStatsCommands } from './commands/stats.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

export function buildProgram(): Command {
  const program = new Command('yuque');
  program
    .description('Yuque (语雀) from the terminal — browse, edit, and manage your knowledge base')
    .version(VERSION, '-v, --version', 'print the CLI version')
    .option('--token <token>', 'Yuque API token (overrides YUQUE_TOKEN / YUQUE_PERSONAL_TOKEN)')
    .option('--host <host>', 'Yuque host, e.g. https://your-space.yuque.com (overrides YUQUE_HOST)')
    .option('--json', 'print the full API response as JSON')
    .showHelpAfterError('(run with --help for usage)');
  // Must precede register* calls: commander copies the exit callback into each
  // subcommand at .command() creation time, and the exit-code contract (usage
  // errors -> 2) depends on subcommand errors throwing instead of process.exit.
  program.exitOverride();

  registerAuthCommands(program);
  registerUserCommands(program);
  registerSearchCommands(program);
  registerRepoCommands(program);
  registerDocCommands(program);
  registerTocCommands(program);
  registerGroupCommands(program);
  registerStatsCommands(program);
  return program;
}

/** Parse and run; returns the process exit code instead of exiting, for testability. */
export async function runCli(argv: string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help / --version resolve with exitCode 0; everything else is a usage error.
      return error.exitCode === 0 ? 0 : 2;
    }
    if (error instanceof CliError) {
      process.stderr.write(`yuque: ${error.message}\n`);
      return error.exitCode;
    }
    if (error instanceof YuqueError) {
      process.stderr.write(`yuque: ${error.message}\n`);
      return exitCodeForStatus(error.statusCode);
    }
    process.stderr.write(`yuque: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
