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
    const verbKey = result.manoeuvreKey;
    const actionVerb = verbKey ? t(`combat.actionVerbs.${verbKey}`, '→') : '→';
    entries.push({
      type: 'miss',
      actor: result.actor,
      action: actionVerb,
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
  } else if (result.outcome === 'shoved') {
    entries.push({
      type: 'hit',
      actor: result.actor,
      action: t('combat.shoved', 'shoved {{target}}', { target: result.targetName || '?' }),
      target: '',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `shove_${uid}`,
    });
    if (result.offBalance) {
      entries.push({
        type: 'info',
        actor: result.targetName || '?',
        action: t('combat.shoveOffBalance', '{{target}} is knocked off-balance!', { target: result.targetName || '?' }),
        target: '',
        actorColor: targetColor,
        id: `shove_offbal_${uid}`,
      });
    }
  } else if (result.outcome === 'shove_failed') {
    entries.push({
      type: 'miss',
      actor: result.actor,
      action: t('combat.shoveFailed', 'failed to shove {{target}}', { target: result.targetName || '?' }),
      target: '',
      highlightText: t('combat.missShort', 'MISS'),
      highlightTone: 'miss',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `shove_fail_${uid}`,
    });
  } else if (result.outcome === 'shove_blocked') {
    entries.push({
      type: 'miss',
      actor: result.actor,
      action: t('combat.shoveBlocked', 'shoved but the tile is blocked'),
      target: '',
      actorColor,
      details: buildCombatLogDetails(result, t),
      id: `shove_blocked_${uid}`,
    });
  } else if (result.outcome === 'charge_blocked') {
    const reasonLabel = result.reason === 'not_straight_line'
      ? t('combat.chargeNotStraight', 'Nie w linii prostej')
      : t('combat.chargePathBlocked', 'Droga zablokowana');
    entries.push({
      type: 'info',
      actor: result.actor,
      action: `${t('combat.chargeBlocked', 'Szarża zablokowana')} — ${reasonLabel}`,
      target: '',
      actorColor,
      id: `charge_blocked_${uid}`,
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

  if (result.appliedEffects?.length) {
    for (const eff of result.appliedEffects) {
      const isDebuff = eff.category === 'dot' || eff.category === 'control' || eff.category === 'debuff';
      entries.push({
        type: 'effect',
        actor: eff.target,
        action: isDebuff
          ? t('combat.effectDebuffApplied', '{{effect}}', { effect: eff.effectName })
          : t('combat.effectBuffApplied', '{{effect}}', { effect: eff.effectName }),
        target: '',
        actorColor: isDebuff ? '#ff6e84' : '#74c0fc',
        highlightText: isDebuff ? t('combat.debuff', 'DEBUFF') : t('combat.buff', 'BUFF'),
        highlightTone: isDebuff ? 'debuff' : 'buff',
        id: `fx_${uid}_${eff.effectName}`,
      });
    }
  }

  return entries;
}

export function buildRoundEffectLogEntries(events, { t }) {
  if (!events?.length) return [];
  const entries = [];
  for (const ev of events) {
    const uid = shortId();
    if (ev.action === 'dot') {
      entries.push({
        type: 'effect',
        actor: ev.target,
        action: t('combat.effectDot', '-{{damage}} (efekt)', { damage: ev.damage }),
        target: '',
        actorColor: '#ff6e84',
        id: `dot_${uid}`,
      });
    } else if (ev.action === 'heal') {
      entries.push({
        type: 'effect',
        actor: ev.target,
        action: t('combat.effectHealTick', '+{{heal}} (efekt)', { heal: ev.heal }),
        target: '',
        actorColor: '#74c0fc',
        id: `heal_${uid}`,
      });
    } else if (ev.action === 'expired') {
      entries.push({
        type: 'effect',
        actor: ev.target,
        action: t('combat.effectExpired', '{{effect}} wygasł', { effect: ev.effectName }),
        target: '',
        actorColor: '#8b8b8f',
        id: `expired_${uid}`,
      });
    }
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
