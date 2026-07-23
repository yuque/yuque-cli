#!/usr/bin/env node
/** Smoke-test the built CLI in dist/ the way npx would run it. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
let failures = 0;

function check(name, args, { expectCode = 0, expectStdout } = {}) {
  const result = spawnSync('node', [bin, ...args], { encoding: 'utf8', env: { ...process.env } });
  const ok =
    result.status === expectCode && (!expectStdout || result.stdout.includes(expectStdout));
  if (ok) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}: exit=${result.status} (want ${expectCode})`);
    if (expectStdout) console.error(`  stdout missing: ${JSON.stringify(expectStdout)}`);
    console.error(`  stdout: ${result.stdout.slice(0, 300)}`);
    console.error(`  stderr: ${result.stderr.slice(0, 300)}`);
  }
}

check('--version prints a semver', ['--version'], { expectStdout: '.' });
check('--help shows command groups', ['--help'], { expectStdout: 'doc' });
check('doc --help shows subcommands', ['doc', '--help'], { expectStdout: 'list' });
check('unknown command exits 2', ['no-such-command'], { expectCode: 2 });
check('missing token exits 3', ['user', 'info'], { expectCode: 3 });

process.exit(failures === 0 ? 0 : 1);
