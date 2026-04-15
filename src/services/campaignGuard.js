import { isSafeLocation } from '../../shared/domain/safeLocation.js';

const LEAVE_BLOCKED_MESSAGES = {
  combat: 'Nie możesz opuścić kampanii podczas walki!',
  dialogue: 'Nie możesz opuścić kampanii podczas rozmowy!',
  unsafeLocation: 'Musisz być w karczmie, tawernie lub świątyni żeby opuścić kampanię.',
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
  if (!isSafeLocation(state.world?.currentLocation)) return { allowed: false, reason: 'unsafeLocation' };

  return { allowed: true };
}

export function getLeaveBlockedMessage(reason) {
  return LEAVE_BLOCKED_MESSAGES[reason] || 'Nie możesz teraz opuścić kampanii.';
}
