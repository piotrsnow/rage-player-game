// Lazy backfill: jeśli NPC nie ma jeszcze pól `appearance` / `dialect`,
// generujemy je jednym małym wywołaniem LLM i zapisujemy w obu tabelach
// (CampaignNPC + WorldNPC, jeśli shadow ma worldNpcId). Idempotentne —
// jeśli pole już ma wartość, funkcja jest no-op.
//
// `appearance` (PL): 1 zdanie opisujące fizyczny wygląd. Używane jako
// kanoniczne źródło dla generatora portretów oraz wyświetlane w modalach.
// `dialect` (PL): 1 zdanie opisujące sposób mówienia (gwara, akcent,
// charakterystyczne zwroty). Używane TYLKO przez prompt dialogowy.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';

const log = childLogger({ module: 'npcAppearanceDialect' });

const TIMEOUT_MS = 6000;

const SYSTEM_PROMPT = `Jesteś pomocnikiem do uzupełniania danych NPC w fantasy RPG.
Na podstawie szczątkowego opisu (imię, rasa/stwór, rola, charakter, płeć, wiek)
wygeneruj brakujące pola krótkimi zdaniami po polsku.

Reguły:
- "appearance" (wygląd): JEDNO zdanie po polsku. Cechy fizyczne: budowa, włosy,
  twarz, ubiór, charakterystyczny detal. Konkrety, bez metafor.
- "dialect" (gwara): JEDNO zdanie po polsku. Sposób mówienia — rejestr
  (chłopski/szlachecki/książkowy), akcent regionalny, charakterystyczne zwroty
  lub przekleństwa, rytm wypowiedzi. Spójny z rolą i charakterem.
- Jeśli któreś pole zostało już podane — nie zmieniaj go, zwróć identyczne.
- Jeśli pole "fields" zawiera tylko "appearance" — wypełnij tylko appearance.
  Jeśli tylko "dialect" — tylko dialect. Jeśli oba — oba.

Format odpowiedzi: WYŁĄCZNIE JSON: {"appearance": "...", "dialect": "..."}.
Nie pisz nic poza JSON-em.`;

function buildUserPrompt(npc, fields) {
  const lines = [
    `Imię: ${npc.name || '?'}`,
    `Rasa: ${npc.race || npc.creatureKind || 'człowiek'}`,
    `Rola: ${npc.role || '?'}`,
    `Charakter: ${npc.personality || '?'}`,
    `Płeć: ${npc.gender || '?'}`,
  ];
  if (npc.appearance) lines.push(`Istniejący wygląd: ${npc.appearance}`);
  if (npc.dialect) lines.push(`Istniejąca gwara: ${npc.dialect}`);
  lines.push('');
  lines.push(`Wymagane pola: ${fields.join(', ')}`);
  return lines.join('\n');
}

/**
 * @param {object} npc - rekord WorldNPC lub CampaignNPC z polami {name,race,creatureKind,role,personality,gender,appearance,dialect}
 * @param {Array<'appearance'|'dialect'>} fields - jakie pola wygenerować
 * @param {object} [opts]
 * @param {string} [opts.provider='openai']
 * @param {object|null} [opts.userApiKeys=null]
 * @returns {Promise<{appearance?: string, dialect?: string} | null>}
 */
export async function generateMissingFields(npc, fields, { provider = 'openai', userApiKeys = null } = {}) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  if (!npc?.name) return null;
  try {
    const { text } = await callAIJson({
      provider,
      modelTier: 'standard',
      taskCategory: 'auxiliary',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(npc, fields),
      maxTokens: 200,
      temperature: 0.7,
      userApiKeys,
    });
    const parsed = parseJsonOrNull(text);
    if (!parsed) return null;
    const out = {};
    if (fields.includes('appearance') && typeof parsed.appearance === 'string' && parsed.appearance.trim()) {
      out.appearance = parsed.appearance.trim();
    }
    if (fields.includes('dialect') && typeof parsed.dialect === 'string' && parsed.dialect.trim()) {
      out.dialect = parsed.dialect.trim();
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    log.warn({ err: err?.message, npcId: npc?.id, fields }, 'generateMissingFields failed');
    return null;
  }
}

/**
 * Backfill `appearance` / `dialect` na obu modelach (CampaignNPC + WorldNPC
 * jeśli shadow ma worldNpcId). Zwraca uzupełniony obiekt npc (mutuje pola
 * na kopii). Idempotentne: pomija pola, które już mają wartość.
 */
export async function ensureAppearanceAndDialect(npc, fieldsToFill, { campaignNpcId = null, worldNpcId = null, ...opts } = {}) {
  const missing = (fieldsToFill || []).filter((f) => !npc?.[f]);
  if (missing.length === 0) return npc;

  const generated = await generateMissingFields(npc, missing, opts);
  if (!generated) return npc;

  const persistData = {};
  if (generated.appearance) persistData.appearance = generated.appearance;
  if (generated.dialect) persistData.dialect = generated.dialect;
  if (Object.keys(persistData).length === 0) return npc;

  // Persist do obu modeli równolegle — best-effort
  const writes = [];
  if (campaignNpcId) {
    writes.push(prisma.campaignNPC.update({ where: { id: campaignNpcId }, data: persistData }).catch((err) => {
      log.warn({ err: err?.message, campaignNpcId }, 'CampaignNPC backfill write failed');
    }));
  }
  if (worldNpcId) {
    writes.push(prisma.worldNPC.update({ where: { id: worldNpcId }, data: persistData }).catch((err) => {
      log.warn({ err: err?.message, worldNpcId }, 'WorldNPC backfill write failed');
    }));
  }
  await Promise.all(writes);

  return { ...npc, ...persistData };
}
