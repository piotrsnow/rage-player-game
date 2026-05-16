/**
 * Intent-driven conditional rules appended to the dynamic section.
 *
 * Only injected when the scene actually needs them — so combat scenes don't
 * pay for lore-drip rules, and low-tier campaigns don't see the bestiary
 * guardrails more than once.
 */

import { BESTIARY_RACES } from '../../../data/equipment/index.js';
import {
  itemCombinationBlock,
  questGraphExtendedRules,
  questMutationsExtendedRules,
  dungeonExtendedRules,
  characterEffectsExtendedRules,
} from './staticRules.js';

const BESTIARY_RACES_STR = BESTIARY_RACES.join(', ');
const COMBAT_INTENTS = new Set(['combat', 'stealth', 'freeform', 'idle', 'first_scene']);
const LORE_INTENTS = new Set(['talk', 'search', 'persuade', 'freeform', 'first_scene']);
const MAGICAL_LOC_RE = /jaskini|dungeon|ruin|wież|tower|crypt|temple|świątyni|portal|magiczn|arcane|nekromant|podziemn/;

// Location types where AI MAY emit a new sublocation entry. Settlements +
// canonical sublocations of settlements (interior/dungeon as parents are
// allowed because canonical sublocs can host their own children, e.g. Wieża
// Maga → Pracownia). Wilderness/forest/cave/etc. drop out — those are bare
// terrain, not sublocation hosts.
const SUBLOCATION_HOST_TYPES = new Set([
  'capital', 'city', 'town', 'village', 'hamlet', 'interior', 'dungeon',
]);

const ITEM_COMBINATION_RE = /\[ŁĄCZENIE PRZEDMIOTÓW|łącz[ęe]|kombinuj|owijam.{1,20}wokół|wsadzam.{1,20}w\s|składam.{1,20}połów|wbijam.{1,20}w\s/i;

export function buildConditionalRules({ intent, coreState, scenePhase = null, livingWorldEnabled = false, questGraphEnabled = false, magicExposure = null, playerAction = '' }) {
  const rules = [];
  const cs = coreState;
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};

  // Campaign-phase micro-hint — signal dla modelu by pacować fabułę bez
  // explicit mikrozarządzania. Emit tylko dla 'late' (early/mid nie wymagają
  // specjalnej instrukcji poza tym co już w promcie).
  if (scenePhase === 'late') {
    rules.push(
      `CAMPAIGN PHASE: late. Tighten main story, resolve loose ends. Avoid introducing major new hooks. Complications can escalate.`,
    );
  }

  if (COMBAT_INTENTS.has(intent)) {
    rules.push(
      `COMBAT stateChanges:\n` +
      `- combatUpdate: {active:true, enemyHints:{location,budget,maxDifficulty,count,race}, reason}. ` +
      `budget: 1-2 trivial, 3-7 medium, 8-12 hard, 13-20 deadly. race: optional (${BESTIARY_RACES_STR}). ` +
      `Fallback: {active:true, enemies:[{name}], reason}.\n` +
      `- pendingThreat: {race,budget,maxDifficulty,count,description} for tension without combat.\n` +
      `- woundsChange: delta (negative=damage, positive=healing).\n` +
      `DAMAGE TYPES: fizyczne, ogień, lód, błyskawica, magiczne, trucizna, psychiczne. ` +
      `Narrate damage matching its type: fire spells → burning/charring, ice → frost/freezing, lightning → crackling/shocking. ` +
      `Enemies may be resistant (reduced dmg) or vulnerable (extra dmg) to specific types — mention in narration when relevant. ` +
      `Undead are immune to poison/psychic, vulnerable to fire. Demons resist fire, vulnerable to ice/lightning. Trolls vulnerable to fire.`,
    );
  }

  if (LORE_INTENTS.has(intent)) {
    rules.push(
      `CODEX RULES:\n` +
      `- Each NPC reveals ONE fragment per interaction. Drip-feed, never dump.\n` +
      `- Aspect by NPC role: scholars→history/technical, peasants→rumor, soldiers→location/weakness, merchants→description, nobles→political.\n` +
      `- DO NOT repeat already-discovered aspects — reveal NEW only. Max 10 fragments/entry.`,
    );
  }

  const loc = (world.currentLocation || '').toLowerCase();
  if (MAGICAL_LOC_RE.test(loc)) {
    rules.push(
      `MANA CRYSTALS: rare consumable → +1 max mana OR +1 attribute (cap 25). ` +
      `newItems type:"manaCrystal". Drop rarely (~1/20 rare loot) in magical/dungeon contexts only. ` +
      `Attributes grow ONLY via crystals.`,
    );
  }

  if (intent === 'talk' || intent === 'first_scene') {
    rules.push(
      `canTrain: in npcs stateChange, 1-3 skill names NPC can teach. ` +
      `Only experienced, friendly NPCs. Not merchants/peasants/hostile.`,
    );
  }

  const mana = character.mana || { current: 0, max: 0 };
  if (mana.max > 0) {
    rules.push(
      `MANA RULES:\n` +
      `- Spell cost: emit manaChange with NEGATIVE delta (−1 cantrip, −2 basic, −3 advanced, −5 powerful).\n` +
      `- If mana.current (${mana.current}) < spell cost, narrate failure — insufficient mana. Do NOT emit the spell effect.\n` +
      `- Mana restore: rest/meditation/potion → manaChange POSITIVE. Short rest +2-3, full rest = full pool, mana potion +3-5.\n` +
      `- spellUsage: {"SpellName": 1} for every spell cast — tracks progression.`,
    );
  }

  // Location-policy slots — added ONLY when the player is somewhere a slot
  // makes sense. Settlement / canonical-subloc → sublocation creation. Inside
  // a dungeon_room → currentLocation reassignment to the next room. Anywhere
  // else (wilderness, raw terrain, null) → neither slot is offered, so AI
  // can't even try to emit them. Keeps the prompt lean and stops drift.
  const currentLocType = world.currentLocationType || null;
  if (currentLocType && SUBLOCATION_HOST_TYPES.has(currentLocType)) {
    const currentLocName = world.currentLocation || '<current settlement>';
    rules.push(
      `LOCATION POLICY (sublocation-allowed): the player is inside "${currentLocName}". ` +
      `If they walk INTO a new tavern/forge/wing/chamber that doesn't already exist, you MAY add ONE entry to stateChanges.newLocations:\n` +
      `  "newLocations": [{"name":"<≥2 words>", "parentLocationName":"${currentLocName}", "locationType":"interior", "slotType":"<slotType or null>", "description":"<optional>"}]\n` +
      `- parentLocationName MUST be a real canonical name from above (current settlement OR a canonical sublocation in its walk-up chain). Fictional parents → silent reject.\n` +
      `- Emit ONE entry when the player actually walks IN — engine auto-promotes that single new sublocation to currentLocation. Multiple emitted entries do NOT auto-promote.\n` +
      `- Mentioning a building without entering it ≠ a newLocations entry. Just narrate.`,
    );
  } else if (currentLocType === 'dungeon_room') {
    rules.push(
      `LOCATION POLICY (dungeon-nav): the player is inside a dungeon room. When they walk through a labeled exit, set:\n` +
      `  "currentLocation": "<exact canonical name from the room's Exits list>"\n` +
      `Engine validates the target IS another dungeon_room — anything else is ignored. DO NOT use this field for anything else.`,
    );
  }
  // else: no slot offered. Currentlocation + newLocations are BE-controlled.

  const mainQuest = (quests.active || []).find((q) => q.type === 'main');
  const allMainDone = mainQuest?.objectives?.length > 0 && mainQuest.objectives.every((o) => o.completed);
  if (allMainDone) {
    rules.push(
      `MAIN QUEST COMPLETED. Focus on: character growth, loose ends, exploration, epilogue beats. ` +
      `No major plot progression. The world reacts to the hero's success.`,
    );
  }

  // HIGH-STAKES stateChanges — tier-gated. Te pola są relevant tylko dla
  // hard/deadly campaigns (low/medium nie ma deadly encounterów ani narracyjnych
  // triggerów dla globalnego wpływu na świat).
  const tier = campaign.difficultyTier || 'low';
  if (tier === 'hard' || tier === 'deadly') {
    rules.push(
      `HIGH-STAKES STATE CHANGES (tier='${tier}'):\n` +
      `- campaignComplete: {title ≤120, summary ≤800, majorAchievements (1-3 strings)} — ONLY when player RESOLVED main conflict THIS scene (final antagonist defeated, central threat ended). Emits a GLOBAL WorldEvent. DO NOT fire for minor victories.\n` +
      `- defeatedDeadlyEncounter: true when player just defeated a deadly-tier encounter.\n` +
      `- worldImpact: 'major' + worldImpactReason (≤300 chars) — ONLY named antagonist killed, settlement liberated (also locationLiberated:true), mythical creature slain, political coup. Most victories stay 'minor'/null.`,
    );
  }

  // Campaign-level difficulty cap — prevents premium from throwing a smok/lich
  // at a low-tier campaign. Works in tandem with bestiary clamping on BE.
  const difficultyTier = campaign.difficultyTier || 'low';
  if (difficultyTier && difficultyTier !== 'deadly') {
    const allowedExamples = difficultyTier === 'low'
      ? 'bandyci, wilki, zbóje, drobne potwory leśne'
      : difficultyTier === 'medium'
        ? 'bandyci (większe grupy), trolle, dzikie bestie, niewielcy nieumarli'
        : 'elitarni wrogowie, niebezpieczne potwory, sekty magów, regionalni bossowie';
    rules.push(
      `ENCOUNTER TIER: Ta kampania ma trudność '${difficultyTier}'. Gracz jest na poziomie ${character.characterLevel || 1}. ` +
      `Wrogowie/zagrożenia w scenach NIE mogą przekraczać tego pułapu — dozwolone przykłady: ${allowedExamples}. ` +
      `Smoki, demony wyższych kręgów, archmagowie, lichowie, pradawne byty są DOZWOLONE TYLKO dla tier 'deadly'. ` +
      `Jeśli narracja wymaga silniejszego wroga — użyj scripted escape (ucieczka, sojusznik interweniuje, ambush fails) zamiast walki.\n` +
      `LOOT GOLD: typowy scene-loot skalowany trudnością — low ~1-5 MK, medium ~2-15 MK, hard ~3-20 MK, deadly ~5-30 MK per scena. ` +
      `ZAWSZE używaj rewards[{type:"money", context:"loot"|"found"|"gift"}] — NIGDY surowego moneyChange dla lootu. ` +
      `Nagrody za ukończenie questa są aplikowane automatycznie przy completedQuests z quest.reward — nie duplikuj ich w rewards[].`,
    );
  }

  // Oblivion-style minimal renown acknowledgment. Character stays "grey" until
  // crossing fame/infamy 20. Once crossed, NPCs may comment ONCE per NPC (flag
  // on CampaignNPC.hasAcknowledgedFame). Tone approve/disapprove comes from
  // the label bucket.
  const fame = Number(character.fame) || 0;
  const infamy = Number(character.infamy) || 0;
  if (fame >= 20 || infamy >= 20) {
    const label = infamy >= 50 ? 'poszukiwany łotr'
      : infamy >= 20 ? 'podejrzany'
        : fame >= 100 ? 'legendarny'
          : fame >= 50 ? 'sławny'
            : 'znany w okolicy';
    const tone = infamy >= 20 ? 'disapprove' : 'approve';
    rules.push(
      `RENOWN: Gracz jest znany jako "${label}" w świecie. NPC spotkani po raz pierwszy w kampanii (CampaignNPC.hasAcknowledgedFame=false) MOGĄ to skomentować JEDNYM zdaniem zgodnym z ich osobowością. ` +
      (tone === 'approve'
        ? 'Pozytywne reakcje: „Słyszałem że powstrzymałeś bandytów — dobry człowiek się trafił!", „Widziałem cię w balladach.". '
        : 'Negatywne reakcje: „Słyszałem o twoich wybrykach — trzymaj się z daleka.", „Nie pokazuj się publicznie, szukają cię.". ') +
      `NIE powtarzaj tego co inni NPC już powiedzieli — każdy komentarz inny. Ogranicz do JEDNEGO zdania. ` +
      `W npcs[] entry dla TEGO NPC-a który się wypowiedział ustaw acknowledgedFame:true (nie na innych). To blokuje powtórzenie tej linii w kolejnych scenach.`,
    );
  }

  // ── Location graph rules — spatial consistency & graphUpdate protocol ──
  // Only fires when livingWorld is on. Core rules prevent teleportation,
  // hidden-info leaks, and teach the model to emit graphUpdates.
  if (livingWorldEnabled) {
    rules.push(
      `GRAPH RULES:\n` +
      `1. NO TELEPORTING — every movement requires a known path in [LOCATION GRAPH]. ` +
      `Exceptions: magic (portal/teleport with mana cost), dream, vision, flashback.\n` +
      `2. DO NOT REVEAL hidden/secret locations or edges from the GM-ONLY section. ` +
      `Reveal ONLY when the player actively searches (Perception check, examine, search) and succeeds.\n` +
      `3. "visible_from" ≠ "I am there". Seeing a location from a distance does NOT place the character there. ` +
      `Distance, obstacles, and travel time still apply.\n` +
      `4. "heard_about" ≠ "I know the way". Knowing a location exists requires a discovered edge OR NPC directions OR a map to travel there.\n` +
      `5. RESPECT requirements on edges — locked doors, skill checks, faction standing, keys. ` +
      `If [NOT MET] in the graph, narrate the obstacle; do not let the player pass freely.`,
    );

    rules.push(
      `GRAPH UPDATE PROTOCOL:\n` +
      `After each scene, if ANYTHING changed spatially, emit stateChanges.graphUpdates[]:\n` +
      `- Player discovers a path/door → { action:"discover_edge", fromLocation:"X", toLocation:"Y" }\n` +
      `- NPC mentions a distant place → { action:"discover_location", locationName:"X", discoveryState:"rumored"|"heard_about" }\n` +
      `- Player sees something from afar → { action:"add_perception", fromLocation:"current", toLocation:"target", relationType:"visible_from" }\n` +
      `- Door unlocked / bridge repaired → { action:"update_edge", fromLocation:"X", toLocation:"Y", metadata:{...} }\n` +
      `- Bridge collapsed / tunnel caved in → { action:"remove_edge", fromLocation:"X", toLocation:"Y" }\n` +
      `- New passage described in narration → { action:"create_edge", fromLocation:"X", toLocation:"Y", relationType:"path"|"door"|"stairs"|... }\n` +
      `Do NOT emit graphUpdates for: purely decorative details, movement on already-known edges, info already in the graph.`,
    );
  }

  if (magicExposure?.eligible) {
    const spellList = (magicExposure.availableSpells || []).join(', ');
    const spellOption = spellList
      ? `\n- learnSpell: one of [${spellList}] — character learns a starting spell. Pick one that fits the narrative.`
      : '';
    rules.push(
      `MAGIC BREAKTHROUGH: Character has been interacting with magic beyond their abilities and had a breakthrough moment. ` +
      `You MAY grant ONE magical reward this scene:` +
      spellOption +
      `\n- manaMaxChange: 2-4 — character's max mana pool increases.` +
      `\nChoose whichever fits the narrative. Narrate organically — a sudden insight, dormant power awakening, a surge of energy. ` +
      `Do NOT grant both in the same scene. This is a rare event — weave it into the story naturally.`,
    );
  }

  if (playerAction && ITEM_COMBINATION_RE.test(playerAction)) {
    rules.push(itemCombinationBlock());
  }

  // ── Extended stateChanges rules (moved from static prefix) ──
  // Quest graph fields — only when quest graph is active
  if (questGraphEnabled) {
    rules.push(questGraphExtendedRules());
  }

  // Quest mutations / questOffers full schema — only for living world campaigns
  if (livingWorldEnabled) {
    rules.push(questMutationsExtendedRules());
  }

  // Dungeon fields — only when player is in a dungeon
  if (cs.dungeonRoom || (world.currentLocationType || '') === 'dungeon_room') {
    rules.push(dungeonExtendedRules());
  }

  // Character effects full schema — only when character has mana, active effects, or combat intent
  const charMana = character.mana || { current: 0, max: 0 };
  const hasEffectRelevance = charMana.max > 0
    || (Array.isArray(character.activeEffects) && character.activeEffects.length > 0)
    || COMBAT_INTENTS.has(intent);
  if (hasEffectRelevance) {
    rules.push(characterEffectsExtendedRules());
  }

  return rules;
}
