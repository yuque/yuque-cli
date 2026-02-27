#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { startRepl } from './repl.js';
import { splitRepoDoc } from './utils.js';
import { whoami, listRepos, listDocs, openDoc, readDoc, searchDocs } from './commands.js';

export function createProgram(deps = {}) {
  const {
    startReplFn = startRepl,
    whoamiFn = whoami,
    listReposFn = listRepos,
    listDocsFn = listDocs,
    openDocFn = openDoc,
    readDocFn = readDoc,
    searchDocsFn = searchDocs,
    stdout = console.log,
    stderr = (msg) => console.error(chalk.red(msg))
  } = deps;

  const program = new Command();

  program.name('yuque').description('Yuque CLI').version('0.1.0');

  program
    .command('repl')
    .description('Start interactive mode')
    .action(async () => {
      await startReplFn();
    });

  program
    .command('whoami')
    .description('Show current user')
    .action(async () => {
      try {
        const u = await whoamiFn();
        stdout(`${u.name || u.login} (${u.id})`);
      } catch (err) {
        stderr(err.message);
        process.exitCode = 1;
      }
    });

  program
    .command('list')
    .argument('<type>', 'repos|docs')
    .argument('[repo]', 'repo namespace')
    .description('List repos or docs')
    .action(async (type, repo) => {
      try {
        if (type === 'repos') {
          const repos = await listReposFn();
          repos.forEach((r) => stdout(r.namespace));
        } else if (type === 'docs') {
          if (!repo) throw new Error('Repo required');
          const docs = await listDocsFn(repo);
          docs.forEach((d) => stdout(d.slug));
        } else {
          throw new Error('Type must be repos or docs');
        }
      } catch (err) {
        stderr(err.message);
        process.exitCode = 1;
      }
    });

  program
    .command('open')
    .argument('<repoDoc>', 'repo/doc')
    .description('Open doc in browser')
    .action(async (repoDoc) => {
      try {
        await openDocFn(repoDoc);
      } catch (err) {
        stderr(err.message);
        process.exitCode = 1;
      }
    });

  program
    .command('show')
    .argument('<repoDoc>', 'repo/doc')
    .description('Show doc markdown')
    .action(async (repoDoc) => {
      try {
        const parsed = splitRepoDoc(repoDoc);
        if (!parsed?.repo || !parsed?.doc) {
          throw new Error('Use <repo>/<doc> format');
        }
        const doc = await readDocFn(parsed.repo, parsed.doc);
        stdout(doc?.body || doc?.body_draft || '');
      } catch (err) {
        stderr(err.message);
        process.exitCode = 1;
      }
    });

  program
    .command('search')
    .argument('<q>', 'keyword')
    .argument('<repo>', 'repo namespace')
    .description('Search docs in repo')
    .action(async (q, repo) => {
      try {
        const res = await searchDocsFn(repo, q);
        res.forEach((d) => stdout(d.title || d.slug));
      } catch (err) {
        stderr(err.message);
        process.exitCode = 1;
      }
    });

  return program;
}

export async function main(argv = process.argv, deps = {}) {
  const program = createProgram(deps);
  if (argv.length <= 2) {
    const startReplFn = deps.startReplFn || startRepl;
    await startReplFn();
    return;
  }
  await program.parseAsync(argv);
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await main();
}
