#!/usr/bin/env node
/**
 * CI check: verify that env var keys are in sync across .env.example,
 * backend/.env.example, and docker-compose.yml backend service environment block.
 *
 * Exits 0 if clean, 1 if mismatches found.
 * Uses only Node.js built-in modules.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)[\s=]/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function parseComposeEnvironment(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const keys = new Set();

  let inBackendService = false;
  let backendIndent = -1;
  let inEnvironment = false;
  let envIndent = -1;

  for (const line of lines) {
    const stripped = line.trimEnd();
    const trimmed = stripped.trimStart();
    const indent = stripped.length - trimmed.length;

    // Detect `backend:` service (top-level service, indent 2)
    if (/^\s{2}backend:\s*$/.test(stripped)) {
      inBackendService = true;
      backendIndent = indent;
      inEnvironment = false;
      continue;
    }

    // Detect another top-level service starting (exit backend block)
    if (inBackendService && trimmed && !trimmed.startsWith('#') && indent <= backendIndent && indent > 0) {
      inBackendService = false;
      inEnvironment = false;
      continue;
    }

    if (!inBackendService) continue;

    // Detect `environment:` key within backend service
    if (trimmed === 'environment:') {
      inEnvironment = true;
      envIndent = indent;
      continue;
    }

    // Detect exit from environment block (next sibling key at same or lower indent as environment:)
    if (inEnvironment && trimmed && !trimmed.startsWith('#') && indent <= envIndent) {
      inEnvironment = false;
      continue;
    }

    if (!inEnvironment) continue;

    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match `KEY: "value"` or `KEY: value` or `- KEY=value` patterns
    const kvMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*):/);
    if (kvMatch) {
      keys.add(kvMatch[1]);
      continue;
    }
    const listMatch = trimmed.match(/^-\s*([A-Z_][A-Z0-9_]*)=/);
    if (listMatch) {
      keys.add(listMatch[1]);
    }
  }
  return keys;
}

// Env vars that are inherently specific to one context and not expected to sync.
const IGNORE_KEYS = new Set([
  'COMPOSE_PROFILES',  // root .env only — docker compose profile toggle
  'PORT',              // backend .env only — container sets its own
  'HOST',             // backend .env only
  'NODE_ENV',         // compose sets override, not in .env files
]);

const rootEnvPath = existsSync(resolve(ROOT, '.env.example'))
  ? resolve(ROOT, '.env.example')
  : resolve(ROOT, '.env');
const backendEnvPath = existsSync(resolve(ROOT, 'backend', '.env.example'))
  ? resolve(ROOT, 'backend', '.env.example')
  : resolve(ROOT, 'backend', '.env');
const composePath = resolve(ROOT, 'docker-compose.yml');

const rootKeys = parseEnvFile(rootEnvPath);
const backendKeys = parseEnvFile(backendEnvPath);
const composeKeys = parseComposeEnvironment(composePath);

if (!rootKeys) {
  console.error(`ERROR: Could not find root .env.example or .env at ${ROOT}`);
  process.exit(1);
}
if (!backendKeys) {
  console.error(`ERROR: Could not find backend/.env.example or backend/.env`);
  process.exit(1);
}
if (!composeKeys) {
  console.error(`ERROR: Could not parse docker-compose.yml at ${composePath}`);
  process.exit(1);
}

let mismatches = 0;

function warn(msg) {
  console.warn(`  ⚠  ${msg}`);
  mismatches++;
}

console.log(`Root env keys (${rootEnvPath}): ${rootKeys.size}`);
console.log(`Backend env keys (${backendEnvPath}): ${backendKeys.size}`);
console.log(`Compose env keys (docker-compose.yml): ${composeKeys.size}`);
console.log('');

// Keys in root .env but missing from backend .env
for (const key of rootKeys) {
  if (IGNORE_KEYS.has(key)) continue;
  if (!backendKeys.has(key)) {
    warn(`${key} in root .env but MISSING from backend/.env`);
  }
}

// Keys in backend .env but missing from root .env
for (const key of backendKeys) {
  if (IGNORE_KEYS.has(key)) continue;
  if (!rootKeys.has(key)) {
    warn(`${key} in backend/.env but MISSING from root .env`);
  }
}

// Keys in backend .env but missing from compose environment block
for (const key of backendKeys) {
  if (IGNORE_KEYS.has(key)) continue;
  if (!composeKeys.has(key)) {
    warn(`${key} in backend/.env but MISSING from docker-compose.yml environment`);
  }
}

// Keys in compose but missing from backend .env
for (const key of composeKeys) {
  if (IGNORE_KEYS.has(key)) continue;
  if (!backendKeys.has(key)) {
    warn(`${key} in docker-compose.yml but MISSING from backend/.env`);
  }
}

console.log('');
if (mismatches > 0) {
  console.error(`FAIL: ${mismatches} env var mismatch(es) found.`);
  process.exit(1);
} else {
  console.log('OK: All env var keys are in sync.');
  process.exit(0);
}
