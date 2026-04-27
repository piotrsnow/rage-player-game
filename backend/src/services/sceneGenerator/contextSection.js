import { pickChatterLine } from '../../../../shared/domain/npcChatterPool.js';

/**
 * Format pre-fetched context blocks (from assembleContext) into a prompt
 * section that gets appended to the dynamic suffix of the system prompt.
 */
export function buildContextSection(contextBlocks) {
  if (!contextBlocks) return '';

  const parts = [];

  // Round A (Phase 0a) — World Lore preamble. Admin-curated canon that
  // the scene MUST respect (pantheon, factions, regional history). Placed
  // ABOVE per-scene NPC/quest/location context so the LLM anchors against
  // canonical lore first and treats everything below as this session's
  // facts.
  if (contextBlocks.worldLore) {
    parts.push(`[WORLD LORE]\n${contextBlocks.worldLore}\n[/WORLD LORE]`);
  }

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

    // Phase C — saturation hint. Rendered at the TOP of the LIVING WORLD
    // block (before NPC lists / settlements) so premium sees the reuse
    // pressure before it decides what to invent. Thresholds: <0.2 = hard
    // push, <0.5 = soft nudge. Nothing is emitted in the neutral range.
    if (lw.saturation?.level === 'tight') {
      lines.push('');
      lines.push(
        'WORLD IS NEARLY FULL — reuse existing settlements/NPCs. New creation disallowed unless narratively impossible.',
      );
    } else if (lw.saturation?.level === 'watch') {
      lines.push('');
      lines.push(
        'Prefer existing settlements/NPCs. New only if player deliberately seeks unknown territory.',
      );
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
          if (n.category) bits.push(`[${n.category}]`);
          if (n.paused) bits.push('[recently away]');
          if (n.activeGoal) bits.push(`goal: "${n.activeGoal}"`);
          lines.push(`- ${bits.join(' ')}`);
          // Round B — one-shot introduction hint, fired by the quest trigger
          // `onComplete.moveNpcToPlayer`. Tells premium the NPC just arrived
          // and has a specific piece of news. Cleared post-assembly.
          if (n.pendingIntroHint) {
            lines.push(`  * JUST ARRIVED — ${n.name} przychodzi do gracza z wiadomością: ${n.pendingIntroHint}`);
          }
        }
      }
      // Round B (Phase 4b) — NPC hearsay policy. Each key NPC gets a list
      // of locations they are authorized to reveal in dialog (own location
      // + 1-hop edges + explicit WorldNpcKnownLocation grants). Premium MUST NOT reveal
      // other locations from this NPC; processStateChanges enforces via the
      // `locationMentioned` bucket policy check.
      if (Array.isArray(lw.hearsayByNpc) && lw.hearsayByNpc.length > 0) {
        lines.push('');
        lines.push('## [NPC_KNOWLEDGE] — miejsca, o których każdy NPC MOŻE mówić');
        lines.push('Jeśli gracz pyta o miejsce, NPC może ujawnić TYLKO lokacje z własnej listy. Inne miejsca: NPC mówi "nie wiem" lub spekuluje bez szczegółów. Gdy NPC faktycznie ujawnia lokację, emit `stateChanges.locationMentioned: [{locationName, byNpcId}]` — locationName skopiowane DOKŁADNIE z tej listy.');
        for (const h of lw.hearsayByNpc) {
          lines.push(`- ${h.npcName} wie o:`);
          for (const loc of h.locations) {
            const danger = loc.danger && loc.danger !== 'safe' ? ` ⚠ ${loc.danger}` : '';
            lines.push(`  · ${loc.name} (${loc.type}${danger}) [id: ${loc.id}]`);
          }
        }
      }

      // Stage 1+2 — NPC memory. Unified block combining baseline (seeded in
      // seedWorld.js + Phase 11-promoted cross-campaign memories) with lived
      // experience from THIS campaign (CampaignNPC.experienceLog — written by
      // `npcMemoryUpdates` handler). Flavor for dialog, NOT policy-enforced.
      // Source prefix lets premium distinguish "always knew" vs "learned in
      // this playthrough".
      if (Array.isArray(lw.memoryByNpc) && lw.memoryByNpc.length > 0) {
        lines.push('');
        lines.push('## [NPC_MEMORY] — co każdy NPC wie, pamięta i uważa');
        lines.push('Każdy NPC ma stałe przekonania + osobiste doświadczenia. Część jest publiczna, część NPC ujawni tylko zaufanej osobie lub przy mocnej perswazji. Nie powtarzaj dosłownie — zaadaptuj do stylu NPC. Prefiks `(zawsze)` = stałe przekonanie / baseline; `(ta kampania)` = coś, co NPC PRZEŻYŁ z graczem w trakcie tej rozgrywki (zawsze bierz pod uwagę zanim wygenerujesz dialog). Jeśli nowe wydarzenie w scenie kształtuje dalszy obraz NPC — emit `npcMemoryUpdates`.');
        for (const b of lw.memoryByNpc) {
          lines.push(`- ${b.npcName}:`);
          for (const entry of b.entries) {
            const tag = entry.source === 'campaign_current' ? '(ta kampania)'
              : entry.source === 'baseline' ? '(zawsze)'
              : typeof entry.source === 'string' && entry.source.startsWith('campaign:') ? '(poprzednia kampania)'
              : `(${entry.source})`;
            lines.push(`  · ${tag} ${entry.content}`);
          }
        }
      }

      // Round B (Phase 4c) — WORLD BOUNDS reminder. Tells premium how much
      // room the player has in each cardinal direction before hitting the
      // edge of this campaign's worldBounds. New non-canonical locations
      // emitted beyond the boundary are silently rejected by processTopLevelEntry,
      // so this hint steers narration toward feasible directions.
      if (lw.worldBoundsHint) {
        const h = lw.worldBoundsHint;
        lines.push('');
        lines.push(`## [WORLD BOUNDS] — remaining travel room: N ${h.remainingN} km · S ${h.remainingS} km · E ${h.remainingE} km · W ${h.remainingW} km. Beyond that = edge of the known world (new locations past this boundary are rejected by the engine).`);
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

    // Phase A — SEEDED SETTLEMENTS. Lists the canonical settlements this
    // world already has (capital + per-campaign hamlets/villages/towns/cities)
    // with distance-from-current so premium prefers reuse over inventing a
    // new settlement. Mid-play settlement creation is hard-blocked in
    // processTopLevelEntry; this block is the carrot side of the rule.
    if (lw.seededSettlements?.entries?.length) {
      lines.push('');
      lines.push('## SEEDED SETTLEMENTS (reuse these — do NOT invent new hamlets/villages/towns/cities/capitals)');
      for (const s of lw.seededSettlements.entries) {
        const tag = s.isCapital ? ' [GLOBAL CAPITAL]' : '';
        const desc = s.description ? ` — ${s.description}` : '';
        lines.push(`- ${s.name} (${s.type}, ~${s.distanceKm} km away)${tag}${desc}`);
      }
      const caps = lw.seededSettlements.caps;
      if (caps) {
        const parts = [];
        for (const [type, n] of Object.entries(caps)) {
          if (typeof n === 'number' && n > 0) parts.push(`${n} ${type}`);
        }
        if (parts.length > 0) {
          lines.push(`Campaign seed: ${parts.join(', ')} (plus global capital Yeralden). Settlements are creation-time-only — new settlement types emitted mid-play will be silently rejected.`);
        }
      }
    }

    // SUBLOCATIONS — what's already inside the parent settlement. Caps were
    // dropped (sublokacje per-kampania mogą rosnąć dowolnie); the block now
    // just lists what exists + which optional slots are still narratively
    // unfilled, so premium reuses names instead of inventing duplicates.
    if (lw.settlement) {
      const s = lw.settlement;
      lines.push('');
      lines.push(`## SUBLOCATIONS IN ${s.parentName} (${s.locationType})`);
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
        lines.push(`Open optional slots (narrative hint, not a budget): ${s.budget.openOptional.join(', ')}`);
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
    // TRAVEL — emitted when the intent classifier flagged a travel target.
    // Edge = stricte zbudowana droga (bezpieczne przejście) i NIE służy ani
    // jako sygnał wiedzy NPC, ani jako preconditiona podróży — gracz może
    // iść do dowolnej fog-visible lokacji. Brak ścieżki = po prostu nikt
    // nie zbudował drogi; AI nadal narratuje montage. AI NIGDY nie tworzy
    // nowych lokacji (top-level ani dungeonów). Sublokacje wewnątrz
    // istniejącej osady są dozwolone (osobny tor `newLocations` z
    // `parentLocationName`).
    if (lw.travel) {
      const t = lw.travel;
      lines.push('');
      lines.push(`## TRAVEL`);
      if (t.targetInFog) {
        lines.push(
          `Gracz wyrusza ${t.startName} → ${t.targetName}. ` +
          `TRAVEL MONTAGE: 1-2 zdania o przebiegu drogi (atmosfera, klimat, bez encounterów) + krótka narracja przybycia do ${t.targetName}. ` +
          `Emit \`stateChanges.currentLocation: "${t.targetName}"\`. ` +
          `NIE twórz nowych lokacji ani encounterów po drodze.`,
        );
      } else {
        lines.push(
          `Gracz mówi że chce iść do "${t.targetName}", ale ta lokacja nie jest mu znana (nie była odwiedzona ani wspomniana przez NPC). ` +
          `Narratuj dezorientację — postać nie wie gdzie to jest, błądzi lub pyta o drogę. ` +
          `NIE emituj \`stateChanges.currentLocation\` (drop). NIE twórz nowej lokacji.`,
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
