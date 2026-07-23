import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Base URL of the fixture server; becomes YUQUE_HOST. */
  host?: string;
  /** null = run without any token in the environment. */
  token?: string | null;
  env?: Record<string, string>;
  input?: string;
  timeoutMs?: number;
}

/**
 * Run the built CLI binary exactly as npx would, against a fixture server.
 * Async on purpose: the fixture server lives in this same process, so a
 * synchronous spawn would freeze the event loop and deadlock every request.
 * The environment is scrubbed of real YUQUE_* variables so a developer's
 * personal token can never leak into a test run.
 */
export function runYuque(args: string[], options: RunOptions = {}): Promise<RunResult> {
  if (!existsSync(BIN)) {
    throw new Error('dist/bin.js not found — run `npm run build` before the e2e suite');
  }
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('YUQUE_')) delete env[key];
  }
  if (options.token !== null) env.YUQUE_TOKEN = options.token ?? 'e2e-test-token';
  if (options.host !== undefined) env.YUQUE_HOST = options.host;
  env.NO_COLOR = '1';
  Object.assign(env, options.env);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    if (options.input !== undefined) child.stdin.write(options.input);
    child.stdin.end();

    const killTimer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 15000);
    child.on('error', (error) => {
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr });
    });
  });
}
