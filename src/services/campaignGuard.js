const SAFE_LOCATION_RE = /\b(town|city|village|market|shop|tavern|inn|port|harbor|harbour|forge|smithy|store|emporium|bazaar|karczma|miasto|wioska|targ|sklep|kuźnia|gospoda|oberża|osada|zamek|castle|camp|obóz|sanctuary|świątynia|temple|guild|gildia)\b/i;

const LEAVE_BLOCKED_MESSAGES = {
  combat: 'Nie możesz opuścić kampanii podczas walki!',
  dialogue: 'Nie możesz opuścić kampanii podczas rozmowy!',
  unsafeLocation: 'Musisz być w bezpiecznym miejscu (karczma, miasto) żeby opuścić kampanię.',
};

export function canLeaveCampaign(state) {
  if (!state.campaign) return { allowed: true };

  // Freeroam or completed main quest → always allowed
  if (state.campaign.freeroam) return { allowed: true };
  const hasCompletedMain = (state.quests?.completed || []).some(q => q.type === 'main');
  if (hasCompletedMain) return { allowed: true };

  // Blocked: combat
  if (state.combat) return { allowed: false, reason: 'combat' };

  // Blocked: dialogue
  if (state.dialogue) return { allowed: false, reason: 'dialogue' };

  // Blocked: unsafe location
  const loc = (state.world?.currentLocation || '').toLowerCase();
  if (!SAFE_LOCATION_RE.test(loc)) return { allowed: false, reason: 'unsafeLocation' };

  return { allowed: true };
}

export function getLeaveBlockedMessage(reason) {
  return LEAVE_BLOCKED_MESSAGES[reason] || 'Nie możesz teraz opuścić kampanii.';
}
