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

const log = childLogger({ module: 'questGoalAssigner' });

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
