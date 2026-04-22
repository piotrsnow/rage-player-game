/**
 * Collapse a WorldEvent `payload` (JSON string or object) into a short
 * human-readable `k=v k=v` string capped at ~180 chars. Used by event
 * lists and NPC detail views.
 */
export function summarizePayload(payload) {
  if (!payload) return '';
  let obj = payload;
  if (typeof payload === 'string') {
    try { obj = JSON.parse(payload); } catch { return payload.slice(0, 200); }
  }
  if (!obj || typeof obj !== 'object') return String(obj).slice(0, 200);
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    const short = typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${short.slice(0, 60)}`);
    if (parts.join(' ').length > 180) break;
  }
  return parts.join(' ');
}
