import os from 'node:os';
import path from 'node:path';
import { getConfigDir, readJson, writeJson } from './utils.js';

function getSettingsFile() {
  return path.join(os.homedir(), '.yuque', 'settings.json');
}

function getLegacyConfigFile() {
  return path.join(getConfigDir(), 'config.json');
}

export async function loadConfig() {
  const current = await readJson(getSettingsFile(), null);
  if (current && typeof current === 'object') {
    return current;
  }

  // One-time backward compatibility for old config location.
  const legacy = await readJson(getLegacyConfigFile(), null);
  if (legacy && typeof legacy === 'object') {
    await writeJson(getSettingsFile(), legacy);
    return legacy;
  }

  return {};
}

export async function saveConfig(next) {
  await writeJson(getSettingsFile(), next);
}

export async function getToken() {
  if (process.env.YUQUE_TOKEN) return process.env.YUQUE_TOKEN;
  const cfg = await loadConfig();
  return cfg.token || null;
}

export async function setToken(token) {
  const cfg = await loadConfig();
  cfg.token = token;
  await saveConfig(cfg);
}

export async function clearToken() {
  const cfg = await loadConfig();
  delete cfg.token;
  await saveConfig(cfg);
}
