import { prisma } from '../lib/prisma.js';

const SINGLETON_ID = 'singleton';
const CACHE_TTL_MS = 60_000;

let cached = null;
let cachedAt = 0;

export const TASK_CATEGORIES = [
  'sceneGeneration',
  'campaignGeneration',
  'intentClassification',
  'memoryExtraction',
  'imagePrompt',
  'auxiliary',
];

export async function getModelOverrides() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const row = await prisma.serverSettings.findUnique({ where: { id: SINGLETON_ID } });
  cached = (row?.modelOverrides && typeof row.modelOverrides === 'object') ? row.modelOverrides : {};
  cachedAt = now;
  return cached;
}

export async function setModelOverrides(overrides) {
  await prisma.serverSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { modelOverrides: overrides },
    create: { id: SINGLETON_ID, modelOverrides: overrides },
  });
  cached = overrides;
  cachedAt = Date.now();
}

export async function resolveModelForTask(taskCategory, provider) {
  const overrides = await getModelOverrides();
  const entry = overrides[taskCategory];
  if (!entry) return null;
  const model = entry[provider];
  return model || null;
}
