import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildProgram } from '../src/cli.js';

/**
 * Contract: the CLI command surface is locked 1:1 against spec/yuque-openapi.yaml.
 *
 * Every OpenAPI operation must be handled by at least one command, and every
 * registered leaf command must trace back to at least one operation. Each row
 * additionally pins the operation's method + path, so a mapping cannot be
 * "satisfied" by pointing an operationId at an unrelated command: repurposing
 * an operationId or drifting a path fails the method/path pin below. Changing
 * either side (spec refresh, new command) requires updating this table — that
 * is deliberate, the same pinning culture as yuque-mcp-server's contract tests.
 */

interface OperationMapping {
  method: string;
  path: string;
  commands: string[];
}

/** operationId -> spec method + path, and the CLI command path(s) that call it. */
const OPERATION_TO_COMMANDS: Record<string, OperationMapping> = {
  user_api_v2_hello: { method: 'get', path: '/api/v2/hello', commands: ['ping'] },
  user_api_v2_user_info: {
    method: 'get',
    path: '/api/v2/user',
    commands: ['auth status', 'user info'],
  },
  user_api_v2_user_group_list: {
    method: 'get',
    path: '/api/v2/users/{id}/groups',
    commands: ['user groups'],
  },
  search_api_v2_search: { method: 'get', path: '/api/v2/search', commands: ['search'] },
  group_api_v2_group_member_list: {
    method: 'get',
    path: '/api/v2/groups/{login}/users',
    commands: ['group members'],
  },
  group_api_v2_group_member_update: {
    method: 'put',
    path: '/api/v2/groups/{login}/users/{id}',
    commands: ['group member set'],
  },
  group_api_v2_group_member_destroy: {
    method: 'delete',
    path: '/api/v2/groups/{login}/users/{id}',
    commands: ['group member remove'],
  },
  'doc_api_v2_doc_list-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/docs',
    commands: ['doc list'],
  },
  'doc_api_v2_doc_create-by_id': {
    method: 'post',
    path: '/api/v2/repos/{book_id}/docs',
    commands: ['doc create'],
  },
  'doc_api_v2_doc_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/docs/{id}',
    commands: ['doc get'],
  },
  'doc_api_v2_doc_show-by_book_and_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc get'],
  },
  'doc_api_v2_doc_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc update'],
  },
  'doc_api_v2_doc_destroy-by_id': {
    method: 'delete',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc delete'],
  },
  doc_api_v2_doc_list: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs',
    commands: ['doc list'],
  },
  doc_api_v2_doc_create: {
    method: 'post',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs',
    commands: ['doc create'],
  },
  doc_api_v2_doc_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc get'],
  },
  doc_api_v2_doc_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc update'],
  },
  doc_api_v2_doc_destroy: {
    method: 'delete',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc delete'],
  },
  doc_api_v2_doc_version_list: {
    method: 'get',
    path: '/api/v2/doc_versions',
    commands: ['doc versions'],
  },
  doc_api_v2_doc_version_show: {
    method: 'get',
    path: '/api/v2/doc_versions/{id}',
    commands: ['doc version'],
  },
  'doc_api_v2_repo_toc_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/toc',
    commands: ['toc get'],
  },
  'doc_api_v2_repo_toc_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}/toc',
    commands: ['toc update'],
  },
  doc_api_v2_repo_toc_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/toc',
    commands: ['toc get'],
  },
  doc_api_v2_repo_toc_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}/toc',
    commands: ['toc update'],
  },
  'repo_api_v2_repo_list-by_group': {
    method: 'get',
    path: '/api/v2/groups/{login}/repos',
    commands: ['repo list'],
  },
  'repo_api_v2_repo_create-by_group': {
    method: 'post',
    path: '/api/v2/groups/{login}/repos',
    commands: ['repo create'],
  },
  repo_api_v2_repo_list: {
    method: 'get',
    path: '/api/v2/users/{login}/repos',
    commands: ['repo list'],
  },
  repo_api_v2_repo_create: {
    method: 'post',
    path: '/api/v2/users/{login}/repos',
    commands: ['repo create'],
  },
  'repo_api_v2_repo_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}',
    commands: ['repo get'],
  },
  'repo_api_v2_repo_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}',
    commands: ['repo update'],
  },
  'repo_api_v2_repo_destroy-by_id': {
    method: 'delete',
    path: '/api/v2/repos/{book_id}',
    commands: ['repo delete'],
  },
  repo_api_v2_repo_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['repo get'],
  },
  repo_api_v2_repo_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['repo update'],
  },
  repo_api_v2_repo_destroy: {
    method: 'delete',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['repo delete'],
  },
  statistic_api_v2_statistic_all: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics',
    commands: ['stats group'],
  },
  statistic_api_v2_statistic_by_members: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/members',
    commands: ['stats members'],
  },
  statistic_api_v2_statistic_by_books: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/books',
    commands: ['stats books'],
  },
  statistic_api_v2_statistic_by_docs: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/docs',
    commands: ['stats docs'],
  },
};

const EXPECTED_LEAF_COMMANDS = [
  'ping',
  'auth status',
  'user info',
  'user groups',
  'search',
  'group members',
  'group member set',
  'group member remove',
  'repo list',
  'repo get',
  'repo create',
  'repo update',
  'repo delete',
  'doc list',
  'doc get',
  'doc create',
  'doc update',
  'doc delete',
  'doc versions',
  'doc version',
  'toc get',
  'toc update',
  'stats group',
  'stats members',
  'stats books',
  'stats docs',
].sort();

interface SpecOperation {
  operationId: string;
  method: string;
  path: string;
}

interface SpecOperations {
  operations: SpecOperation[];
  /** method + path entries that declare no operationId — must stay empty. */
  missingOperationIds: string[];
}

function loadSpecOperations(): SpecOperations {
  const specPath = fileURLToPath(new URL('../spec/yuque-openapi.yaml', import.meta.url));
  const spec = load(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  const operations: SpecOperation[] = [];
  const missingOperationIds: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const operation = item[method];
      if (!operation) continue;
      if (operation.operationId) {
        operations.push({ operationId: operation.operationId, method, path });
      } else {
        missingOperationIds.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return { operations, missingOperationIds };
}

function collectLeafCommands(command: Command, prefix: string[] = []): string[] {
  const leaves: string[] = [];
  for (const sub of command.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length === 0) {
      leaves.push(path.join(' '));
    } else {
      leaves.push(...collectLeafCommands(sub, path));
    }
  }
  return leaves;
}

const mappedCommands = () => Object.values(OPERATION_TO_COMMANDS).flatMap((row) => row.commands);

describe('spec coverage contract', () => {
  const { operations, missingOperationIds } = loadSpecOperations();
  const registeredLeaves = collectLeafCommands(buildProgram()).sort();

  it('pins the spec identity (38 operations)', () => {
    expect(operations).toHaveLength(38);
  });

  it('has no spec operation without an operationId', () => {
    // A spec refresh adding an operationId-less path must not silently escape
    // the contract: every method+path entry has to carry an operationId.
    expect(missingOperationIds).toEqual([]);
  });

  it('maps every spec operation to at least one CLI command', () => {
    const unmapped = operations.filter((op) => !OPERATION_TO_COMMANDS[op.operationId]);
    expect(
      unmapped.map((op) => `${op.operationId} (${op.method.toUpperCase()} ${op.path})`)
    ).toEqual([]);
  });

  it('pins each mapped operation to its spec method and path', () => {
    const mismatched = operations
      .filter((op) => {
        const row = OPERATION_TO_COMMANDS[op.operationId];
        return row !== undefined && (row.method !== op.method || row.path !== op.path);
      })
      .map((op) => `${op.operationId}: spec has ${op.method.toUpperCase()} ${op.path}`);
    expect(mismatched).toEqual([]);
  });

  it('has no stale operationIds in the mapping table', () => {
    const known = new Set(operations.map((op) => op.operationId));
    const stale = Object.keys(OPERATION_TO_COMMANDS).filter((id) => !known.has(id));
    expect(stale).toEqual([]);
  });

  it('registers exactly the expected leaf commands', () => {
    expect(registeredLeaves).toEqual(EXPECTED_LEAF_COMMANDS);
  });

  it('every mapped command exists in the program', () => {
    const registered = new Set(registeredLeaves);
    const missing = [...new Set(mappedCommands())].filter(
      (commandPath) => !registered.has(commandPath)
    );
    expect(missing).toEqual([]);
  });

  it('every leaf command traces back to a spec operation', () => {
    const mapped = new Set(mappedCommands());
    const orphans = registeredLeaves.filter((commandPath) => !mapped.has(commandPath));
    expect(orphans).toEqual([]);
  });
});
