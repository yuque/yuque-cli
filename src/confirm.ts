import { createInterface } from 'node:readline/promises';
import { CliError, UsageError } from './errors.js';

/**
 * Gate for destructive commands (delete, member remove). Resolves when the
 * action may proceed; throws otherwise. Non-interactive runs must pass --yes.
 */
export async function confirmDestructive(action: string, yes: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new UsageError(`Refusing to ${action} without confirmation — pass --yes to proceed.`);
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(`About to ${action}. Type "yes" to confirm: `);
    if (answer.trim().toLowerCase() !== 'yes') {
      throw new CliError('Aborted.', 1);
    }
  } finally {
    readline.close();
  }
}
