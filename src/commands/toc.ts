import { Command, InvalidArgumentError, Option } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { dim, printJson, printOk } from '../output.js';
import { parseRepoRef } from '../client/repo-ref.js';
import { getToc, updateToc, type TocUpdateBody } from '../client/api/toc.js';
import type { V2TocItem } from '../client/types.js';

interface TocUpdateOptions {
  action: TocUpdateBody['action'];
  actionMode?: 'sibling' | 'child';
  targetUuid?: string;
  nodeUuid?: string;
  docId?: number;
  docIds?: number[];
  type?: 'DOC' | 'LINK' | 'TITLE';
  title?: string;
  url?: string;
  openWindow?: string;
  visible?: string;
}

function parseIntFlag(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Expected a non-negative integer.');
  return Number(value);
}

function parseDocIds(value: string): number[] {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new InvalidArgumentError('Expected comma-separated numeric doc ids, e.g. 123,456.');
  }
  return parts.map(Number);
}

function indentLevel(item: V2TocItem): number {
  if (typeof item.level === 'number') return item.level;
  // depth is 1-based where present; fall back to a flat list.
  if (typeof item.depth === 'number') return Math.max(0, item.depth - 1);
  return 0;
}

function printTocTree(items: V2TocItem[]): void {
  if (items.length === 0) {
    process.stdout.write(dim('(empty toc)\n'));
    return;
  }
  for (const item of items) {
    const ref = item.slug || item.url;
    const suffix = ref ? ` ${dim(`(${ref})`)}` : '';
    process.stdout.write(`${'  '.repeat(indentLevel(item))}${item.title}${suffix}\n`);
  }
}

/**
 * Spec cross-field rules for `toc update` (all flags optional at the parser
 * level, but the API requires combinations): edit/remove need --node-uuid;
 * append/prepend either move an existing node (--node-uuid) or create one,
 * and creating requires --type plus its per-type fields. --target-uuid is
 * always optional (defaults to the root node).
 */
function validateTocUpdate(opts: TocUpdateOptions): void {
  const creating = opts.action === 'appendNode' || opts.action === 'prependNode';
  if (!creating) {
    if (opts.nodeUuid === undefined) {
      throw new UsageError(
        `--node-uuid is required for --action ${opts.action} (find it via \`yuque toc get\`)`
      );
    }
    return;
  }
  if (opts.nodeUuid !== undefined) return; // moving an existing node
  if (opts.type === undefined) {
    throw new UsageError(
      '--type is required when creating a node (append/prepend without --node-uuid)'
    );
  }
  if (opts.type === 'DOC' && opts.docIds === undefined && opts.docId === undefined) {
    throw new UsageError('--doc-ids is required to create DOC nodes');
  }
  if (opts.type === 'LINK' && (opts.title === undefined || opts.url === undefined)) {
    throw new UsageError('--title and --url are required to create LINK nodes');
  }
  if (opts.type === 'TITLE' && opts.title === undefined) {
    throw new UsageError('--title is required to create TITLE nodes');
  }
}

export function registerTocCommands(program: Command): void {
  const toc = program.command('toc').description('Manage the table of contents (目录) of a repo');

  const get = toc
    .command('get')
    .description('Show the toc of a repo as an indented tree')
    .argument('<repo>', 'repo id or group/slug namespace')
    .action(async (repoArg: string) => {
      const ctx = getContext(get);
      const items = await getToc(ctx.http, parseRepoRef(repoArg));
      if (ctx.json) {
        printJson(items);
        return;
      }
      printTocTree(items);
    });

  const update = toc
    .command('update')
    .description('Update the toc of a repo (append/prepend/edit/remove nodes)')
    .argument('<repo>', 'repo id or group/slug namespace')
    .addOption(
      new Option(
        '--action <action>',
        'operation: appendNode (append), prependNode (prepend), editNode, removeNode (required); ' +
          'move a node: appendNode/prependNode + --node-uuid'
      )
        .choices(['appendNode', 'prependNode', 'editNode', 'removeNode'])
        .makeOptionMandatory()
    )
    .addOption(
      new Option('--action-mode <mode>', 'operation mode: sibling or child').choices([
        'sibling',
        'child',
      ])
    )
    .option('--target-uuid <uuid>', 'target node uuid (defaults to the root node)')
    .option('--node-uuid <uuid>', 'node uuid to move/edit/remove (from `yuque toc get`)')
    .option('--doc-id <id>', 'doc id (deprecated, use --doc-ids)', parseIntFlag)
    .option('--doc-ids <ids>', 'comma-separated doc ids, required to create DOC nodes', parseDocIds)
    .addOption(
      new Option('--type <type>', 'node type: DOC (document), LINK, TITLE (group)').choices([
        'DOC',
        'LINK',
        'TITLE',
      ])
    )
    .option('--title <title>', 'node title, required to create TITLE/LINK nodes')
    .option('--url <url>', 'node url, required to create LINK nodes')
    .addOption(
      new Option('--open-window <n>', 'open LINK in a new window (0: same page, 1: new)').choices([
        '0',
        '1',
      ])
    )
    .addOption(
      new Option('--visible <n>', 'node visibility (0: hidden, 1: visible)').choices(['0', '1'])
    )
    .action(async (repoArg: string) => {
      const opts = update.opts<TocUpdateOptions>();
      validateTocUpdate(opts);
      const ctx = getContext(update);
      const body: TocUpdateBody = {
        action: opts.action,
        ...(opts.actionMode !== undefined && { action_mode: opts.actionMode }),
        ...(opts.targetUuid !== undefined && { target_uuid: opts.targetUuid }),
        ...(opts.nodeUuid !== undefined && { node_uuid: opts.nodeUuid }),
        ...(opts.docId !== undefined && { doc_id: opts.docId }),
        ...(opts.docIds !== undefined && { doc_ids: opts.docIds }),
        ...(opts.type !== undefined && { type: opts.type }),
        ...(opts.title !== undefined && { title: opts.title }),
        ...(opts.url !== undefined && { url: opts.url }),
        ...(opts.openWindow !== undefined && { open_window: Number(opts.openWindow) }),
        ...(opts.visible !== undefined && { visible: Number(opts.visible) }),
      };
      const items = await updateToc(ctx.http, parseRepoRef(repoArg), body);
      if (ctx.json) {
        printJson(items);
        return;
      }
      printOk(`Toc updated (${items.length} nodes)`);
    });
}
