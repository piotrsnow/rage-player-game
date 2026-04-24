/**
 * World state, NPCs-here, key NPC summary, plot facts, codex, needs crisis,
 * active quests, recent context (compressed facts + last scene narrative).
 *
 * Each helper returns either a formatted string or null — the orchestrator
 * drops nulls before joining.
 */

export function buildWorldStateBlock(world, { sceneCount = 0, expectedScenes = 0 } = {}) {
  const lines = [];
  if (world.currentLocation) lines.push(`Location: ${world.currentLocation}`);
  if (world.timeState) {
    const ts = world.timeState;
    const h = Math.floor(ts.hour ?? 6);
    const m = Math.round(((ts.hour ?? 6) - h) * 60);
    lines.push(
      `Time: Day ${ts.day || 1}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ` +
      `(${ts.timeOfDay || 'morning'}), Season: ${ts.season || 'unknown'}`,
    );
  }

  // Scene index + campaign pacing hint — daje modelowi strukturalny sygnał
  // gdzie w łuku kampanii się znajduje (early=wprowadzaj hooki, mid=zamykaj
  // subplot y, late=push do finału). sceneCount jest 1-indexed dla czytelności.
  if (sceneCount > 0 && expectedScenes > 0) {
    const progress = sceneCount / expectedScenes;
    const phase = progress < 0.3 ? 'early' : progress < 0.7 ? 'mid' : 'late';
    lines.push(`Scene: ${sceneCount} / ~${expectedScenes} expected | Campaign phase: ${phase}`);
  }

  const npcs = world.npcs || [];
  const currentLoc = world.currentLocation || '';
  const npcsHere = npcs.filter(
    (n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase(),
  );
  if (npcsHere.length > 0) {
    lines.push(
      `NPCs here: ${npcsHere.map((n) => `${n.name} (${n.role || '?'}, ${n.attitude || 'neutral'}, dsp:${n.disposition || 0})`).join(', ')}`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Derive scene phase from sceneCount + expected campaign length. Exported for
 * conditionalRules reuse (late-phase micro-hint). Returns 'early'|'mid'|'late'
 * or null when inputs are unknown.
 */
export function deriveScenePhase(sceneCount = 0, expectedScenes = 0) {
  if (sceneCount <= 0 || expectedScenes <= 0) return null;
  const progress = sceneCount / expectedScenes;
  return progress < 0.3 ? 'early' : progress < 0.7 ? 'mid' : 'late';
}

export function buildKeyNpcsBlock(world) {
  const npcs = world.npcs || [];
  if (npcs.length === 0) return null;

  const knownNpcs = npcs
    .filter((n) => n.alive !== false)
    .sort((a, b) => Math.abs(b.disposition || 0) - Math.abs(a.disposition || 0))
    .slice(0, 8);
  if (knownNpcs.length === 0) return null;

  const lines = ['Key NPCs (disposition):'];
  for (const n of knownNpcs) {
    lines.push(
      `- ${n.name} (${n.attitude || 'neutral'}, dsp:${n.disposition || 0}) — ${n.role || '?'}${n.lastLocation ? ', ' + n.lastLocation : ''}`,
    );
  }
  return lines.join('\n');
}

export function buildKeyPlotFactsBlock(world) {
  const facts = world.keyPlotFacts || [];
  if (facts.length === 0) return null;
  return `Key plot facts:\n${facts.map((f) => `- ${f}`).join('\n')}`;
}

export function buildCodexSummaryBlock(world) {
  const summary = world.codexSummary || [];
  if (summary.length === 0) return null;

  const lines = [`ALREADY DISCOVERED BY PLAYER (DO NOT REPEAT — reveal NEW aspects only):`];
  lines.push(`${summary.length} entries total.`);
  for (const entry of summary.slice(0, 10)) {
    let line = `- ${entry.name} [${entry.category}]: known = ${entry.knownAspects.join(', ') || 'none'}`;
    if (entry.canReveal.length > 0) {
      line += ` → can still reveal: ${entry.canReveal.join(', ')}`;
    } else {
      line += ' → fully known';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function buildNeedsCrisisBlock({ needsSystemEnabled, characterNeeds }) {
  if (!needsSystemEnabled || !characterNeeds) return null;
  const needNames = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];
  const critNeeds = needNames.filter((k) => (characterNeeds[k] ?? 100) < 10);
  if (critNeeds.length === 0) return null;

  const critLines = critNeeds.map((k) => `${k}: ${characterNeeds[k] ?? 0}/100 CRITICAL`);
  return `NEEDS CRISIS: ${critLines.join(', ')}
Narrate crisis effects (weakness, funny walk, stench, drowsiness). Apply -10 to related tests. At least 1 suggestedAction must address the most urgent need.`;
}

export function buildActiveQuestsBlock(quests) {
  // Tylko main questy — side/personal/faction są wyłączone w tym buildzie
  // (do wdrożenia jako system między-kampaniami). Patrz
  // knowledge/ideas/side-quests-between-campaigns.md.
  const active = (quests.active || []).filter((q) => q.type === 'main');
  if (active.length === 0) return null;

  const lines = ['Active Quests (use id=... values in stateChanges.completedQuests / questUpdates):'];
  for (const q of active.slice(0, 5)) {
    let line = `- ${q.name} (id=${q.id}) [${q.type || 'side'}]: ${q.description || ''}`;
    if (q.completionCondition) line += ` | Goal: ${q.completionCondition}`;
    if (q.questGiverId) line += ` | Giver: ${q.questGiverId}`;
    const turnIn = q.turnInNpcId || q.questGiverId;
    if (turnIn && turnIn !== q.questGiverId) line += ` | Turn in: ${turnIn}`;
    if (q.objectives?.length) {
      const done = q.objectives.filter((o) => o.completed);
      const remaining = q.objectives.filter((o) => !o.completed);
      if (done.length > 0 && remaining.length > 0) {
        line += `\n  (${done.length}/${q.objectives.length} completed)`;
      }
      for (let i = 0; i < remaining.length; i++) {
        const obj = remaining[i];
        const marker = i === 0 ? '▶ NEXT' : '[ ]';
        line += `\n  ${marker} (objId=${obj.id}) ${obj.description}`;
      }
      if (remaining.length === 0) line += '\n  COMPLETED';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Two layers of recent context:
 *   - earlier scenes are compressed into 15 facts (gameStateSummary);
 *   - the immediate previous scene is attached in full so tone/dialog continuity
 *     survives the compression pass.
 *
 * Facts whose sceneIndex matches the last scene are dropped — the full
 * narrative already carries that info. Legacy string facts (no sceneIndex
 * metadata) are always included.
 */
export function buildRecentContextBlock({ recentScenes, gameStateSummary }) {
  const parts = [];
  const lastScene = recentScenes.length > 0 ? recentScenes[recentScenes.length - 1] : null;
  const lastSceneIndex = lastScene?.sceneIndex ?? null;

  if (gameStateSummary?.length > 0) {
    const factText = (item) => (typeof item === 'string' ? item : item?.fact || '');
    const factSceneIdx = (item) => (typeof item === 'string' ? null : item?.sceneIndex ?? null);
    const filtered = gameStateSummary.filter((item) => {
      const idx = factSceneIdx(item);
      return idx === null || lastSceneIndex === null || idx !== lastSceneIndex;
    });
    if (filtered.length > 0) {
      parts.push(`Recent Story Facts:\n${filtered.map((f, i) => `${i + 1}. ${factText(f)}`).join('\n')}`);
    }
  }

  if (lastScene) {
    const action = lastScene.chosenAction ? `Player: ${lastScene.chosenAction}\n` : '';
    parts.push(`Last Scene:\n[Scene ${lastScene.sceneIndex}] ${action}${lastScene.narrative || ''}`);
  }

  return parts;
}
