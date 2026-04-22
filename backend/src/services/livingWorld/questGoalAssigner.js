// Living World Phase 5 — quest-driven NPC goal assignment.
//
// Given a campaign, computes activeGoal + target character for every
// WorldNPC whose CampaignNPC has a quest role (giver or turnIn). Goal
// text is templated by quest role + whether the player is co-located.
// Runs on:
//   - maybePromote (fresh promotion → initial goal)
//   - processQuestStatusChange (completed quest → advance to next giver)
//   - postSceneWork (scene commit → re-evaluate co-location so waiting
//     NPCs flip to seeker when player wanders off)
//
// Non-quest NPCs are left with activeGoal=null and don't tick.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadCampaignGraph } from './travelGraph.js';

const log = childLogger({ module: 'questGoalAssigner' });

// Phase D — role-keyword affinity for quest-types. Lowercase substring match
// on CampaignNPC.role / personality. A role is compatible with a quest type
// when the type's entry lists no keywords (unknown/any) OR any listed keyword
// appears in the NPC's role text. Peasant shouldn't hand out magical research;
// priest shouldn't hand out heists. Rough categorization — scene-gen remains
// free to pick its own NPC if the hint feels wrong narratively.
const ROLE_AFFINITY = {
  combat:       ['strażnik', 'żołnierz', 'kapitan', 'wojownik', 'rycerz', 'łowca', 'myśliwy', 'najemnik', 'warrior', 'soldier', 'guard', 'captain', 'hunter', 'mercenary'],
  magic:        ['mag', 'czarodziej', 'wiedźma', 'alchemik', 'kapłan', 'mnich', 'wizard', 'mage', 'witch', 'priest', 'alchemist'],
  heist:        ['złodziej', 'rozbójnik', 'przemytnik', 'szuler', 'informator', 'thief', 'rogue', 'smuggler', 'fence'],
  delivery:     ['kupiec', 'posłaniec', 'goniec', 'karczmarz', 'merchant', 'messenger', 'innkeeper'],
  investigation:['śledczy', 'strażnik', 'urzędnik', 'szlachcic', 'kapłan', 'detective', 'guard', 'official', 'noble'],
  hunt:         ['myśliwy', 'łowca', 'strażnik', 'wieśniak', 'hunter', 'ranger', 'guard', 'peasant'],
  escort:       ['kupiec', 'szlachcic', 'kapłan', 'dyplomata', 'merchant', 'noble', 'diplomat'],
  main:         [],
  side:         [],
};

function roleMatchesQuestType(role, questType) {
  if (!questType) return true;
  const keys = ROLE_AFFINITY[String(questType).toLowerCase()];
  if (!keys || keys.length === 0) return true;
  const text = String(role || '').toLowerCase();
  if (!text) return true; // unknown role — don't filter out
  return keys.some((kw) => text.includes(kw));
}

// Round A — broad NPC category buckets. Picker + dialog flavor + scene-gen
// hints read this. Five starter values; extend via CATEGORY_KEYWORDS when
// the picker runs out of variety (TODO(category-enum)).
export const NPC_CATEGORIES = ['guard', 'merchant', 'commoner', 'priest', 'adventurer'];

// Role-keyword buckets for backfilling `category` from existing `role`/
// `personality` strings. Order matters — first match wins. We keep the
// terms in sync with ROLE_AFFINITY so the two tables stay coherent (a
// quest-type `combat` quest picks the same NPCs as a `guard`/`adventurer`
// category filter would).
const CATEGORY_KEYWORDS = {
  priest: ['kapłan', 'kapłanka', 'arcykapłan', 'mnich', 'zakonnik', 'priest', 'monk', 'cleric'],
  guard: ['strażnik', 'żołnierz', 'kapitan', 'gwardzist', 'rycerz', 'guard', 'soldier', 'captain', 'knight'],
  merchant: ['kupiec', 'kupcowa', 'handlarz', 'karczmarz', 'karczmarka', 'szuler', 'posłaniec', 'goniec', 'merchant', 'trader', 'innkeeper', 'messenger'],
  adventurer: [
    'mistrz', 'mistrzyni', 'mag', 'czarodziej', 'wiedźma', 'alchemik', 'alchemiczka',
    'łowca', 'łowczyni', 'tropiciel', 'myśliwy', 'myśliwa', 'złodziej', 'rozbójnik',
    'najemnik', 'awanturnik', 'przygodowiec', 'wojownik', 'wróżbitka',
    'adventurer', 'mage', 'wizard', 'witch', 'alchemist', 'hunter', 'ranger',
    'rogue', 'thief', 'mercenary', 'warrior',
  ],
  // `commoner` is the fallback — any NPC without a match above.
};

/**
 * Map a freeform role/personality string to one of NPC_CATEGORIES. Used
 * during seeding, cloning from WorldNPC → CampaignNPC, and post-hoc
 * backfill. Pure, exported for tests.
 *
 * Order matters: priest/guard/merchant are checked before adventurer so
 * "kapłan-wojownik" lands under `priest`, not `adventurer`.
 */
export function categorize(role, { fallback = 'commoner' } = {}) {
  const text = String(role || '').toLowerCase();
  if (!text) return fallback;
  for (const category of ['priest', 'guard', 'merchant', 'adventurer']) {
    const keys = CATEGORY_KEYWORDS[category] || [];
    if (keys.some((kw) => text.includes(kw))) return category;
  }
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (exported for testability)
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide which "role" the NPC plays right now given the campaign's quest
 * state. Roles feed into the goal template.
 *
 * Inputs:
 *   - npcId (CampaignNPC.npcId string slug)
 *   - quests: array of CampaignQuest rows (all statuses)
 *
 * Returns one of:
 *   - { kind: 'giver_active', quest }   — NPC gives an already-active quest
 *   - { kind: 'turnin_active', quest }  — NPC is turn-in for an active quest
 *   - { kind: 'giver_next', quest }     — prerequisites done, quest not yet active
 *   - { kind: 'done' }                  — all their quests are completed
 *   - null                              — no quest role
 */
export function classifyQuestRole(npcId, quests) {
  if (!npcId || !Array.isArray(quests)) return null;
  // questGiverId/turnInNpcId are stored as raw AI-emitted names ("Bjorn Myśliwy")
  // while CampaignNPC.npcId is a slug ("bjorn_myśliwy"). Normalize both sides
  // so equality matches regardless of which side is in slug form already.
  const target = slugify(npcId);
  const active = quests.filter((q) => q.status === 'active' || q.status === 'in_progress');
  const completed = new Set(quests.filter((q) => q.status === 'completed').map((q) => q.questId));

  // 1. Active quest — NPC is giver OR turn-in
  const activeGiver = active.find((q) => slugify(q.questGiverId) === target);
  if (activeGiver) return { kind: 'giver_active', quest: activeGiver };
  const activeTurnIn = active.find((q) => slugify(q.turnInNpcId) === target && slugify(q.questGiverId) !== target);
  if (activeTurnIn) return { kind: 'turnin_active', quest: activeTurnIn };

  // 2. Next-available quest — prerequisites all completed, quest not yet active/completed
  const pending = quests.filter((q) => {
    if (q.status === 'active' || q.status === 'in_progress' || q.status === 'completed') return false;
    if (slugify(q.questGiverId) !== target) return false;
    const prereqs = parsePrereqs(q.prerequisiteQuestIds);
    return prereqs.every((id) => completed.has(id));
  });
  if (pending.length > 0) {
    // Prefer the one with the most prerequisites (latest in chain)
    pending.sort((a, b) => parsePrereqs(b.prerequisiteQuestIds).length - parsePrereqs(a.prerequisiteQuestIds).length);
    return { kind: 'giver_next', quest: pending[0] };
  }

  // 3. "Done" — there is at least one COMPLETED quest this NPC gave, and no
  // active/pending role remains. If an NPC has a future quest locked behind
  // unfinished prerequisites, we stay null (they've got nothing to do right
  // now) — avoids prematurely triggering return-home on NPCs still waiting
  // in the chain.
  const everCompletedGiver = quests.some((q) => slugify(q.questGiverId) === target && q.status === 'completed');
  if (everCompletedGiver) return { kind: 'done' };
  return null;
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_');
}

function parsePrereqs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build the goal string given role + player co-location + character name.
 * Returns null when role is null/done (no goal).
 */
export function buildGoalString(role, { characterName = null, coLocated = false } = {}) {
  if (!role || role.kind === 'done') return null;
  const who = characterName ? characterName : 'gracza';

  if (role.kind === 'giver_active') {
    return `Czekam w swojej lokacji aż ${who} wróci z postępami w zadaniu "${role.quest.name}".`;
  }
  if (role.kind === 'turnin_active') {
    return `Czekam aż ${who} dostarczy rozwiązanie zadania "${role.quest.name}".`;
  }
  if (role.kind === 'giver_next') {
    if (coLocated) {
      return `Mam nowe zlecenie dla ${who}: "${role.quest.name}". Poczekam aż zapyta.`;
    }
    return `Muszę odnaleźć ${who} i przekazać nowe zlecenie: "${role.quest.name}".`;
  }
  return null;
}

/**
 * Background goal pool — generates deterministic sideways agendas for
 * NPCs that have no active quest role AND are already at home. Lets
 * globally-living NPCs "do things" without a dedicated nano call per
 * scene. The text feeds back into nano tick normally; the pool is just
 * a priming source so the NPC isn't idle.
 *
 * Entries may be tagged with `offerable` + `template` — those goals
 * can be offered to the PC as a radiant quest when the player walks
 * into the NPC's lokacja (G3 from the plan, inspired by Skyrim/Oblivion
 * radiant markers). Premium AI decides IF and HOW to offer; the pool
 * just surfaces the hook and a template key the scene-gen layer uses
 * to shape the quest object.
 *
 * Role keywords (matched as substrings) map to thematically plausible
 * tasks. Unknown roles fall back to a neutral pool.
 *
 * Pure — exported for tests.
 */
const goal = (text, offerable = false, template = null) => ({ text, offerable, template });

const BACKGROUND_POOL = {
  karczmarz: [
    goal('Obsłużę dzisiejszych gości w karczmie.'),
    goal('Policzę kasę i sprawdzę zapasy piwa.'),
    goal('Mam dość bandytów nękających podróżnych na drodze — szukam kogoś, kto by ich rozgonił.', true, 'bounty_bandits'),
  ],
  kowal: [
    goal('Wykuję dzisiaj nowe podkowy i naostrzę ostrza.'),
    goal('Sprawdzę zapasy węgla i żelaza.'),
    goal('Zgubiłem w lesie cenne narzędzie — chętnie zapłacę komuś za odnalezienie.', true, 'find_missing_item'),
  ],
  strażnik: [
    goal('Obchodzę patrol wokół swojej lokacji.'),
    goal('Sprawdzam czy nikt obcy nie kręci się pod murami.'),
    goal('Kapitan zlecił list do sąsiedniego garnizonu — potrzeba posłańca.', true, 'deliver_message'),
  ],
  żołnierz: [
    goal('Trenuję z bronią.'),
    goal('Sprawdzam warty i umacniam pozycje.'),
    goal('Patroluję okolicę.'),
  ],
  wieśniak: [
    goal('Pracuję w polu/przy stadzie.'),
    goal('Naprawiam coś w gospodarstwie.'),
    goal('Wilki porwały mi jedną sztukę bydła — trzeba by je odstraszyć.', true, 'bounty_beasts'),
  ],
  kupiec: [
    goal('Sprawdzam stan towarów i liczę zyski.'),
    goal('Negocjuję ceny z lokalnymi dostawcami.'),
    goal('Czekam na dostawę, która się opóźnia — bałbym się, że coś spotkało karawanę.', true, 'find_caravan'),
  ],
  mag: [
    goal('Studiuję stare zwoje.'),
    goal('Praktykuję drobne zaklęcia.'),
    goal('Potrzebuję rzadkiego składnika z jaskini za miastem — nie mam czasu iść sam.', true, 'fetch_ingredient'),
  ],
  kapłan: [
    goal('Odmawiam modlitwy przy ołtarzu.'),
    goal('Wysłuchuję spowiedzi wiernych.'),
    goal('Relikwia została skradziona — błagam o pomoc w jej odnalezieniu.', true, 'recover_relic'),
  ],
  rozbójnik: [
    goal('Siedzę z kompanami przy ognisku.'),
    goal('Planuję następną zasadzkę.'),
    goal('Ostrzę broń i sprawdzam strzały.'),
  ],
  szlachcic: [
    goal('Prowadzę dzień dworski.'),
    goal('Przyjmuję petentów lub prowadzę audiencję.'),
    goal('Ktoś szantażuje mnie listami — dyskretnie potrzebuję pomocy, by znaleźć autora.', true, 'investigate_blackmail'),
  ],
};
const BACKGROUND_DEFAULT = [
  goal('Zajmuję się codziennymi sprawami w swojej lokacji.'),
  goal('Kręcę się po okolicy, robiąc drobne prace.'),
  goal('Spoczywam chwilę i obserwuję życie dookoła.'),
];

export function generateBackgroundGoal(npc, { seed = Date.now() } = {}) {
  if (!npc) return null;
  const role = String(npc.role || npc.personality || '').toLowerCase();
  let pool = BACKGROUND_DEFAULT;
  for (const key of Object.keys(BACKGROUND_POOL)) {
    if (role.includes(key)) {
      pool = BACKGROUND_POOL[key];
      break;
    }
  }
  // Stable pick within a scene — seed defaults to now but caller can pass
  // the sceneGameTime for determinism within tests.
  const idx = Math.abs(Math.floor(seed / 1000)) % pool.length;
  return pool[idx];
}

// ──────────────────────────────────────────────────────────────────────
// DB-touching
// ──────────────────────────────────────────────────────────────────────

/**
 * Assign / refresh goals for all quest-involved NPCs of a campaign.
 * Idempotent — safe to call repeatedly. Only updates WorldNPCs that
 * exist (i.e. already promoted via maybePromote).
 *
 * @param {string} campaignId
 * @param {number} [currentSceneIndex] — if provided, `lastTickSceneIndex`
 *   is reset when a goal text actually changes, so the 2-scene countdown
 *   for next tick restarts from the goal's introduction.
 * @returns {{assigned: number, cleared: number, unchanged: number}}
 */
export async function assignGoalsForCampaign(campaignId, { currentSceneIndex = null } = {}) {
  if (!campaignId) return { assigned: 0, cleared: 0, unchanged: 0 };

  try {
    const [campaign, quests, campaignNpcs] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, characterIds: true, coreState: true },
      }),
      prisma.campaignQuest.findMany({ where: { campaignId } }),
      prisma.campaignNPC.findMany({
        where: { campaignId, worldNpcId: { not: null } },
        select: { id: true, npcId: true, name: true, lastLocation: true, worldNpcId: true },
      }),
    ]);
    if (!campaign) return { assigned: 0, cleared: 0, unchanged: 0 };

    const actorCharacterId = Array.isArray(campaign.characterIds) ? campaign.characterIds[0] : null;
    const characterName = actorCharacterId
      ? await resolveCharacterName(actorCharacterId)
      : null;
    const playerLocation = (() => {
      try {
        const core = JSON.parse(campaign.coreState || '{}');
        return core?.world?.currentLocation || null;
      } catch { return null; }
    })();
    const playerLocNorm = String(playerLocation || '').toLowerCase().trim();

    let assigned = 0;
    let cleared = 0;
    let unchanged = 0;

    for (const cn of campaignNpcs) {
      const role = classifyQuestRole(cn.npcId, quests);
      const coLocated = playerLocNorm && String(cn.lastLocation || '').toLowerCase().trim() === playerLocNorm;

      // Read current WorldNPC state (needed for home-location check + change detection)
      const current = await prisma.worldNPC.findUnique({
        where: { id: cn.worldNpcId },
        select: {
          activeGoal: true,
          goalTargetCampaignId: true,
          goalTargetCharacterId: true,
          currentLocationId: true,
          homeLocationId: true,
        },
      });
      if (!current) continue;

      // Quest role first. If done/null AND NPC is not at home, override with
      // a return-home goal so they trek back instead of stranding.
      // If they're already home, fall through to a background (sideways)
      // goal so the NPC has something to do between quest assignments
      // instead of sitting with activeGoal=null (which disables ticks).
      let nextGoal = buildGoalString(role, { characterName, coLocated });
      if (!nextGoal && current.homeLocationId && current.currentLocationId !== current.homeLocationId) {
        const homeName = await resolveLocationName(current.homeLocationId);
        if (homeName) {
          nextGoal = `Wracam do swojego miejsca: ${homeName}.`;
        }
      }
      let backgroundMeta = null;
      if (!nextGoal) {
        // Background goal — fetch role for pool matching
        const npcMeta = await prisma.campaignNPC.findUnique({
          where: { id: cn.id },
          select: { role: true, personality: true },
        }).catch(() => null);
        backgroundMeta = generateBackgroundGoal(npcMeta, { seed: Date.now() });
        nextGoal = backgroundMeta?.text || null;
      }

      if (current.activeGoal === nextGoal
        && current.goalTargetCampaignId === (nextGoal ? campaign.id : null)
        && current.goalTargetCharacterId === (nextGoal ? actorCharacterId : null)) {
        unchanged += 1;
        continue;
      }

      const updateData = {
        activeGoal: nextGoal,
        goalTargetCharacterId: nextGoal ? actorCharacterId : null,
        goalTargetCampaignId: nextGoal ? campaign.id : null,
      };
      // Radiant quest flag (G3): when the background goal is offerable,
      // embed metadata in goalProgress so aiContextTools can surface the
      // hook and premium can emit newQuests with source='npc_radiant'.
      if (backgroundMeta?.offerable && backgroundMeta.template) {
        updateData.goalProgress = JSON.stringify({
          offerableAsQuest: true,
          questTemplate: backgroundMeta.template,
          source: 'background',
          updatedAt: new Date().toISOString(),
        });
      }
      // When a goal is freshly assigned or its text changes, reset the
      // tick countdown so the 2-scene wait starts from now.
      if (typeof currentSceneIndex === 'number' && nextGoal && nextGoal !== current.activeGoal) {
        updateData.lastTickSceneIndex = currentSceneIndex;
      }
      await prisma.worldNPC.update({
        where: { id: cn.worldNpcId },
        data: updateData,
      });

      if (nextGoal) assigned += 1;
      else cleared += 1;
    }

    log.info({ campaignId, assigned, cleared, unchanged, currentSceneIndex }, 'Quest goal assigner done');
    return { assigned, cleared, unchanged };
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'assignGoalsForCampaign failed');
    return { assigned: 0, cleared: 0, unchanged: 0 };
  }
}

async function resolveCharacterName(characterId) {
  try {
    const char = await prisma.character.findUnique({
      where: { id: characterId },
      select: { name: true },
    });
    return char?.name || null;
  } catch {
    return null;
  }
}

async function resolveLocationName(locationId) {
  if (!locationId) return null;
  try {
    const loc = await prisma.worldLocation.findUnique({
      where: { id: locationId },
      select: { canonicalName: true },
    });
    return loc?.canonicalName || null;
  } catch {
    return null;
  }
}

/**
 * Phase D — pick a weighted-hybrid quest-giver from the current roster so
 * premium doesn't free-hand new NPCs on every offer. Called pre-premium when
 * the classifier flags `questOfferLikely` AND Phase C saturation is tight.
 *
 * Weighting (after filtering by alive + keyNpc + role-affinity):
 *   60% local   — NPC at currentLocation OR at an edge-adjacent location
 *   30% lightly — NPC with < 2 quests assigned (giver or turn-in)
 *   10% wildcard — any eligible NPC
 *
 * Returns `{ name, role, location }` or null if no eligible NPC (premium
 * falls back to free-hand invention).
 */
export async function pickQuestGiver(campaignId, currentLocationName, { questType = null } = {}) {
  if (!campaignId) return null;

  const [npcs, quests] = await Promise.all([
    prisma.campaignNPC.findMany({
      where: { campaignId },
      select: {
        id: true, name: true, role: true, personality: true, alive: true,
        lastLocation: true, worldNpcId: true,
      },
    }),
    prisma.campaignQuest.findMany({
      where: { campaignId },
      select: { questId: true, questGiverId: true, turnInNpcId: true, status: true },
    }),
  ]).catch(() => [[], []]);

  if (!npcs.length) return null;

  // Count outstanding quests per NPC (slug-normalized).
  const questCountByGiver = new Map();
  for (const q of quests) {
    if (q.status === 'completed' || q.status === 'failed') continue;
    const giver = slugify(q.questGiverId);
    const turnIn = slugify(q.turnInNpcId);
    if (giver) questCountByGiver.set(giver, (questCountByGiver.get(giver) || 0) + 1);
    if (turnIn && turnIn !== giver) {
      questCountByGiver.set(turnIn, (questCountByGiver.get(turnIn) || 0) + 1);
    }
  }

  // Base filter: alive + role-affinity. Key-NPC filter + story-critical skip
  // via worldNpc lookup (single IN-query covering every candidate at once).
  const liveNpcs = npcs.filter((n) => n.alive !== false);
  const worldNpcIds = liveNpcs.map((n) => n.worldNpcId).filter(Boolean);
  const worldMap = new Map();
  if (worldNpcIds.length > 0) {
    try {
      const rows = await prisma.worldNPC.findMany({
        where: { id: { in: worldNpcIds } },
        select: { id: true, keyNpc: true, currentLocationId: true, activeGoal: true },
      });
      for (const r of rows) worldMap.set(r.id, r);
    } catch {
      // Non-fatal — fall through with empty map (keyNpc filter degrades to "all alive").
    }
  }
  const STORY_FLAGS = /story[-_]critical|lock(?:ed)?[-_]campaign|main[-_]only/i;
  const eligible = liveNpcs.filter((n) => {
    if (!n.name) return false;
    if (!roleMatchesQuestType(n.role || n.personality, questType)) return false;
    const wn = n.worldNpcId ? worldMap.get(n.worldNpcId) : null;
    if (wn && wn.keyNpc === false) return false;
    if (wn?.activeGoal && STORY_FLAGS.test(wn.activeGoal)) return false;
    return true;
  });
  if (!eligible.length) return null;

  // Build "local" set — same location as the player, OR any edge-adjacent
  // location. Edge-adjacent is loaded from the campaign's travel graph.
  const currentLocNorm = String(currentLocationName || '').toLowerCase().trim();
  let localLocationIds = new Set();
  try {
    if (currentLocationName) {
      const currentLoc = await prisma.worldLocation.findFirst({
        where: { canonicalName: currentLocationName },
        select: { id: true },
      });
      if (currentLoc?.id) {
        localLocationIds.add(currentLoc.id);
        const adj = await loadCampaignGraph(campaignId);
        const neighbors = adj.get(currentLoc.id) || [];
        for (const n of neighbors) {
          if (n.toId) localLocationIds.add(n.toId);
        }
      }
    }
  } catch {
    localLocationIds = new Set();
  }

  const isLocal = (n) => {
    if (currentLocNorm && String(n.lastLocation || '').toLowerCase().trim() === currentLocNorm) return true;
    const wn = n.worldNpcId ? worldMap.get(n.worldNpcId) : null;
    if (wn?.currentLocationId && localLocationIds.has(wn.currentLocationId)) return true;
    return false;
  };

  const localPool = eligible.filter(isLocal);
  const lightlyAssigned = eligible.filter((n) => {
    const slug = slugify(n.name);
    return (questCountByGiver.get(slug) || 0) < 2;
  });
  const wildcardPool = eligible;

  // Weighted roll. When a bucket is empty, its weight redistributes to the
  // next non-empty bucket so we don't return null just because nobody is
  // locally eligible.
  const buckets = [
    { pool: localPool, weight: 60 },
    { pool: lightlyAssigned, weight: 30 },
    { pool: wildcardPool, weight: 10 },
  ].filter((b) => b.pool.length > 0);
  if (!buckets.length) return null;

  const totalWeight = buckets.reduce((a, b) => a + b.weight, 0);
  let roll = Math.random() * totalWeight;
  let picked = buckets[buckets.length - 1].pool;
  for (const b of buckets) {
    roll -= b.weight;
    if (roll <= 0) { picked = b.pool; break; }
  }
  const chosen = picked[Math.floor(Math.random() * picked.length)];
  const wn = chosen.worldNpcId ? worldMap.get(chosen.worldNpcId) : null;
  let locationName = chosen.lastLocation || null;
  if (!locationName && wn?.currentLocationId) {
    locationName = await resolveLocationName(wn.currentLocationId);
  }
  return {
    name: chosen.name,
    role: chosen.role || chosen.personality || null,
    location: locationName,
  };
}
