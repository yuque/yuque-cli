import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('bin entry works when invoked through a symlink', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuque-cli-'));
  const linkPath = path.join(tmpDir, 'yuque');
  const entryPath = fileURLToPath(new URL('../src/index.js', import.meta.url));

  try {
    symlinkSync(entryPath, linkPath, 'file');
    const result = spawnSync(process.execPath, [linkPath, '--version'], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /0\.1\.0/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
