// Stage 2 (Round E follow-on) — NPC memory updates handler.
//
// Scene-gen LLM emits `stateChanges.npcMemoryUpdates: [{npcName, memory, importance?}]`
// when a notable event happens to an NPC in the scene ("gracz obiecał mu
// zemstę", "straciła wiarę w króla", "widział gracza uzdrawiającego dziecko").
//
// This handler resolves each `npcName` to a `CampaignNPC` via the same slug
// rule as `processNpcChanges`, appends the memory to the shadow's
// `experienceLog`, and caps the log at MAX_LOG_ENTRIES per NPC (oldest
// entries drop). Canonical `WorldNPC.knowledgeBase` is NOT touched here —
// post-campaign write-back (Stage 2b) will LLM-filter the important
// entries into canon so lived experience propagates across campaigns.
//
// Idempotency is loose: re-running the handler on the same scene's updates
// re-appends duplicates. Scene-gen never replays a finished scene, so in
// practice this is single-shot.

import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { parseNpcMemoryUpdates } from './schemas.js';
import * as ragService from '../../livingWorld/ragService.js';

const log = childLogger({ module: 'sceneGenerator' });

const MAX_LOG_ENTRIES_PER_NPC = 20;

// Stage 2a.2 — cap on how many OTHER NPCs can get a mirror entry from a
// single source memory. Prevents one memory mentioning four NPCs from
// fanning out into four separate writes, which risks flooding secondary
// NPCs with tangential events.
const MAX_MIRROR_TARGETS_PER_SOURCE = 3;

/** Pure — slug an NPC name to match `CampaignNPC.npcId`. Mirrors npcs.js. */
export function npcNameToId(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Pure — append new memory entries to an existing log, respecting the cap.
 * Drops the oldest entries when the cap is exceeded (FIFO). Returns the
 * NEW log as a fresh array (immutable).
 */
export function appendMemoryEntries(existingLog, newEntries, { maxEntries = MAX_LOG_ENTRIES_PER_NPC } = {}) {
  const existing = Array.isArray(existingLog) ? existingLog : [];
  const incoming = Array.isArray(newEntries) ? newEntries : [];
  const merged = [...existing, ...incoming];
  if (merged.length <= maxEntries) return merged;
  return merged.slice(merged.length - maxEntries);
}

/** Pure — convert a validated LLM update to the storage-entry shape. */
export function toMemoryEntry(update, { now = new Date() } = {}) {
  return {
    content: update.memory,
    importance: update.importance || 'minor',
    addedAt: now.toISOString(),
  };
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const POLISH_VOWEL_RE_CLASS = '[aąeęioóuy]';
const POLISH_VOWEL_FINAL_RE = /[aąeęioóuy]$/;

/**
 * Pure — build a case-insensitive whole-word matcher for an NPC name that
 * also accepts Polish inflected forms where the final vowel may swap
 * (e.g. "Lyana" → Lyany / Lyaną / Lyanę / Lyano). Uses lookbehind/lookahead
 * so the match must sit at a non-letter boundary, preventing "Gerent"
 * matching inside "Gerenton" or "Germania" inside unrelated words.
 *
 * Exported for test visibility; callers should use `detectMirrorTargets`.
 */
export function buildNpcNameMatcher(nameLower) {
  const esc = nameLower.replace(REGEX_ESCAPE, '\\$&');
  if (POLISH_VOWEL_FINAL_RE.test(nameLower)) {
    const stem = nameLower.slice(0, -1).replace(REGEX_ESCAPE, '\\$&');
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])(?:${esc}|${stem}${POLISH_VOWEL_RE_CLASS})(?![\\p{L}\\p{N}_])`,
      'u',
    );
  }
  return new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, 'u');
}

/**
 * Stage 2a.2 — pure. Scan a memory text for mentions of OTHER NPCs in this
 * campaign. Case-insensitive, whole-word match with Polish-inflection
 * tolerance (see `buildNpcNameMatcher`).
 *
 * Skips self-mention. Dedups by row id so one source memory never mirrors
 * to the same target twice even if the name appears multiple times in text.
 * Returns at most `maxTargets` matched NPC rows in the order they appear
 * in `otherNpcs` (caller's ordering preserved).
 */
export function detectMirrorTargets(memoryText, sourceName, otherNpcs, { maxTargets = MAX_MIRROR_TARGETS_PER_SOURCE } = {}) {
  if (typeof memoryText !== 'string' || memoryText.length === 0) return [];
  if (!Array.isArray(otherNpcs) || otherNpcs.length === 0) return [];

  const haystack = memoryText.toLowerCase();
  const sourceLower = String(sourceName || '').toLowerCase();
  const out = [];

  for (const npc of otherNpcs) {
    if (!npc || typeof npc.name !== 'string' || npc.name.length === 0) continue;
    const nameLower = npc.name.toLowerCase();
    if (nameLower === sourceLower) continue;
    if (!buildNpcNameMatcher(nameLower).test(haystack)) continue;
    if (out.some((o) => o.id === npc.id)) continue;

    out.push(npc);
    if (out.length >= maxTargets) break;
  }
  return out;
}

/**
 * Stage 2a.2 — pure. Build a mirror entry for a target NPC from the source
 * entry. Step-down rules (binary enum):
 *   - source.importance === 'major' → mirror with 'minor'
 *   - source.importance === 'minor' → null (too low to be worth mirroring)
 *   - source flagged `mirror: true`  → null (no ping-pong)
 *
 * Content is prefixed `[zasłyszane o {sourceName}]` so premium can
 * distinguish lived vs hearsay memory in the prompt.
 */
export function buildMirrorEntry(sourceEntry, sourceName, { now = new Date() } = {}) {
  if (!sourceEntry || typeof sourceEntry !== 'object') return null;
  if (sourceEntry.mirror === true) return null;
  if (sourceEntry.importance !== 'major') return null;
  const content = `[zasłyszane o ${sourceName || 'innego NPC'}] ${sourceEntry.content}`;
  return {
    content,
    importance: 'minor',
    addedAt: now.toISOString(),
    mirror: true,
  };
}

/**
 * Apply `npcMemoryUpdates` for a scene. Groups by resolved CampaignNPC,
 * then one read + write per NPC regardless of how many memories the LLM
 * stuffed at the same NPC. Best-effort: schema failures downgrade to a
 * warning (the rest of the scene still commits), per-NPC write failures
 * are logged and skipped.
 *
 * Stage 2a.2 — symmetry hook: every major source memory also scans for
 * mentions of OTHER CampaignNPCs and writes a mirror entry to each
 * (flagged `mirror: true`, step-down to minor, content prefixed with
 * `[zasłyszane o {sourceName}]`). Prevents cross-NPC consistency gaps
 * without forcing premium to double-emit.
 */
export async function processNpcMemoryUpdates(campaignId, rawUpdates) {
  if (!campaignId) return { applied: 0, skipped: 0, mirrored: 0 };
  if (!rawUpdates || (Array.isArray(rawUpdates) && rawUpdates.length === 0)) {
    return { applied: 0, skipped: 0, mirrored: 0 };
  }

  const parse = parseNpcMemoryUpdates(rawUpdates);
  if (!parse.ok) {
    log.warn({ campaignId, issues: parse.error?.issues },
      'npcMemoryUpdates schema failed — bucket skipped');
    return { applied: 0, skipped: Array.isArray(rawUpdates) ? rawUpdates.length : 0, mirrored: 0 };
  }
  const updates = parse.data;
  if (updates.length === 0) return { applied: 0, skipped: 0, mirrored: 0 };

  // Prefetch all CampaignNPCs in this campaign once — needed both for the
  // primary write path (no functional change) and for Stage 2a.2 mirror
  // detection (scanning memory text for OTHER NPC mentions).
  const campaignNpcs = await prisma.campaignNPC.findMany({
    where: { campaignId },
    select: { id: true, npcId: true, name: true, experienceLog: true },
  }).catch(() => []);
  if (campaignNpcs.length === 0) {
    log.info({ campaignId }, 'npcMemoryUpdates: no CampaignNPCs in campaign — bucket dropped');
    return { applied: 0, skipped: updates.length, mirrored: 0 };
  }
  const byNpcIdRow = new Map(campaignNpcs.map((n) => [n.npcId, n]));

  // Bucket entries destined for each target npcId. Primary source entries
  // land first; Stage 2a.2 mirror entries append to the same buckets so
  // one NPC gets at most one DB write regardless of how many source
  // memories triggered mirrors for them.
  const entriesByNpcId = new Map();
  const pushFor = (npcId, entry) => {
    if (!entriesByNpcId.has(npcId)) entriesByNpcId.set(npcId, []);
    entriesByNpcId.get(npcId).push(entry);
  };

  let mirrored = 0;
  let skippedNoTarget = 0;

  for (const u of updates) {
    const sourceNpcId = npcNameToId(u.npcName);
    if (!sourceNpcId) { skippedNoTarget += 1; continue; }
    const sourceEntry = toMemoryEntry(u);
    pushFor(sourceNpcId, sourceEntry);

    // Symmetry hook — only major memories mirror; minor entries skip
    // detection entirely so we don't waste regex cycles.
    if (sourceEntry.importance !== 'major') continue;
    const sourceRow = byNpcIdRow.get(sourceNpcId);
    const sourceDisplayName = sourceRow?.name || u.npcName;
    const otherNpcs = campaignNpcs.filter((n) => n.npcId !== sourceNpcId);
    const targets = detectMirrorTargets(u.memory, sourceDisplayName, otherNpcs);
    for (const target of targets) {
      const mirror = buildMirrorEntry(sourceEntry, sourceDisplayName);
      if (!mirror) break;
      pushFor(target.npcId, mirror);
      mirrored += 1;
    }
  }

  if (entriesByNpcId.size === 0) {
    return { applied: 0, skipped: skippedNoTarget || updates.length, mirrored: 0 };
  }

  let applied = 0;
  let skipped = skippedNoTarget;

  for (const [npcId, newEntries] of entriesByNpcId) {
    try {
      const row = byNpcIdRow.get(npcId);
      if (!row) {
        log.info({ campaignId, npcId },
          'npcMemoryUpdate skipped — CampaignNPC does not exist (scene-gen must introduce NPC first)');
        skipped += newEntries.length;
        continue;
      }

      const currentLog = Array.isArray(row.experienceLog) ? row.experienceLog : [];
      const nextLog = appendMemoryEntries(currentLog, newEntries);

      await prisma.campaignNPC.update({
        where: { id: row.id },
        data: { experienceLog: nextLog },
      });
      applied += newEntries.length;

      // Stage 3 wiring — fire-and-forget index each newly-appended entry so
      // the RAG-powered recall path (triggered in `buildNpcMemory` when a
      // merged memory pool exceeds 15 entries) has vectors ready. Stable id
      // scheme: `cexp:<campaignNpcId>:<addedAt>` (c = campaign experience).
      // Read-path fabricates the same id so matches are deterministic.
      for (const entry of newEntries) {
        if (!entry?.content || !entry?.addedAt) continue;
        ragService.index('npc_memory', `cexp:${row.id}:${entry.addedAt}`, entry.content)
          .catch(() => { /* non-fatal; static slice still works */ });
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, npcId },
        'npcMemoryUpdates write failed');
      skipped += newEntries.length;
    }
  }

  return { applied, skipped, mirrored };
}

/**
 * Pure — compute the Stage 3 RAG entityId for a memory entry. Shared between
 * the write path (index on append) and the read path (query by entityIds).
 * `ownerType` is `'cexp'` for CampaignNPC.experienceLog entries and `'wknw'`
 * for WorldNPC.knowledgeBase cross-campaign entries. Returns null when the
 * entry lacks a stable `addedAt` timestamp (baseline entries without one
 * stay out of the RAG pool — they're always in the prompt anyway).
 */
export function memoryEntityId(ownerType, ownerId, entry) {
  if (!ownerType || !ownerId || !entry?.addedAt) return null;
  return `${ownerType}:${ownerId}:${entry.addedAt}`;
}
