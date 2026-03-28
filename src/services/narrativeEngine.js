// --- Foreshadowing Seeds ---
export function checkSeedResolution(seeds, gameState) {
  if (!seeds?.length) return [];
  const sceneCount = gameState.scenes?.length || 0;
  const currentLoc = gameState.world?.currentLocation?.toLowerCase() || '';

  return seeds.filter((seed) => {
    if (seed.resolved) return false;
    const planted = seed.planted ?? 0;
    if (sceneCount - planted >= 5) return true;
    if (seed.payoffCondition === 'location' && currentLoc && seed.location?.toLowerCase() === currentLoc) return true;
    return false;
  });
}

export function formatSeedsForPrompt(seeds) {
  const unresolved = (seeds || []).filter((s) => !s.resolved);
  if (unresolved.length === 0) return '';

  const list = unresolved
    .map((s) => `- [${s.id}] ${s.description}${s.payoffHint ? ` (hint: ${s.payoffHint})` : ''} (planted scene ${s.planted ?? '?'})`)
    .join('\n');

  return `\nUNRESOLVED NARRATIVE SEEDS (Chekhov's Guns):
${list}
When conditions align, weave a seed's payoff into the scene naturally. Mark resolved seeds via stateChanges.resolvedSeeds: ["seed_id"].\n`;
}

// --- Callback System ---
export function checkPendingCallbacks(decisions, gameState) {
  if (!decisions?.length) return [];
  const sceneCount = gameState.scenes?.length || 0;
  const currentLoc = gameState.world?.currentLocation?.toLowerCase() || '';
  const day = gameState.world?.timeState?.day || 1;
  const triggered = [];

  for (const decision of decisions) {
    for (const cb of decision.pendingCallbacks || []) {
      if (cb.fired) continue;
      const [type, value] = (cb.trigger || '').split(':');
      if (type === 'location' && value?.toLowerCase() === currentLoc) {
        triggered.push({ ...cb, decisionChoice: decision.choice });
      } else if (type === 'scenes' && sceneCount >= Number(value)) {
        triggered.push({ ...cb, decisionChoice: decision.choice });
      } else if (type === 'day' && day >= Number(value)) {
        triggered.push({ ...cb, decisionChoice: decision.choice });
      }
    }
  }
  return triggered;
}

export function formatCallbacksForPrompt(decisions, gameState) {
  const triggered = checkPendingCallbacks(decisions, gameState);
  if (triggered.length === 0) return '';

  const list = triggered
    .map((cb) => `- "${cb.event}" (consequence of: "${cb.decisionChoice || 'past decision'}")`)
    .join('\n');

  return `\nTRIGGERED CALLBACKS — these past decisions MUST manifest NOW:
${list}
Incorporate these events into the current scene narrative. They make the world feel alive and remembering.\n`;
}

// --- NPC Agendas ---
export function checkNpcAgendas(agendas, gameState) {
  if (!agendas?.length) return [];
  const sceneCount = gameState.scenes?.length || 0;

  return agendas.filter((a) => {
    const planted = a.plantedScene ?? 0;
    const triggerAfter = a.triggerAfterScenes ?? 3;
    return sceneCount - planted >= triggerAfter;
  });
}

export function formatAgendasForPrompt(agendas, gameState) {
  const triggered = checkNpcAgendas(agendas, gameState);
  if (triggered.length === 0) return '';

  const list = triggered
    .map((a) => `- ${a.npcName} (${a.urgency || 'medium'}): goal="${a.goal}", next action="${a.nextAction}"`)
    .join('\n');

  return `\nTRIGGERED NPC AGENDAS — off-screen NPC activity to weave into this scene:
${list}
These NPCs have been working toward their goals. Show evidence of their actions: rumors, letters, NPC arrivals, environmental changes, or direct confrontation.\n`;
}

// --- Ticking Clocks ---
export function checkQuestDeadlines(quests, timeState) {
  if (!quests?.length || !timeState) return { expired: [], warning: [] };
  const day = timeState.day || 1;
  const hour = timeState.hour || 6;
  const currentTime = day * 24 + hour;
  const expired = [];
  const warning = [];

  for (const q of quests) {
    if (!q.deadline) continue;
    const deadlineTime = (q.deadline.day || 999) * 24 + (q.deadline.hour || 18);
    if (currentTime >= deadlineTime) {
      expired.push(q);
    } else {
      const total = deadlineTime - (q.startDay || 1) * 24;
      const remaining = deadlineTime - currentTime;
      const threshold = q.deadline.warningThreshold ?? 0.75;
      if (total > 0 && (1 - remaining / total) >= threshold) {
        warning.push(q);
      }
    }
  }
  return { expired, warning };
}

export function formatDeadlinesForPrompt(quests, timeState) {
  const { expired, warning } = checkQuestDeadlines(quests, timeState);
  if (expired.length === 0 && warning.length === 0) return '';

  const parts = [];
  for (const q of warning) {
    const remaining = ((q.deadline.day || 999) * 24 + (q.deadline.hour || 18)) - ((timeState?.day || 1) * 24 + (timeState?.hour || 6));
    const days = Math.floor(remaining / 24);
    const hours = Math.round(remaining % 24);
    parts.push(`- URGENT: "${q.name}" deadline in ${days > 0 ? `${days}d ` : ''}${hours}h! Consequence: ${q.deadline.consequence}`);
  }
  for (const q of expired) {
    parts.push(`- EXPIRED: "${q.name}" — deadline passed! Consequence triggers: ${q.deadline.consequence}`);
  }

  return `\nQUEST DEADLINE WARNINGS:
${parts.join('\n')}
Escalate urgency in the narrative. NPCs mention time pressure, environmental clues show time running out.\n`;
}

// --- Idle Event Weighting ---
const IDLE_EVENT_WEIGHTS = [
  { type: 'atmospheric', weight: 40 },
  { type: 'npc_activity', weight: 25 },
  { type: 'rumor', weight: 15 },
  { type: 'foreshadowing', weight: 10 },
  { type: 'consequence_echo', weight: 10 },
];

export function pickIdleEventType() {
  const totalWeight = IDLE_EVENT_WEIGHTS.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of IDLE_EVENT_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return 'atmospheric';
}

// --- Moral Dilemma Scheduling ---
export function shouldGenerateDilemma(scenes) {
  if (!scenes?.length) return false;
  let scenesSinceLast = 0;
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i].dilemma) break;
    scenesSinceLast++;
  }
  return scenesSinceLast >= 5 && scenesSinceLast <= 8;
}
