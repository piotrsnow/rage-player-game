import { createHash } from 'crypto';

const EXT_MAP = {
  image: 'png',
  music: 'mp3',
  sfx: 'mp3',
  tts: 'mp3',
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
