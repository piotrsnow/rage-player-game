export function computeDialogueStats(character) {
  const fel = (character?.characteristics?.fel ?? 0) + (character?.advances?.fel ?? 0);
  const charmAdvances = character?.skills?.Charm ?? 0;
  const total = fel + charmAdvances;
  const maxRounds = Math.floor(total / 10);
  return {
    maxRounds: Math.max(1, maxRounds),
    cooldown: Math.max(2, maxRounds * 2),
  };
}

export function canStartDialogue(character, currentCooldown, availableNpcCount) {
  if (currentCooldown > 0) return false;
  if (availableNpcCount < 1) return false;
  const { maxRounds } = computeDialogueStats(character);
  return maxRounds >= 1;
}

export function createDialogueState(character, npcs) {
  const { maxRounds, cooldown } = computeDialogueStats(character);
  return {
    active: true,
    round: 1,
    maxRounds,
    cooldownTotal: cooldown,
    npcs: npcs.map((npc) => ({
      name: npc.name,
      attitude: npc.attitude || 'neutral',
      role: npc.role || '',
      personality: npc.personality || '',
    })),
    log: [],
  };
}

export function advanceDialogueRound(dialogue) {
  if (!dialogue?.active) return dialogue;
  const nextRound = dialogue.round + 1;
  if (nextRound > dialogue.maxRounds) {
    return { ...dialogue, active: false };
  }
  return { ...dialogue, round: nextRound };
}
