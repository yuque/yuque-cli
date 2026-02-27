import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

export const APP_NAME = 'yuque-cli';

export function getConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, APP_NAME);
  return path.join(os.homedir(), '.config', APP_NAME);
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const raw = JSON.stringify(data, null, 2);
  await fs.writeFile(file, raw, 'utf8');
}

export function splitRepoDoc(input) {
  const parts = input.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repo = `${parts[0]}/${parts[1]}`;
  const doc = parts.slice(2).join('/');
  return { repo, doc };
}
