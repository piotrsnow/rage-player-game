import { pickChatterLine } from '../../../../src/data/npcChatterPool.js';

/**
 * Format pre-fetched context blocks (from assembleContext) into a prompt
 * section that gets appended to the dynamic suffix of the system prompt.
 */
export function buildContextSection(contextBlocks) {
  if (!contextBlocks) return '';

  const parts = [];

  // NPCs
  for (const [name, data] of Object.entries(contextBlocks.npcs || {})) {
    if (data && !data.startsWith('No NPC found')) {
      parts.push(`[NPC: ${name}]\n${data}`);
    }
  }

  // Quests
  for (const [name, data] of Object.entries(contextBlocks.quests || {})) {
    if (data && !data.startsWith('No quest found')) {
      parts.push(`[Quest: ${name}]\n${data}`);
    }
  }

  // Location
  if (contextBlocks.location && !contextBlocks.location.startsWith('No location found')) {
    parts.push(`[Location]\n${contextBlocks.location}`);
  }

  // Codex
  for (const [topic, data] of Object.entries(contextBlocks.codex || {})) {
    if (data && !data.startsWith('No codex entry')) {
      parts.push(`[Codex: ${topic}]\n${data}`);
    }
  }

  // Memory search results
  if (contextBlocks.memory && !contextBlocks.memory.startsWith('No relevant')) {
    parts.push(`[Campaign Memory]\n${contextBlocks.memory}`);
  }

  // Living World — present canonical NPCs + recent world events at the
  // current location. Only emitted when the campaign opts into the feature
  // (assembleContext returns null otherwise, so this branch is a no-op for
  // legacy campaigns).
  if (contextBlocks.livingWorld) {
    const lw = contextBlocks.livingWorld;
    const lines = [];
    if (lw.locationName) {
      const typeTag = lw.locationType ? ` (${lw.locationType})` : '';
      lines.push(`Canonical location: ${lw.locationName}${typeTag}`);
    }

    // Phase 7 — NPCS AT CURRENT LOCATION. Instruct premium to reuse named
    // characters and treat background population as collective flavor.
    if (lw.npcs?.length || lw.backgroundCount > 0) {
      lines.push('');
      lines.push(`## NPCS AT CURRENT LOCATION`);
      if (lw.npcs?.length) {
        lines.push(`Key characters already here (USE THEIR NAMES when relevant, DO NOT introduce duplicates):`);
        for (const n of lw.npcs) {
          const bits = [n.name];
          if (n.role) bits.push(`(${n.role})`);
          if (n.paused) bits.push('[recently away]');
          if (n.activeGoal) bits.push(`goal: "${n.activeGoal}"`);
          lines.push(`- ${bits.join(' ')}`);
        }
      }
      if (lw.backgroundCount > 0 || lw.backgroundLabel) {
        const label = lw.backgroundLabel || 'mieszkaniec';
        const count = lw.backgroundCount > 0 ? `${lw.backgroundCount}+ ` : '';
        lines.push(
          `Background population (${count}${label}): describe COLLECTIVELY as generic "${label}". ` +
          `DO NOT name or introduce individual CampaignNPC records for them. ONLY promote a background ` +
          `NPC to a named WorldNPC if the player explicitly asks their name or interacts substantively ` +
          `across multiple turns.`,
        );
      }
    }

    // Phase 7 — SUBLOCATIONS AVAILABLE. Shows parent settlement's slot state
    // so premium knows what already exists, what optional slots are open,
    // and when the sublocation hard cap is approaching.
    if (lw.settlement) {
      const s = lw.settlement;
      lines.push('');
      lines.push(`## SUBLOCATIONS IN ${s.parentName} (${s.locationType} — ${s.budget.capacityRemaining}/${s.budget.filled.required.length + s.budget.filled.optional.length + s.budget.filled.custom.length + s.budget.capacityRemaining} slots free)`);
      const fmt = (c) => `${c.canonicalName}${c.slotType ? ` [${c.slotType}]` : ''}`;
      if (s.budget.filled.required.length) {
        lines.push(`Required (always present): ${s.budget.filled.required.map(fmt).join(', ')}`);
      }
      if (s.budget.filled.optional.length) {
        lines.push(`Optional filled: ${s.budget.filled.optional.map(fmt).join(', ')}`);
      }
      if (s.budget.filled.custom.length) {
        lines.push(`Custom (unique narrative): ${s.budget.filled.custom.map(fmt).join(', ')}`);
      }
      if (s.budget.openOptional.length) {
        lines.push(`Open optional slots: ${s.budget.openOptional.join(', ')} (budget ${s.budget.optionalBudgetRemaining} left)`);
      } else {
        lines.push(`Optional slots: FULL — only custom additions allowed`);
      }
      lines.push(
        `When introducing a new sublocation: emit slotType matching an open optional slot OR use ` +
        `a narratively distinctive custom name (e.g. "Wieża Maga", "Chata Starej Wiedźmy"). ` +
        `Generic names like "dom" or "chata" will be rejected.`,
      );
    }

    if (lw.companions?.length) {
      const compList = lw.companions
        .map((c) => {
          const parts2 = [c.name];
          if (c.role) parts2.push(`(${c.role})`);
          parts2.push(`loyalty:${c.loyalty}`);
          return parts2.join(' ');
        })
        .join(', ');
      lines.push(`Party companions travelling with player: ${compList}`);
      lines.push(`(Companions speak in-character and react to events. NPC voice derives from personality — not narrator voice sliders.)`);
    }
    if (lw.npcs?.length) {
      const npcList = lw.npcs
        .map((n) => `${n.name}${n.role ? ` (${n.role})` : ''}${n.paused ? ' [recently away]' : ''}`)
        .join(', ');
      lines.push(`Persistent NPCs here: ${npcList}`);

      // Phase 5 — per-NPC goal + recent activity + arrival flag, for NPCs
      // whose goal targets this campaign. Premium sees "Altmar just arrived
      // with intent X" and narrates naturally.
      // G6 — ambient chatter for NPCs without active goals/radiants.
      // Purely flavor: one line per idle NPC, premium decides whether to
      // weave it in. Zero AI cost, data-only lookup.
      const ambientIdleNpcs = lw.npcs.filter((n) => !n.activeGoal && !n.recentMilestones?.length && !n.radiantOffer);
      if (ambientIdleNpcs.length > 0) {
        lines.push('Ambient chatter (optional — use at most one to color the scene):');
        for (const n of ambientIdleNpcs.slice(0, 3)) {
          const line = pickChatterLine({ role: n.role, personality: n.role, disposition: 0 });
          if (line) lines.push(`  • ${n.name} might say: "${line}"`);
        }
      }

      const annotatedNpcs = lw.npcs.filter((n) => n.activeGoal || n.recentMilestones?.length || n.radiantOffer);
      for (const n of annotatedNpcs) {
        const parts = [];
        if (n.recentlyArrived) parts.push('JUST ARRIVED at this location');
        if (n.activeGoal) parts.push(`active goal: "${n.activeGoal}"`);
        if (n.recentMilestones?.length) {
          const ms = n.recentMilestones
            .map((m) => m.note || '')
            .filter(Boolean)
            .join(' → ');
          if (ms) parts.push(`recent activity: ${ms}`);
        }
        if (n.radiantOffer?.template) {
          parts.push(`radiant quest available: template="${n.radiantOffer.template}" — MAY be offered to the player if interaction is natural; on offer emit stateChanges.newQuests entry with source:"npc_radiant"`);
        }
        if (parts.length > 0) {
          lines.push(`  • ${n.name}: ${parts.join('; ')}`);
        }
      }
    }
    if (lw.recentEvents?.length) {
      lines.push('Recent world events at this location:');
      for (const e of lw.recentEvents) {
        const when = e.at ? new Date(e.at).toISOString().slice(0, 10) : '';
        const tag = `[${e.type}${when ? ` ${when}` : ''}]`;
        lines.push(`- ${tag} ${e.blurb || ''}`.trim());
      }
    }
    // Phase 4 — DM agent memory + pending hooks. Gives premium continuity
    // across scenes: what you planned, introduced, left unresolved, and
    // which seeds are waiting for the right moment.
    if (lw.dmAgent) {
      const dm = lw.dmAgent;
      if (dm.dmMemory?.length) {
        lines.push('');
        lines.push('DM memory (what you planned / introduced / waiting on):');
        for (const entry of dm.dmMemory) {
          const tag = entry.status ? `[${entry.status}]` : '';
          const when = entry.plannedFor ? ` (for: ${entry.plannedFor})` : '';
          lines.push(`- ${tag} ${entry.summary}${when}`.trim());
        }
      }
      if (dm.pendingHooks?.length) {
        lines.push('');
        lines.push('Pending hooks (weave in when timing fits — do not force):');
        for (const hook of dm.pendingHooks) {
          const tag = `[${hook.priority || 'normal'} ${hook.kind || 'generic'}]`;
          const when = hook.idealTiming ? ` (timing: ${hook.idealTiming})` : '';
          lines.push(`- ${tag} ${hook.summary}${when}`.trim());
        }
      }
    }
    // Phase 3 — reputation context + encounter mode hint. Only emitted when
    // the player has any non-neutral reputation or a vendetta is active.
    if (lw.encounter && (lw.encounter.mode !== 'neutral' || lw.encounter.vendettaActive)) {
      const enc = lw.encounter;
      lines.push('');
      lines.push(`Reputation mode: ${enc.mode} (intensity ${enc.intensity})`);
      if (lw.reputation?.rows?.length) {
        const scopeSummary = lw.reputation.rows
          .map((r) => `${r.scope}${r.scopeKey ? `:${r.scopeKey}` : ''}=${r.score}(${r.label || 'neutral'})`)
          .join(', ');
        lines.push(`Scopes: ${scopeSummary}`);
      }
      if (enc.bountyAmount > 0) {
        lines.push(`Active bounty: ${enc.bountyAmount} SK.`);
      }
      if (enc.narrativeHint) {
        lines.push(`Hint: ${enc.narrativeHint}`);
      }
      if (enc.vendettaActive) {
        lines.push('⚠ VENDETTA MODE — frakcje mogą aktywnie tropić/atakować. Nie neutralizuj tego samowolnie: tylko atonement quest lub wygaśnięcie (2 tyg.) kończy stan.');
      }
    }
    // Phase 7 — TRAVEL CONTEXT. Emitted when the player's action classifies
    // as a travel intent and we can resolve the path. Tells premium to narrate
    // the whole trip in ONE scene via existing waypoints; forbids inventing
    // new locations between them unless the detour is long (Iteracja 2).
    if (lw.travel) {
      const t = lw.travel;
      lines.push('');
      if (t.kind === 'path') {
        const waypointList = t.waypoints.map((w) => `${w.name} (${w.locationType})`).join(' → ');
        lines.push(`## TRAVEL CONTEXT`);
        lines.push(`Player is travelling ${t.startName} → ${t.targetName}.`);
        lines.push(`Known path (${t.hops} hops, ~${t.totalDistance} km, difficulty: ${t.difficulty}): ${waypointList}`);
        if (t.terrains?.length) {
          lines.push(`Terrain: ${t.terrains.join(', ')}`);
        }
        if (t.detour === 'direct' || t.detour === 'sensible') {
          lines.push(
            `Narrate the entire trip in ONE scene, passing through each waypoint briefly. ` +
            `DO NOT invent new intermediate locations. End the scene at ${t.targetName}. ` +
            `Set stateChanges.currentLocation = "${t.targetName}".`,
          );
        } else {
          lines.push(
            `This is a LONG path (${t.detour}). The player may want a shortcut — ` +
            `if they have explicitly stated a shortcut intent, you may generate 1-2 new intermediate ` +
            `locations via newLocations (directionFromCurrent + travelDistance). Otherwise follow the known path.`,
          );
        }
        if (t.candidateEvents?.length) {
          lines.push('');
          lines.push('Candidate travel beats (weave 1-2 into the narrative, prefer variety):');
          for (const cand of t.candidateEvents) {
            lines.push(`  - [${cand.type}@${cand.at}] ${cand.hook}`);
          }
        }
      } else if (t.kind === 'unknown_target') {
        lines.push(`## TRAVEL INTENT`);
        lines.push(`Player wants to travel to "${t.targetName}" but has not yet discovered that location.`);
        lines.push(
          `Narrate the player setting out; either: (a) they realize they don't know the way and ask around, ` +
          `(b) they travel blindly and after some wandering end up in a new location — emit that new location ` +
          `in newLocations with directionFromCurrent + travelDistance. Do NOT arrive at "${t.targetName}" directly.`,
        );
      } else if (t.kind === 'no_path') {
        lines.push(`## TRAVEL INTENT`);
        lines.push(`Player wants to travel to "${t.targetName}" but no known path connects it from ${t.startName}.`);
        lines.push(
          `Narrate them setting off through unfamiliar terrain — emit 1-2 new intermediate locations ` +
          `via newLocations (directionFromCurrent + travelDistance), then arrive at ${t.targetName}.`,
        );
      }
    }

    // Phase 7 — DUNGEON ROOM. Deterministic contents. Premium narrates
    // these EXACTLY — no inventing enemies, traps, loot, or exits. This
    // block replaces free-form combat/loot generation when the player is
    // inside a dungeon room.
    if (lw.dungeon) {
      const d = lw.dungeon;
      lines.push('');
      lines.push(`## DUNGEON ROOM — DETERMINISTIC CONTENTS (NARRATE EXACTLY, DO NOT INVENT)`);
      lines.push(`Room: ${d.roomName} (role: ${d.role}${d.dungeonName ? `, in: ${d.dungeonName}` : ''})`);
      if (d.theme || d.difficulty) {
        lines.push(`Theme: ${d.theme || '?'}, difficulty: ${d.difficulty || '?'}`);
      }

      if (d.exits?.length) {
        lines.push('Exits:');
        for (const e of d.exits) {
          const gate = e.gated ? ` [GATED${e.gateHint ? `: ${e.gateHint}` : ''}]` : '';
          const cleared = e.cleared ? ' (cleared earlier)' : '';
          const targetLabel = e.targetRoomName ? ` → ${e.targetRoomName}` : '';
          lines.push(`  - ${e.direction}${targetLabel} (${e.targetRole})${gate}${cleared}`);
        }
      }

      if (d.trap && !d.trapSprung) {
        const dmgTxt = d.trap.damage ? `, ${d.trap.damage} damage` : '';
        lines.push(`Trap (not yet sprung): ${d.trap.label} — DC ${d.trap.dc} ${d.trap.stat}${dmgTxt}. Effect: ${d.trap.effect}`);
      } else if (d.trapSprung) {
        lines.push(`Trap: already sprung — narrate its aftermath if relevant, do not re-trigger.`);
      }

      if (d.enemies?.length && !d.entryCleared) {
        lines.push(`Enemies (not yet cleared): ${d.enemies.join(', ')}`);
      } else if (d.entryCleared) {
        lines.push(`Enemies: this room was cleared earlier — narrate signs of the prior fight, do NOT spawn the same enemies again.`);
      }

      if (d.puzzle) {
        lines.push(`Puzzle: ${d.puzzle.label} — DC ${d.puzzle.dc} ${d.puzzle.stat}.`);
        lines.push(`  Solution hint (for narration, do NOT hand it to the player literally): ${d.puzzle.solutionHint}`);
      }

      if (d.loot?.length && !d.lootTaken) {
        const lootList = d.loot.map((l) => `${l.name} (${l.rarity}, ${typeof l.quantity === 'string' ? l.quantity : `${l.quantity}x`}${l.category ? `, ${l.category}` : ''})`).join('; ');
        lines.push(`Loot (hidden unless searched): ${lootList}`);
      } else if (d.lootTaken) {
        lines.push(`Loot: already taken earlier.`);
      }

      if (d.flavorSeed) {
        lines.push(`Flavor seed: "${d.flavorSeed}"`);
      }

      lines.push('');
      lines.push(`RULES for this dungeon room:`);
      lines.push(`- First entry: narrate the combat encounter with the LISTED enemies ONLY. Do NOT invent extras.`);
      lines.push(`- Trap activates on careless movement or failed ${d.trap?.stat || 'Zręczność'} check. Narrate once, then mark \`stateChanges.dungeonRoom.trapSprung = true\`.`);
      lines.push(`- Loot stays hidden until searched. On reveal, add entries to \`stateChanges.newItems\` and mark \`stateChanges.dungeonRoom.lootTaken = true\`.`);
      lines.push(`- Player may act creatively (smash walls, burn webs) — allow the improvisation, BUT DO NOT create new rooms, enemies, traps, or loot.`);
      lines.push(`- After combat resolves (all listed enemies defeated), set \`stateChanges.dungeonRoom.entryCleared = true\`.`);
      lines.push(`- Movement through an exit: narrate transition + set \`stateChanges.currentLocation\` to the target room's canonical name.`);
    }

    if (lines.length) {
      parts.push(`[Living World]\n${lines.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  return `\n── EXPANDED CONTEXT (use in your response) ──\n${parts.join('\n\n')}`;
}
