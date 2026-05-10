import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';

const SINGLETON_ID = 'singleton';

const ROLE_DEFAULTS = {
  body: { font: 'MedievalSharp', color: '', sizeMultiplier: 1, letterSpacing: 0, fontStretch: 100, shadowColor: '', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowSpread: 0, outlineWidth: 0, outlineColor: '' },
  headline: { font: 'New_Rocker', color: '', sizeMultiplier: 1, letterSpacing: 0, fontStretch: 100, shadowColor: '', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowSpread: 0, outlineWidth: 0, outlineColor: '' },
  accent: { font: 'Sankofa_Display', color: '', sizeMultiplier: 1, letterSpacing: 0, fontStretch: 100, shadowColor: '', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowSpread: 0, outlineWidth: 0, outlineColor: '' },
  mono: { font: 'Bitcount', color: '', sizeMultiplier: 1, letterSpacing: 0, fontStretch: 100, shadowColor: '', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowSpread: 0, outlineWidth: 0, outlineColor: '' },
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FONTS_DIR = findFontsDir(__dirname);

function findFontsDir(fromDir) {
  const dockerPath = resolve(fromDir, '..', '..', 'public', 'dist', 'fonts');
  const hostPath = resolve(fromDir, '..', '..', '..', 'public', 'fonts');
  try { statSync(dockerPath); return dockerPath; } catch { /* noop */ }
  try { statSync(hostPath); return hostPath; } catch { /* noop */ }
  return hostPath;
}

function listTtfFiles(fontFolder) {
  const dir = join(FONTS_DIR, fontFolder);
  try {
    return collectTtf(dir, '');
  } catch {
    return [];
  }
}

function collectTtf(dir, prefix) {
  const results = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) {
      results.push(...collectTtf(full, prefix ? `${prefix}/${item}` : item));
    } else if (item.endsWith('.ttf')) {
      results.push(prefix ? `${prefix}/${item}` : item);
    }
  }
  return results;
}

function buildResponse(raw) {
  const result = {};
  for (const role of Object.keys(ROLE_DEFAULTS)) {
    const saved = raw[role] || {};
    const merged = { ...ROLE_DEFAULTS[role], ...saved };
    result[role] = { ...merged, files: listTtfFiles(merged.font) };
  }
  return result;
}

const ROLE_SCHEMA = {
  type: 'object',
  properties: {
    font: { type: 'string', maxLength: 64 },
    color: { type: 'string', maxLength: 32 },
    sizeMultiplier: { type: 'number', minimum: 0.5, maximum: 3 },
    letterSpacing: { type: 'number', minimum: -2, maximum: 10 },
    fontStretch: { type: 'number', minimum: 50, maximum: 200 },
    shadowColor: { type: 'string', maxLength: 32 },
    shadowBlur: { type: 'number', minimum: 0, maximum: 20 },
    shadowX: { type: 'number', minimum: -10, maximum: 10 },
    shadowY: { type: 'number', minimum: -10, maximum: 10 },
    shadowSpread: { type: 'number', minimum: 0, maximum: 5 },
    outlineWidth: { type: 'number', minimum: 0, maximum: 5 },
    outlineColor: { type: 'string', maxLength: 32 },
  },
  additionalProperties: false,
};

export async function fontConfigRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async () => {
    const row = await prisma.serverSettings.findUnique({ where: { id: SINGLETON_ID } });
    const raw = (row?.fontConfig && typeof row.fontConfig === 'object') ? row.fontConfig : {};
    return buildResponse(raw);
  });

  fastify.put('/', {
    preHandler: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          body: ROLE_SCHEMA,
          headline: ROLE_SCHEMA,
          accent: ROLE_SCHEMA,
          mono: ROLE_SCHEMA,
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const row = await prisma.serverSettings.findUnique({ where: { id: SINGLETON_ID } });
    const current = (row?.fontConfig && typeof row.fontConfig === 'object') ? row.fontConfig : {};

    const updated = { ...current };
    for (const role of Object.keys(ROLE_DEFAULTS)) {
      if (request.body[role]) {
        updated[role] = { ...(current[role] || {}), ...request.body[role] };
      }
    }

    await prisma.serverSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, fontConfig: updated },
      update: { fontConfig: updated },
    });

    return buildResponse(updated);
  });
}
