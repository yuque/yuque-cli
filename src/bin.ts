#!/usr/bin/env node
import { runCli } from './cli.js';

// Piping into a consumer that exits early (`yuque doc list ... | head`) breaks
// the pipe; exit quietly instead of crashing with an unhandled EPIPE 'error'.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

process.exitCode = await runCli(process.argv);
