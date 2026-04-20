import { BESTIARY_RACES, BESTIARY_LOCATIONS } from '../../data/equipment/index.js';
import { detectCombatIntent } from '../../../../shared/domain/combatIntent.js';

const BESTIARY_RACES_STR = BESTIARY_RACES.join(', ');
const BESTIARY_LOCATIONS_STR = BESTIARY_LOCATIONS.join(', ');

function buildPreRollInstructions() {
  return `To resolve a non-lucky check:
1. Pick skill name from PC Skills (e.g. Skradanie:4 → skill_level=4). If not in list → skill_level=0.
2. Find linked attribute from PC Attributes (see mapping in CORE RULES, e.g. Skradanie→ZRC:13 → attr=13).
3. total = base + attr + skill_level
4. Compare vs threshold: easy=20, medium=35, hard=50, veryHard=65, extreme=80
5. margin = total - threshold. success = margin >= 0.
LUCKY SUCCESS rolls: skip all calculation, auto-success. Narrate fortunate twist.
IMPORTANT: Calculate result FIRST, then narrate accordingly. Do not narrate success if the roll fails.
Include in TOP-LEVEL diceRolls field (NOT nested in stateChanges): [{skill, difficulty, success}]. Use only as many rolls as genuinely needed.`;
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
      parts.push(`COMBAT INTENT DETECTED. MUST include combatUpdate with enemyHints {location, budget, maxDifficulty, count}. Available races: ${BESTIARY_RACES_STR}.`);
    }
  }

  // Resolved mechanics + pre-rolled dice
  if (resolvedMechanics?.diceRoll) {
    const r = resolvedMechanics.diceRoll;
    const outcomeLabel = r.luckySuccess ? 'LUCKY SUCCESS' : r.success ? (r.margin >= 15 ? 'GREAT SUCCESS' : 'SUCCESS') : (r.margin <= -15 ? 'HARD FAILURE' : 'FAILURE');
    parts.push(`SKILL CHECK (engine-resolved, DO NOT recalculate):
Skill: ${r.skill || '?'} (${r.attribute || '?'}) | d50=${r.roll} + attr=${r.attributeValue || 0} + skill=${r.skillLevel || 0} + momentum=${r.momentumBonus || 0} + creativity=${r.creativityBonus || 0} = ${r.total || r.roll} vs ${r.threshold || r.target} | Margin: ${r.margin ?? r.sl ?? 0} | Result: ${outcomeLabel}
Narrate consistently: ${r.success ? 'the action SUCCEEDS' : 'the action FAILS'}. Scale intensity with margin.`);

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
