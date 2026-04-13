import { buildCombatLogDetails } from '../CombatLogEntry';
import { shortId } from '../../../utils/ids';

export function buildResultLogEntries(result, { isActorFriendly, t }) {
  if (!result) return [];
  const friendly = isActorFriendly(result.actor);
  const actorColor = friendly ? '#c59aff' : '#ff6e84';
  const targetColor = friendly ? '#ff6e84' : '#c59aff';
  const uid = shortId();
  const entries = [];

  if (result.outcome === 'hit' && result.damage != null) {
    entries.push({
      type: 'hit',
      actor: result.actor,
      action: '→',
      target: result.targetName || '?',
      criticalHit: Boolean(result.criticalHit),
      criticalLabel: t('combat.criticalHit', 'Critical Hit'),
      damage: result.damage,
      location: result.hitLocation || '',
      actorColor,
      targetColor,
      details: buildCombatLogDetails(result, t),
      id: `hit_${uid}`,
    });
    if (result.targetDefeated) {
      entries.push({
        type: 'defeat',
        actor: result.targetName || '?',
        action: '☠',
        target: '',
        actorColor: targetColor,
        id: `ko_${uid}`,
      });
    }
  } else if (result.outcome === 'miss') {
    entries.push({
      type: 'miss',
      actor: result.actor,
      action: `→ ${t('combat.miss', 'Miss!')}`,
      target: result.targetName || '?',
      highlightText: t('combat.missShort', 'PUDŁO'),
      highlightTone: 'miss',
      actorColor,
      targetColor,
      details: buildCombatLogDetails(result, t),
      id: `miss_${uid}`,
    });
  } else if (result.outcome === 'fled') {
    entries.push({
      type: 'fled',
      actor: result.actor,
      action: t('combat.fled', 'Fled!'),
      target: '',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `fled_${uid}`,
    });
  } else if (result.outcome === 'failed_flee') {
    entries.push({
      type: 'miss',
      actor: result.actor,
      action: t('combat.failedFlee', 'failed to flee'),
      target: '',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `failed_flee_${uid}`,
    });
  } else if (result.outcome === 'defensive') {
    entries.push({
      type: 'info',
      actor: result.actor,
      action: t(`combat.manoeuvres.${result.manoeuvreKey}`, result.manoeuvre),
      target: '',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `defensive_${uid}`,
    });
  }

  return entries;
}

export function buildResultChatMessages(result, { t }) {
  if (!result) return [];
  const ts = Date.now();
  const uid = () => shortId();
  const messages = [];

  if (result.outcome === 'hit' && result.damage != null) {
    messages.push({
      id: `msg_${ts}_hit_${uid()}`,
      role: 'system',
      subtype: 'combat_hit',
      content: result.criticalHit
        ? t('combat.chatCriticalHit', {
          actor: result.actor,
          target: result.targetName || '?',
          damage: result.damage,
          location: result.hitLocation || '',
        })
        : t('combat.chatHit', {
          actor: result.actor,
          target: result.targetName || '?',
          damage: result.damage,
          location: result.hitLocation || '',
        }),
      combatBadgeText: `-${result.damage}`,
      combatBadgeTone: 'hit',
      timestamp: ts,
    });
    if (result.targetDefeated) {
      messages.push({
        id: `msg_${ts}_ko_${uid()}`,
        role: 'system',
        subtype: 'combat_defeat',
        content: t('combat.chatDefeated', { target: result.targetName || '?' }),
        timestamp: ts,
      });
    }
  } else if (result.outcome === 'miss') {
    messages.push({
      id: `msg_${ts}_miss_${uid()}`,
      role: 'system',
      subtype: 'combat_miss',
      content: t('combat.chatMiss', {
        actor: result.actor,
        target: result.targetName || '?',
      }),
      combatBadgeText: t('combat.missShort', 'PUDŁO'),
      combatBadgeTone: 'miss',
      timestamp: ts,
    });
  } else if (result.outcome === 'fled') {
    messages.push({
      id: `msg_${ts}_fled_${uid()}`,
      role: 'system',
      subtype: 'combat_fled',
      content: t('combat.chatFled', { actor: result.actor }),
      timestamp: ts,
    });
  }

  return messages;
}
