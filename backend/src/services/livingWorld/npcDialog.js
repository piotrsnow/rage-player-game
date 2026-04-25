// Living World — Per-NPC 1-on-1 dialog (C2 endpoint).
//
// Bypasses the scene-gen pipeline for focused conversations with a named
// agent NPC. ~80x cheaper than a premium scene call, ~700ms latency.
//
// Identity: per-NPC system prompt assembled from personality + filtered
// knowledge + recent dialog history. When NPC is a companion of this
// campaign, the lockedSnapshot + deferred outbox act as the read-model
// (so they "know" what just happened on the trip without needing a flush).

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { forNpc, parseEventPayload, appendEvent } from './worldEventLog.js';
import { listDeferred, appendDeferred } from './deferredOutbox.js';

const log = childLogger({ module: 'npcDialog' });

const HISTORY_CAP = 50; // rolling buffer per (npc, campaign)
const HISTORY_CONTEXT = 10; // injected into system prompt
const RECENT_EVENT_CONTEXT = 20;
const STANDARD_TIMEOUT_MS = 8000;

/**
 * Generate a 1-on-1 NPC reply. Persists the exchange into
 * WorldNPC.dialogHistory[campaignId] (rolling cap 50, oldest dropped).
 *
 * @param {object} params
 * @param {string} params.worldNpcId
 * @param {string} params.campaignId
 * @param {string} params.playerMessage
 * @param {string} [params.language='pl']
 * @param {string} [params.provider='openai']
 * @param {object|null} [params.userApiKeys] — per-user keys forwarded by the route
 * @returns {Promise<{dialog: string, emote: string|null, stateChange: object|null, fallback?: boolean}>}
 */
export async function generate({
  worldNpcId,
  campaignId,
  playerMessage,
  language = 'pl',
  provider = 'openai',
  userApiKeys = null,
}) {
  if (!worldNpcId || !campaignId || !playerMessage) {
    return fallbackReply('[NPC milczy w zamyśleniu]');
  }

  const npc = await prisma.worldNPC.findUnique({ where: { id: worldNpcId } });
  if (!npc) return fallbackReply('[Nie ma tu nikogo o takim imieniu]');
  if (npc.alive === false) return fallbackReply('[Cisza. Nie ma już z kim rozmawiać.]');

  const isCompanion = String(npc.companionOfCampaignId || '') === String(campaignId);
  const isLockedByOther = npc.lockedByCampaignId && String(npc.lockedByCampaignId) !== String(campaignId);
  if (isLockedByOther) {
    return fallbackReply('[NPC jest gdzieś indziej, w trasie z kimś innym]');
  }

  const dialogHistory = parseDialogHistoryForCampaign(npc.dialogHistory, campaignId);
  const knowledgeEntries = parseKnowledgeBase(npc.knowledgeBase);

  // Recent events: prefer deferred (own trip) when companion, else campaign-tier events
  const recentEvents = isCompanion
    ? await listDeferred({ campaignId, worldNpcId })
    : await forNpc({ worldNpcId, campaignId, limit: RECENT_EVENT_CONTEXT });

  const systemPrompt = buildSystemPrompt({
    npc,
    isCompanion,
    dialogHistory,
    knowledgeEntries,
    recentEvents,
    language,
  });

  let parsed = null;
  try {
    const { text } = await callAIJson({
      provider,
      modelTier: 'standard',
      systemPrompt,
      userPrompt: playerMessage,
      maxTokens: 400,
      temperature: 0.8,
      userApiKeys,
    });
    parsed = parseJsonOrNull(text);
  } catch (err) {
    log.warn({ err: err?.message, worldNpcId, campaignId }, 'npcDialog generation failed');
  }

  if (!parsed?.dialog || typeof parsed.dialog !== 'string') {
    return fallbackReply('[NPC nic nie odpowiada]');
  }

  const reply = {
    dialog: parsed.dialog.trim(),
    emote: typeof parsed.emote === 'string' ? parsed.emote : null,
    stateChange: parsed.stateChange && typeof parsed.stateChange === 'object' ? parsed.stateChange : null,
  };

  // Persist exchange — rolling buffer per campaign
  await appendToHistory({
    worldNpcId,
    campaignId,
    npc,
    playerMessage,
    reply,
  });

  // Audit event — deferred for companion, campaign-scoped otherwise
  const eventPayload = {
    excerpt: reply.dialog.slice(0, 200),
    emote: reply.emote,
  };
  try {
    if (isCompanion) {
      await appendDeferred({
        campaignId,
        worldNpcId,
        eventType: 'spoke',
        payload: eventPayload,
      });
    } else {
      await appendEvent({
        worldNpcId,
        campaignId,
        eventType: 'spoke',
        payload: eventPayload,
        visibility: 'campaign',
      });
    }
  } catch {
    // non-fatal — dialog was returned to caller, log persist is best-effort
  }

  return reply;
}

// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

function buildSystemPrompt({ npc, isCompanion, dialogHistory, knowledgeEntries, recentEvents, language }) {
  const lines = [];
  lines.push(`You are ${npc.name}${npc.role ? `, ${npc.role}` : ''}.`);
  if (npc.personality) lines.push(`Personality: ${npc.personality}`);
  if (npc.alignment && npc.alignment !== 'neutral') lines.push(`Alignment: ${npc.alignment}`);
  if (isCompanion) {
    lines.push(`You are currently traveling with the player as a companion (loyalty ${npc.companionLoyalty ?? 50}/100). Speak intimately when context warrants; you trust them more than strangers.`);
  }

  // Speech style — terse hint based on role keywords. Premium dialog model
  // already understands "noble" vs "peasant" — we just nudge.
  lines.push('Stay in character. Speech matches your role and personality (vocabulary, register, rhythm).');

  if (knowledgeEntries.length > 0) {
    const safeKnowledge = knowledgeEntries
      .filter((k) => k.sensitivity !== 'never_share')
      .slice(0, 12)
      .map((k) => `- ${k.topic}${k.source ? ` (heard from: ${k.source})` : ''}`);
    if (safeKnowledge.length > 0) {
      lines.push('\n## What you know');
      lines.push(safeKnowledge.join('\n'));
    }
  }

  if (recentEvents.length > 0) {
    const eventLines = recentEvents.slice(0, RECENT_EVENT_CONTEXT).map((e) => {
      const payload = parseEventPayload(e);
      const label = payload.blurb || payload.excerpt || payload.summary || `[${e.eventType}]`;
      const when = e.gameTime ? new Date(e.gameTime).toISOString().slice(0, 16).replace('T', ' ') : '';
      return `- ${when ? `[${when}] ` : ''}${label}`.slice(0, 200);
    });
    lines.push('\n## Recent events you experienced');
    lines.push(eventLines.join('\n'));
  }

  if (dialogHistory.length > 0) {
    const last = dialogHistory.slice(-HISTORY_CONTEXT);
    lines.push('\n## Recent conversation with this player');
    for (const turn of last) {
      lines.push(`Player: ${truncate(turn.playerMsg, 200)}`);
      lines.push(`You: ${truncate(turn.npcResponse, 200)}`);
    }
  }

  lines.push('\n## DO NOT');
  lines.push('- Reveal facts you don\'t actually know.');
  lines.push('- Refer to other players, campaigns, or sessions outside your perspective.');
  lines.push('- Make up major world events (deaths, quest completions) without explicit knowledge.');

  lines.push(`\nReply with ONLY valid JSON, no other text. Use this shape:`);
  lines.push(`{"dialog": "${language === 'pl' ? 'twoja kwestia po polsku' : 'your line'}", "emote": "smile|frown|nod|shrug|wary|stern|warm" | null, "stateChange": {"disposition": -5..+5, "knowledgeGain": "what you learned this turn"} | null}`);
  if (language === 'pl') {
    lines.push('Mów po polsku. Krótko i autentycznie — 1-3 zdań.');
  } else {
    lines.push('Speak in English. Keep it short and authentic — 1-3 sentences.');
  }

  return lines.join('\n');
}

function parseDialogHistoryForCampaign(raw, campaignId) {
  if (!raw || typeof raw !== 'object') return [];
  const arr = raw[campaignId];
  return Array.isArray(arr) ? arr : [];
}

function parseKnowledgeBase(raw) {
  return Array.isArray(raw) ? raw : [];
}

async function appendToHistory({ worldNpcId, campaignId, npc, playerMessage, reply }) {
  const allHistory = (npc.dialogHistory && typeof npc.dialogHistory === 'object')
    ? { ...npc.dialogHistory }
    : {};

  const list = Array.isArray(allHistory[campaignId]) ? [...allHistory[campaignId]] : [];
  list.push({
    playerMsg: truncate(playerMessage, 600),
    npcResponse: truncate(reply.dialog, 600),
    emote: reply.emote || null,
    at: new Date().toISOString(),
  });

  while (list.length > HISTORY_CAP) list.shift();

  allHistory[campaignId] = list;

  try {
    await prisma.worldNPC.update({
      where: { id: worldNpcId },
      data: { dialogHistory: allHistory },
    });
  } catch (err) {
    log.warn({ err, worldNpcId, campaignId }, 'Failed to persist dialog history (non-fatal)');
  }
}

function fallbackReply(text) {
  return { dialog: text, emote: null, stateChange: null, fallback: true };
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export const __testing = { buildSystemPrompt, parseDialogHistoryForCampaign };
