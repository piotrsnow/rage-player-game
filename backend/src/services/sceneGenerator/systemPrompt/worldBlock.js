/**
 * World state, NPCs-here, key NPC summary, plot facts, codex, needs crisis,
 * active quests, recent context (compressed facts + last scene narrative).
 *
 * Each helper returns either a formatted string or null — the orchestrator
 * drops nulls before joining.
 */

function isNpcHere(npc, currentLocationRef, currentLocationName) {
  if (npc.alive === false) return false;
  if (currentLocationRef && npc.locationRef) {
    return npc.locationRef.kind === currentLocationRef.kind && npc.locationRef.id === currentLocationRef.id;
  }
  if (!currentLocationName || !npc.lastLocation) return false;
  return npc.lastLocation.toLowerCase() === currentLocationName.toLowerCase();
}

export function buildWorldStateBlock(world, { sceneCount = 0, expectedScenes = 0 } = {}) {
  const lines = [];
  if (world.currentLocation) {
    const ref = world.currentLocationRef;
    const locRefTag = ref?.kind && ref?.id ? ` [ref: ${ref.kind}:${ref.id}]` : '';
    lines.push(`Location: ${world.currentLocation}${locRefTag}`);
  }
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
  const currentRef = world.currentLocationRef || null;
  const currentLoc = world.currentLocation || '';
  const npcsHere = npcs.filter((n) => isNpcHere(n, currentRef, currentLoc));
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
    let locSuffix = '';
    if (n.lastLocation) {
      const nLocRef = n.locationRef?.kind && n.locationRef?.id
        ? ` [ref: ${n.locationRef.kind}:${n.locationRef.id}]` : '';
      locSuffix = `, ${n.lastLocation}${nLocRef}`;
    }
    lines.push(
      `- ${n.name} (${n.attitude || 'neutral'}, dsp:${n.disposition || 0}) — ${n.role || '?'}${locSuffix}`,
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

/**
 * Active quests rendered for the LLM. Two modes:
 *  - questGraphEnabled=false (default, legacy): liniowa lista objectives,
 *    pojedynczy ▶ NEXT marker, identyczne renderowanie jak przed osią 1.
 *  - questGraphEnabled=true (oś 1+5): pełen graf z [nodeKey] markerami,
 *    statusami DISCOVERED/UNDISCOVERED, BRANCHES, [STALLED] dla osi 4.
 *
 * Main questy renderowane pierwsze pod nagłówkiem "Active Quests". Side /
 * personal / faction questy w osobnej sub-sekcji "--- Background Quests ---"
 * z dyrektywą: emit questUpdates only when narrative resolves them, do NOT
 * divert the main arc. Bez tego LLM nie widzi ich obiektywów i nie potrafi
 * ich auto-odhaczyć (analogiczny fix jak w incidentAnalyzer.js w e703e1a).
 *
 * Limity osobne (token budget): main 5, background 3. Sort wewnątrz grup
 * stabilny po q.id — createdAt nie jest surface'owane przez campaignLoader
 * dla questów z DB.
 */
export function buildActiveQuestsBlock(quests, { questGraphEnabled = false } = {}) {
  const all = quests.active || [];
  if (all.length === 0) return null;

  const sortById = (a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''));
  const main = all.filter((q) => q.type === 'main').sort(sortById).slice(0, 5);
  const background = all.filter((q) => q.type !== 'main').sort(sortById).slice(0, 3);
  if (main.length === 0 && background.length === 0) return null;

  const renderer = questGraphEnabled ? buildGraphActiveQuestsBlock : buildLegacyActiveQuestsBlock;
  const parts = [];
  if (main.length > 0) {
    parts.push(renderer(main, { heading: true }));
  }
  if (background.length > 0) {
    parts.push("--- Background Quests (side / personal / faction — emit questUpdates only when narrative actually resolves them; do NOT divert the main arc) ---");
    parts.push(renderer(background, { heading: false }));
  }
  return parts.join('\n');
}

function buildLegacyActiveQuestsBlock(active, { heading = true } = {}) {
  const lines = [];
  if (heading) {
    lines.push('Active Quests (use id=... for completedQuests; for questUpdates.objectiveId pass the number shown before the objective):');
  }
  for (const q of active) {
    let line = `- ${q.name} (id=${q.id}) [${q.type || 'side'}]: ${q.description || ''}`;
    if (q.completionCondition) line += ` | Goal: ${q.completionCondition}`;
    if (q.questGiverId) line += ` | Giver: ${q.questGiverId}`;
    const turnIn = q.turnInNpcId || q.questGiverId;
    if (turnIn && turnIn !== q.questGiverId) line += ` | Turn in: ${turnIn}`;
    if (q.objectives?.length) {
      const doneCount = q.objectives.filter((o) => o.completed).length;
      if (doneCount > 0 && doneCount < q.objectives.length) {
        line += `\n  (${doneCount}/${q.objectives.length} completed)`;
      }
      let firstPending = true;
      for (let i = 0; i < q.objectives.length; i++) {
        const obj = q.objectives[i];
        if (obj.completed) continue;
        const marker = firstPending ? '▶ NEXT' : '[ ]';
        firstPending = false;
        line += `\n  ${i}. ${marker} ${obj.description}`;
      }
      if (doneCount === q.objectives.length) line += '\n  COMPLETED';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function statusLabel(status) {
  switch (status) {
    case 'done': return 'DONE';
    case 'pending': return 'PENDING';
    case 'locked': return 'LOCKED';
    case 'skipped': return 'SKIPPED';
    case 'failed': return 'FAILED';
    default: return String(status || 'pending').toUpperCase();
  }
}

function buildGraphActiveQuestsBlock(active, { heading = true } = {}) {
  const lines = [];
  if (heading) {
    lines.push('Active Quests (graph-aware — emit questUpdates.nodeKey, branchChoice, objectiveReveals, branchGroupReveals):');
  }
  for (const q of active) {
    let header = `- ${q.name} (id=${q.id}) [${q.type || 'side'}]`;
    if (q.status === 'stalled') header += ' [STALLED]';
    if (q.status === 'failed') header += ' [FAILED]';
    if (q.description) header += `: ${q.description}`;
    if (q.completionCondition) header += ` | Goal: ${q.completionCondition}`;
    if (q.questGiverId) header += ` | Giver: ${q.questGiverId}`;
    const turnIn = q.turnInNpcId || q.questGiverId;
    if (turnIn && turnIn !== q.questGiverId) header += ` | Turn in: ${turnIn}`;
    lines.push(header);

    if (Array.isArray(q.mutationLog) && q.mutationLog.length > 0) {
      const last = q.mutationLog[q.mutationLog.length - 1];
      lines.push(`  Mutation: ${last.mutation} — ${last.reason || '(no reason)'} `);
    }

    const objectives = Array.isArray(q.objectives) ? q.objectives : [];
    if (objectives.length === 0) continue;

    let undiscoveredCount = 0;
    const branchGroups = new Map(); // group → { discoveredKeys[], totalKeys[] }
    for (const obj of objectives) {
      const nk = obj.nodeKey || `(no_key_${obj.description?.slice(0, 12) || ''})`;
      const status = obj.status || (obj.completed ? 'done' : 'pending');
      const discovered = obj.discovered !== false;
      const tag = discovered ? 'DISCOVERED' : 'UNDISCOVERED';
      const isReachable = status === 'pending' || status === 'locked';
      if (!discovered && isReachable) undiscoveredCount += 1;

      let line = `  • [${nk}] ${tag}, ${statusLabel(status)}`;
      if (status === 'pending' && discovered) line += ' ← NEXT (player knows)';
      if (status === 'locked' && discovered) line += ' ← visible-locked (player aware, needs parents)';
      if (discovered) {
        line += ` — ${obj.description || ''}`;
      } else {
        line += ' — (player sees as ???)';
      }
      const meta = [];
      if (Array.isArray(obj.parents) && obj.parents.length > 0) meta.push(`parents: ${obj.parents.join(',')}`);
      if (obj.branchGroup) meta.push(`branchGroup: ${obj.branchGroup}`);
      if (obj.branchType) meta.push(`branchType: ${obj.branchType}`);
      if (obj.choiceLabel) meta.push(`choice: "${obj.choiceLabel}"`);
      if (obj.failsOn?.npcDead?.length) meta.push(`failsOn.npcDead: ${obj.failsOn.npcDead.join(',')}`);
      if (obj.failsOn?.deadline) meta.push(`deadline: ${obj.failsOn.deadline}`);
      if (meta.length > 0) line += `   {${meta.join(' | ')}}`;
      lines.push(line);

      if (obj.branchGroup) {
        if (!branchGroups.has(obj.branchGroup)) branchGroups.set(obj.branchGroup, { discovered: [], all: [] });
        const g = branchGroups.get(obj.branchGroup);
        g.all.push(obj.nodeKey);
        if (discovered) g.discovered.push(obj.nodeKey);
      }
    }

    if (branchGroups.size > 0) {
      const groupLines = [];
      for (const [group, info] of branchGroups.entries()) {
        const discovered = info.discovered.filter(Boolean);
        if (discovered.length === 0) continue;
        groupLines.push(`${group} (player can choose: ${discovered.join(' | ')})`);
      }
      if (groupLines.length > 0) {
        lines.push(`  Branches active: ${groupLines.join('; ')}`);
      }
    }

    if (undiscoveredCount > 0) {
      lines.push(`  Hidden objectives: ${undiscoveredCount} (player sees as "???" — emit objectiveReveals only when narrative justifies it)`);
    }

    // Detect STUCK state: all discovered objectives are done but undiscovered
    // steps remain — the player has no visible next step.
    const discoveredPending = objectives.filter((obj) => {
      const s = obj.status || (obj.completed ? 'done' : 'pending');
      const d = obj.discovered !== false;
      return d && s === 'pending';
    });
    if (discoveredPending.length === 0 && undiscoveredCount > 0) {
      lines.push(`  ⚠ STUCK: player completed all visible objectives but hidden steps remain — narrative must reveal the next step this scene (emit objectiveReveals).`);
    }
  }
  return lines.join('\n');
}

/**
 * Oś 2 — relacje NPC obecnych w scenie. Pokazuje top-15 najsilniejszych
 * relacji (po |strength|) dla NPC obecnych w `currentLocation`. Pomaga
 * LLM-owi pisać narrację konsekwentną z istniejącymi powiązaniami i
 * zachęca do emitowania `actionType` w `npcMemoryUpdates` gdy player robi
 * coś z bohaterem powiązanym (działający przez ripple service na stronie BE).
 *
 * Renderuje dwukierunkowo (NPC A → NPC B i A→B w odwrotnym sensie) tylko
 * jeśli oba NPC są w lokacji — inaczej tylko strona z source-em obecnym.
 */
export function buildNpcRelationshipsBlock(world) {
  const npcs = world.npcs || [];
  const currentRef = world.currentLocationRef || null;
  const currentLoc = world.currentLocation || '';
  if (npcs.length === 0 || (!currentLoc && !currentRef)) return null;

  const npcsHere = npcs.filter((n) => isNpcHere(n, currentRef, currentLoc));
  if (npcsHere.length === 0) return null;

  const here = new Set(npcsHere.map((n) => (n.name || '').toLowerCase()));
  const edges = [];
  for (const src of npcsHere) {
    const rels = Array.isArray(src.relationships) ? src.relationships : [];
    for (const r of rels) {
      if (!r?.npcName || !r?.type) continue;
      const targetLower = String(r.npcName).toLowerCase();
      const inScene = here.has(targetLower);
      const strength = typeof r.strength === 'number' ? r.strength : 0;
      const ripple = typeof r.rippleStrength === 'number' ? r.rippleStrength : 50;
      edges.push({
        sourceName: src.name,
        targetName: r.npcName,
        targetType: r.targetType || 'npc',
        relation: r.type,
        strength,
        rippleStrength: ripple,
        bothInScene: inScene,
      });
    }
  }
  if (edges.length === 0) return null;

  edges.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));
  const top = edges.slice(0, 15);
  const lines = [
    'NPC Relationships (active — use to motivate ripple effects via npcMemoryUpdates.actionType):',
  ];
  for (const e of top) {
    const arrow = e.bothInScene ? '<->' : '-->';
    lines.push(
      `- ${e.sourceName} ${arrow} ${e.targetName} | ${e.relation} (strength: ${e.strength}, ripple: ${e.rippleStrength}${e.targetType !== 'npc' ? `, ${e.targetType}` : ''})`,
    );
  }
  lines.push(
    'When the player aids/harms one NPC, emit `npcMemoryUpdates` with `actionType` (killed|saved|betrayed|aided|insulted|broke_promise|kept_promise) — backend will propagate disposition to related NPC automatically. Reference relationships in dialog ("Słyszałem co zrobiłeś z moim bratem...").',
  );
  return lines.join('\n');
}

/**
 * Oś 3 — pending quest opportunities (hook'i z npcAgentLoop). Renderowane
 * w prompcie kiedy gracz jest w lokacji w której agent NPC zostawił hook
 * `needs_player_help`. LLM decyduje narracyjnie czy emit `questOffers` w
 * tej scenie. Dane są wypełniane w Etapie D — tutaj sygnatura + format
 * gotowe na wpięcie.
 *
 * `world.pendingHooks: { questGiverName, locationName, pitch, type, involvedNpcs[],
 *                         relations[], gameTimeAgoLabel, hookId }[]`
 */
export function buildPendingQuestHooksBlock(world) {
  const hooks = Array.isArray(world?.pendingHooks) ? world.pendingHooks : [];
  if (hooks.length === 0) return null;

  const lines = ['Pending quest opportunities (offscreen NPC agency — materialize via questOffers when narrative permits):'];
  for (const h of hooks.slice(0, 5)) {
    let line = `- ${h.questGiverName || '?'} (questGiver`;
    if (h.locationName) line += `, found at ${h.locationName}`;
    line += '): ';
    line += h.pitch || '(no pitch)';
    if (h.type) line += ` [${h.type}]`;
    if (Array.isArray(h.involvedNpcs) && h.involvedNpcs.length > 0) {
      line += ` | involved: ${h.involvedNpcs.join(', ')}`;
    }
    if (Array.isArray(h.relations) && h.relations.length > 0) {
      line += ` | relations: ${h.relations.join('; ')}`;
    }
    if (h.gameTimeAgoLabel) line += ` [${h.gameTimeAgoLabel}]`;
    if (h.hookId) line += ` (hookId=${h.hookId})`;
    lines.push(line);
  }
  lines.push(
    'Materialize at most one per scene. When emitting questOffers, copy questGiverId from the hook + include relatedHookId. Side/personal quests in living-world MUST have ≥2 objectives + ≥1 branchGroup (XOR moral choice) when relations contradict.',
  );
  return lines.join('\n');
}

/**
 * Recent location trail — gives the LLM its own scene-by-scene path through
 * the world. Without this, the model only sees the CURRENT location and may
 * "remember" an earlier location from compressed facts and unmotivatedly
 * teleport back. Source: each scene's `_locationSnapshot` written by
 * postSceneWork after stateChanges settle.
 *
 * Returns null when there are no historical entries (first scene); else a
 * short bullet list ending with the current location for orientation.
 */
export function buildRecentLocationTrailBlock(recentScenes, currentLocation) {
  if (!Array.isArray(recentScenes) || recentScenes.length === 0) return null;
  const trail = recentScenes
    .map((s) => ({
      idx: s.sceneIndex,
      loc: s.stateChanges?._locationSnapshot?.name || null,
    }))
    .filter((s) => s.loc);
  if (trail.length < 1) return null;
  const lines = trail.map((t) => `- Scene ${t.idx}: ${t.loc}`);
  if (currentLocation) lines.push(`- Current: ${currentLocation}`);
  return `Recent location trail (use to keep continuity — DO NOT teleport the party back to an earlier location unless the player explicitly moves):\n${lines.join('\n')}`;
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
