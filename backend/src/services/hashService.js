import { createHash } from 'crypto';

const EXT_MAP = {
  image: 'png',
  music: 'mp3',
  sfx: 'mp3',
  tts: 'mp3',
  model3d: 'glb',
};

export function generateKey(type, params, campaignId = null) {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  const hash = createHash('sha256').update(normalized).digest('hex').substring(0, 24);
  const ext = EXT_MAP[type] || 'bin';
  const typeDir = `${type}s/${hash}.${ext}`;
  return campaignId ? `campaigns/${campaignId}/${typeDir}` : typeDir;
}

export function hashFromParams(params) {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 24);
}

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Return `val` if it's a valid UUID string, otherwise `undefined`. Used by
 *  media/proxy routes to gate optional `campaignId` writes — Prisma rejects
 *  non-UUID input on @db.Uuid columns, so we pre-filter at the boundary. */
export function toUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val) ? val : undefined;
}
