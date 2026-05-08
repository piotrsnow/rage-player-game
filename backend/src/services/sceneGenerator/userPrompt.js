import { BESTIARY_RACES, BESTIARY_LOCATIONS } from '../../data/equipment/index.js';
import { detectCombatIntent } from '../../../../shared/domain/combatIntent.js';

const BESTIARY_RACES_STR = BESTIARY_RACES.join(', ');
const BESTIARY_LOCATIONS_STR = BESTIARY_LOCATIONS.join(', ');

function buildPreRollInstructions() {
  return `Resolve per CORE RULES. Thresholds: easy=20, medium=35, hard=50, veryHard=65, extreme=80. Lucky success → auto-success. Include in TOP-LEVEL diceRolls [{skill, difficulty, success}].`;
}

export function buildUserPrompt(playerAction, {
  resolvedMechanics = null,
  isFirstScene = false,
  needsSystemEnabled = false,
  characterNeeds = null,
  language = 'pl',
  preRolls = null,
  sceneCount = 0,
  creativityEligible = false,
  forceRoll = null,
  pendingSlip = null,
} = {}) {
  if (isFirstScene) {
    return `Generate the opening scene. Set the stage with an atmospheric description. Introduce the setting, hint at adventure hooks, and include at least one NPC who speaks in direct dialogue. This is scene 1 — keep it concise (1-2 short paragraphs).
Include stateChanges: timeAdvance, currentLocation, npcs (introduce at least 1), journalEntries.`;
  }

  const parts = [];

  // Creativity bonus eligibility — backend wymusza creativityBonus=0 dla
  // not-eligible akcji niezależnie od tego co model zwróci, ale informujemy
  // też model żeby nie marnował tokenów na bonus który zostanie wyzerowany.
  parts.push(creativityEligible
    ? 'player_input_kind=custom — gracz wpisał WŁASNĄ akcję. Oceń kreatywność i zwróć creativityBonus 0-10 zgodnie z regułami w CORE RULES.'
    : 'player_input_kind=suggested_or_auto — gracz NIE wpisał własnej akcji (clicked suggested / autoplayer / akcja systemowa). creativityBonus MUSI być 0.');

  // Incident system — humorous penalty for unfounded complaint
  if (pendingSlip) {
    parts.push(`MANDATORY NARRATIVE EVENT: The character slips, stumbles, or trips on something in this scene. Weave it naturally into the narrative as a minor comedic moment — e.g. steps on a slippery fish, trips over a loose cobblestone, stumbles on a tree root. This is NOT a combat event, no damage, just a brief humorous moment. Reason (internal, do not reveal to player): ${pendingSlip}`);
  }

  // Needs crisis reminder
  if (needsSystemEnabled && characterNeeds) {
    const critNeeds = ['hunger','thirst','bladder','hygiene','rest'].filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      parts.push(`⚠ NEEDS CRISIS: ${critNeeds.join(', ')} critically low. Narrate effects. At least 1 suggestedAction must address the most urgent need.`);
    }
  }

  // Special action types
  const isIdleWorldEvent = playerAction?.startsWith('[IDLE_WORLD_EVENT');
  const isContinue = playerAction === '[CONTINUE]';
  const isWait = playerAction === '[WAIT]';
  const isPostCombat = playerAction?.startsWith('[Combat resolved:');
  const isSurrender = isPostCombat && playerAction.includes('surrendered');
  const isTruce = isPostCombat && playerAction.includes('forced a truce');
  const isPostCombatDefeat = isPostCombat && (playerAction.includes('LOST') || playerAction.includes('did NOT win'));
  const isGeneralCombatInitiation = playerAction?.startsWith('[INITIATE COMBAT]');
  const attackNpcMatch = playerAction?.match(/^\[ATTACK:\s*(.+?)\]$/);
  const talkNpcMatch = playerAction?.match(/^\[TALK:\s*(.+?)\]$/);

  // Action block
  if (isIdleWorldEvent) {
    parts.push(`IDLE WORLD EVENT — no player action. Something happens in the world: atmospheric event, NPC activity, overheard rumor, or foreshadowing. Keep SHORT (1-2 para). No combat. Minimal stateChanges. timeAdvance 0.25-0.5h.`);
  } else if (isWait) {
    parts.push(`PLAYER WAITS — passive observation. Do not narrate player initiative. Something develops: NPCs act, news arrives, opportunity/threat emerges. Include modest timeAdvance.`);
  } else if (isContinue) {
    parts.push(`PLAYER CONTINUES — advance the plot without specific player action. Push the scene forward, introduce next beat.`);
  } else if (isPostCombat) {
    parts.push(`${playerAction}\n\nPOST-COMBAT: Narrate aftermath. Do NOT include combatUpdate. Describe battlefield, wounds, loot. No new combat this scene.`);
    if (isPostCombatDefeat) {
      parts.push(`DEFEAT: Player LOST. Narrate consequences — capture, rescue, item loss, humiliation. Never frame as victory.`);
    }
    if (isSurrender) {
      parts.push(`SURRENDER: Player yielded. Enemies are in control. Consequences MANDATORY: imprisonment, item confiscation, money loss, reputation damage, or new obligation. Guards→arrest, Bandits→rob, Intelligent→capture/ransom.`);
    }
    if (isTruce) {
      parts.push(`TRUCE: Player forced ceasefire from strength. Enemies concede. Player keeps belongings. Narrate enemies backing off. Player is dominant — suggest: interrogate, loot fallen, press advantage.`);
    }
  } else {
    // Extract action vs speech
    const speechMatch = playerAction?.match(/(?:mówię|mówi|say|tell|shout|speak|krzyczę)[:\s]*["""](.+?)["""]/i)
      || playerAction?.match(/["""](.+?)["""]/);
    if (speechMatch) {
      const speechText = speechMatch[1];
      const actionText = playerAction.replace(speechMatch[0], '').trim();
      parts.push(`Player input (the character's intent — GM decides outcomes): ${actionText || playerAction}`);
      parts.push(`Player SPEECH (include as dialogue segment with PC name): "${speechText}"`);
    } else {
      parts.push(`Player input (the character's intent — GM decides outcomes): ${playerAction}`);
    }
  }

  if (talkNpcMatch) {
    parts.push(`Player wants to talk to "${talkNpcMatch[1]}". Narrate the conversation normally with dialogue segments for each NPC line.`);
  }

  // Combat intent
  if (!isPostCombat && !isIdleWorldEvent && !isWait) {
    if (isGeneralCombatInitiation) {
      parts.push(`COMBAT INITIATED. MUST include combatUpdate. PREFERRED: use enemyHints {location, budget, maxDifficulty, count, race} — engine selects from bestiary. Available races: ${BESTIARY_RACES_STR}. Available locations: ${BESTIARY_LOCATIONS_STR}.`);
    } else if (attackNpcMatch) {
      parts.push(`PLAYER ATTACKS "${attackNpcMatch[1]}". MUST include combatUpdate. Use enemyHints with appropriate budget/maxDifficulty/count. If tension should build first, use pendingThreat instead.`);
    } else if (detectCombatIntent(playerAction)) {
      parts.push(`COMBAT INTENT DETECTED. MUST include combatUpdate with enemyHints {location, budget, maxDifficulty, count, race}.`);
    }
  }

  // Resolved mechanics + pre-rolled dice
  if (resolvedMechanics?.diceRoll) {
    const r = resolvedMechanics.diceRoll;
    const baseTotal = r.total || r.roll;
    const threshold = r.threshold || r.target;
    const baseMargin = r.margin ?? r.sl ?? 0;
    const outcomeLabel = r.luckySuccess ? 'LUCKY SUCCESS' : r.success ? (baseMargin >= 15 ? 'GREAT SUCCESS' : 'SUCCESS') : (baseMargin <= -15 ? 'HARD FAILURE' : 'FAILURE');
    const creativityNote = r.luckySuccess
      ? ''
      : creativityEligible
        ? ` creativityBonus (0-10, this scene) will be ADDED post-hoc: final_total = ${baseTotal} + creativityBonus, final_margin = ${baseMargin} + creativityBonus. If that flips the result (e.g. margin crosses 0), narrate the FINAL result — not the pre-creativity one shown here.`
        : '';
    const forceNote = forceRoll?.enabled && forceRoll.modifier
      ? ` FORCE ROLL modifier ${forceRoll.modifier > 0 ? '+' : ''}${forceRoll.modifier} will be ADDED post-hoc to total and margin — the player deliberately invoked ${forceRoll.modifier > 0 ? 'favorable' : 'unfavorable'} circumstances. Narrate the FINAL outcome (after modifier), and weave the circumstance into the scene (e.g. a lucky break, a sudden distraction, terrain helping/hindering).`
      : '';
    parts.push(`SKILL CHECK (engine-resolved, DO NOT recalculate the base numbers):
Skill: ${r.skill || '?'} (${r.attribute || '?'}) | d50=${r.roll} + attr=${r.attributeValue || 0} + skill=${r.skillLevel || 0} + momentum=${r.momentumBonus || 0} = ${baseTotal} vs ${threshold} | Margin: ${baseMargin} | Pre-creativity result: ${outcomeLabel}.${creativityNote}${forceNote}
Scale intensity with the final margin (after creativityBonus${forceRoll?.enabled && forceRoll.modifier ? ' and forceRoll modifier' : ''}).`);

    // Remaining pre-rolls for additional sub-actions
    if (preRolls && preRolls.length > 1) {
      const extraRolls = preRolls.slice(1);
      const rollLines = extraRolls.map((pr, i) => {
        if (pr.luckySuccess) return `  Roll ${i + 2}: LUCKY SUCCESS — auto-success, narrate fortunate twist. No calculation needed.`;
        return `  Roll ${i + 2}: base=${pr.base} (d50=${pr.d50}+momentum=${pr.momentum}). Add attribute + skill_level, compare vs threshold.`;
      });
      parts.push(`If the action involves ADDITIONAL sub-actions needing separate checks (max ${extraRolls.length} more):
${rollLines.join('\n')}
Each ADDITIONAL roll MUST be on a DIFFERENT skill than the engine-resolved one (${r.skill}). Never roll twice for the same skill in one scene — collapse multiple uses of ${r.skill} into the resolved check above.
${buildPreRollInstructions()}`);
    }
  } else if (!isPostCombat && !isIdleWorldEvent) {
    if (preRolls && preRolls.length > 0) {
      const rollLines = preRolls.map((pr, i) => {
        if (pr.luckySuccess) return `  Roll ${i + 1}: LUCKY SUCCESS — auto-success, narrate fortunate twist. No calculation needed.`;
        return `  Roll ${i + 1}: base=${pr.base} (d50=${pr.d50}+momentum=${pr.momentum}). Add attribute + skill_level, compare vs threshold.`;
      });
      parts.push(`No skill check was pre-resolved.
If you determine this action requires skill checks (genuine risk/uncertainty), use IN ORDER:
${rollLines.join('\n')}
${buildPreRollInstructions()}`);
    } else {
      parts.push('No skill check for this action.');
    }
  }

  // Dilemma opportunity
  if (sceneCount > 0 && sceneCount % 7 === 0) {
    parts.push('Consider presenting a moral dilemma if the narrative supports it — include "dilemma" field with 2-4 choices.');
  }

  return parts.join('\n\n');
}
