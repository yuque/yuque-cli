import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildProgram } from '../../src/cli.js';

/**
 * Docs lock: both READMEs must state the exact command count in their section
 * heading, list every registered leaf command, and document nothing beyond the
 * registered surface, mirroring the tool-surface lock in yuque-mcp-server.
 */

function collectLeafCommands(command: Command, prefix: string[] = []): string[] {
  const leaves: string[] = [];
  for (const sub of command.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length === 0) leaves.push(path.join(' '));
    else leaves.push(...collectLeafCommands(sub, path));
  }
  return leaves;
}

const leaves = collectLeafCommands(buildProgram());

function readReadme(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when the leaf appears backticked and followed by a space (arguments) or
 * a closing backtick (bare command). The boundary keeps a prefix command such
 * as `doc version` from being satisfied by `doc versions`.
 */
function mentionsCommand(content: string, leaf: string): boolean {
  return new RegExp('`' + escapeRegExp(leaf) + '( |`)').test(content);
}

/**
 * The backticked command cells (second column) of the commands-section table,
 * with `<arg>` / `[arg]` placeholders stripped down to the leaf path.
 */
function documentedCommands(content: string, heading: RegExp): string[] {
  const match = heading.exec(content);
  if (!match) throw new Error('missing command-count heading');
  const end = content.indexOf('\n## ', match.index + 1);
  const section = content.slice(match.index, end === -1 ? undefined : end);
  return [...section.matchAll(/^\|[^|]*\|\s*`([^`]+)`\s*\|/gm)].map((row) =>
    (row[1] ?? '')
      .split(' ')
      .filter((token) => !token.startsWith('<') && !token.startsWith('['))
      .join(' ')
  );
}

describe('docs-lock helpers', () => {
  it('rejects prefix matches so `doc version` is not satisfied by `doc versions`', () => {
    expect(mentionsCommand('| `doc versions <doc-id>` | history |', 'doc version')).toBe(false);
    expect(mentionsCommand('| `doc version <id>` | one version |', 'doc version')).toBe(true);
    expect(mentionsCommand('run `ping` to verify', 'ping')).toBe(true);
  });

  it('extracts table command cells and strips argument placeholders', () => {
    const section = [
      '## Commands (2)',
      '',
      '| Category | Command | Description |',
      '| --- | --- | --- |',
      '| **Docs** | `doc get <repo> <doc>` | body |',
      '|          | `ping` | connectivity |',
      '',
      '## Next section with `stale mention`',
    ].join('\n');
    expect(documentedCommands(section, /^## Commands \((\d+)\)$/m)).toEqual(['doc get', 'ping']);
  });
});

describe.each([
  { file: 'README.md', heading: new RegExp(`^## Commands \\((\\d+)\\)$`, 'm') },
  { file: 'README.zh-CN.md', heading: new RegExp(`^## 命令列表（(\\d+) 个）$`, 'm') },
])('$file', ({ file, heading }) => {
  const content = readReadme(file);

  it('states the exact command count in the section heading', () => {
    const match = content.match(heading);
    expect(match, `missing command-count heading in ${file}`).not.toBeNull();
    expect(Number(match?.[1])).toBe(leaves.length);
  });

  it('mentions every registered command', () => {
    const missing = leaves.filter((leaf) => !mentionsCommand(content, leaf));
    expect(missing).toEqual([]);
  });

  it('documents exactly the registered commands in the command table', () => {
    // Reverse lock: a phantom/renamed row, a duplicate row, or a command
    // mentioned only in prose all break this set equality.
    expect([...documentedCommands(content, heading)].sort()).toEqual([...leaves].sort());
  });
});
