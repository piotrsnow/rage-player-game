import { pickChatterLine } from '../../../../shared/domain/npcChatterPool.js';
import { buildNarrativeContext } from '../locationGraph/graphContextBuilder.js';
import { childLogger } from '../../lib/logger.js';
import { sanitizeForPrompt } from '../../../../shared/domain/playerInputSanitizer.js';
import { activeStyle } from '../../data/namingStyles/index.js';

const log = childLogger({ module: 'contextSection' });

function refTag(ref) {
  if (!ref) return '';
  const kind = ref.kind || (typeof ref === 'string' ? ref.split(':')[0] : null);
  const id = ref.id || (typeof ref === 'string' ? ref.split(':')[1] : null);
  if (!kind || !id) return '';
  return ` [ref: ${kind}:${id}]`;
}

const TOKEN_WARN_THRESHOLD = 10_000;
const TOKEN_HARD_CAP = 12_000;

const P1 = 1; // never trim
const P2 = 2; // trim last
const P3 = 3; // trim first

function estChars(text) { return typeof text === 'string' ? text.length : 0; }

/**
 * Format pre-fetched context blocks (from assembleContext) into a prompt
 * section that gets appended to the dynamic suffix of the system prompt.
 *
 * Returns `{ text, estTokens }` — callers that only need the string can
 * destructure or fall back to the `.text` property.
 */
export function buildContextSection(contextBlocks) {
  if (!contextBlocks) return { text: '', estTokens: 0 };

  const parts = [];

  if (contextBlocks.worldLore) {
    parts.push({ text: `[WORLD LORE]\n${contextBlocks.worldLore}\n[/WORLD LORE]`, priority: P1, label: 'worldLore' });
  }

  if (Array.isArray(contextBlocks.deathReveals) && contextBlocks.deathReveals.length > 0) {
    const names = contextBlocks.deathReveals.map((d) => d.name);
    parts.push({
      text: `[DEATH_REVEALS]\nDocierają wieści, że następujące postacie zginęły: ${names.join(', ')}.\nNarratuj to naturalnie — plotka, posłaniec, przeczucie. NIE wskrzeszaj tych postaci.\n[/DEATH_REVEALS]`,
      priority: P1, label: 'deathReveals',
    });
  }

  for (const [name, data] of Object.entries(contextBlocks.npcs || {})) {
    if (data && !data.startsWith('No NPC found')) {
      parts.push({ text: `[NPC: ${name}]\n${data}`, priority: P2, label: `npc:${name}` });
    }
  }

  for (const [name, data] of Object.entries(contextBlocks.quests || {})) {
    if (data && !data.startsWith('No quest found')) {
      parts.push({ text: `[Quest: ${name}]\n${data}`, priority: P2, label: `quest:${name}` });
    }
  }

  if (contextBlocks.location && !contextBlocks.location.startsWith('No location found')) {
    parts.push({ text: `[Location]\n${contextBlocks.location}`, priority: P2, label: 'location' });
  }

  if (Array.isArray(contextBlocks.locationDigests) && contextBlocks.locationDigests.length > 0) {
    const digestLines = contextBlocks.locationDigests.map(
      (d) => `- Scene ${d.sceneNum}: ${d.text}`,
    );
    parts.push({
      text: `[LOCATION HISTORY]\nWhat happened here before (most recent last):\n${digestLines.join('\n')}\nReference these naturally — acknowledge the changed state, don't repeat verbatim.\n[/LOCATION HISTORY]`,
      priority: P2, label: 'locationHistory',
    });
  }

  if (contextBlocks.locationGraph) {
    parts.push({ text: `[LOCATION CONTEXT]\n${contextBlocks.locationGraph}\n[/LOCATION CONTEXT]`, priority: P2, label: 'locationGraphCtx' });
  }

  for (const [topic, data] of Object.entries(contextBlocks.codex || {})) {
    if (data && !data.startsWith('No codex entry')) {
      parts.push({ text: `[Codex: ${topic}]\n${data}`, priority: P2, label: `codex:${topic}` });
    }
  }

  if (contextBlocks.memory && !contextBlocks.memory.startsWith('No relevant')) {
    parts.push({ text: `[Campaign Memory]\n${contextBlocks.memory}`, priority: P2, label: 'memory' });
  }

  if (contextBlocks.travelFailure) {
    parts.push({
      text: `[TRAVEL_FAILURE]\nGracz próbował odbyć daleką podróż, ale nie może — powód: "${sanitizeForPrompt(contextBlocks.travelFailure.reason, 200)}"\nOpisz kolorową, zabawną porażkę podróży. Postać wyrusza ale coś ją powstrzymuje.\nBEZWZGLĘDNE ZASADY:\n- NIE emituj stateChanges.currentLocation (postać zostaje w miejscu)\n- NIE twórz nowych lokacji\n- Scena powinna być krótka i humorystyczna\n- Zakończ scenę powrotem postaci do punktu wyjścia\n[/TRAVEL_FAILURE]`,
      priority: P1, label: 'travelFailure',
    });
  }

  if (contextBlocks.livingWorld) {
    const lw = contextBlocks.livingWorld;

    // P1 — core Living World header + NPCs at location
    const coreLines = [];
    if (lw.locationName) {
      const typeTag = lw.locationType ? ` (${lw.locationType})` : '';
      const locRef = lw.locationRef ? ` [ref: ${lw.locationRef}]` : '';
      coreLines.push(`Canonical location: ${lw.locationName}${locRef}${typeTag}`);
    }

    if (lw.saturation?.level === 'tight') {
      coreLines.push('');
      coreLines.push('WORLD IS NEARLY FULL — reuse existing settlements/NPCs. New creation disallowed unless narratively impossible.');
    } else if (lw.saturation?.level === 'watch') {
      coreLines.push('');
      coreLines.push('Prefer existing settlements/NPCs. New only if player deliberately seeks unknown territory.');
    }

    if (lw.npcs?.length || lw.backgroundCount > 0) {
      coreLines.push('');
      coreLines.push(`## NPCS AT CURRENT LOCATION`);
      if (lw.npcs?.length) {
        coreLines.push(`Key characters already here (USE THEIR NAMES when relevant, DO NOT introduce duplicates). Use [id: ...] in stateChanges.npcs.campaignNpcId and npcMemoryUpdates.campaignNpcId:`);
        for (const n of lw.npcs) {
          const bits = [n.name];
          if (n.id) bits.push(`[id: ${n.id}]`);
          if (n.role) bits.push(`(${n.role})`);
          if (n.category) bits.push(`[${n.category}]`);
          if (n.paused) bits.push('[recently away]');
          coreLines.push(`- ${bits.join(' ')}`);
          if (n.pendingIntroHint) {
            coreLines.push(`  * JUST ARRIVED — ${n.name} przychodzi do gracza z wiadomością: ${n.pendingIntroHint}`);
          }
        }
      }
      if (lw.backgroundCount > 0 || lw.backgroundLabel) {
        const label = lw.backgroundLabel || 'mieszkaniec';
        const count = lw.backgroundCount > 0 ? `${lw.backgroundCount}+ ` : '';
        coreLines.push(
          `Background population (${count}${label}): describe COLLECTIVELY as generic "${label}". ` +
          `DO NOT name or introduce individual CampaignNPC records for them. ONLY promote a background ` +
          `NPC to a named WorldNPC if the player explicitly asks their name or interacts substantively ` +
          `across multiple turns.`,
        );
      }
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
      coreLines.push(`Party companions travelling with player: ${compList}`);
      coreLines.push(`(Companions speak in-character and react to events. NPC voice derives from personality — not narrator voice sliders.)`);
    }

    if (lw.currentBiome) {
      const cb = lw.currentBiome;
      const named = cb.name ? `${cb.name} (${cb.biome})` : cb.biome;
      coreLines.push('');
      coreLines.push(`## [CURRENT BIOME] — ${named}; baseline danger: ${cb.danger}. Ground narration in this terrain (vegetation, sounds, footing) — don't describe a different biome.`);
    }

    if (lw.recentEvents?.length) {
      coreLines.push('Recent world events at this location:');
      for (const e of lw.recentEvents) {
        const when = e.at ? new Date(e.at).toISOString().slice(0, 10) : '';
        const tag = `[${e.type}${when ? ` ${when}` : ''}]`;
        coreLines.push(`- ${tag} ${e.blurb || ''}`.trim());
      }
    }

    if (lw.encounter && (lw.encounter.mode !== 'neutral' || lw.encounter.vendettaActive)) {
      const enc = lw.encounter;
      coreLines.push('');
      coreLines.push(`Reputation mode: ${enc.mode} (intensity ${enc.intensity})`);
      if (lw.reputation?.rows?.length) {
        const scopeSummary = lw.reputation.rows
          .map((r) => `${r.scope}${r.scopeKey ? `:${r.scopeKey}` : ''}=${r.score}(${r.label || 'neutral'})`)
          .join(', ');
        coreLines.push(`Scopes: ${scopeSummary}`);
      }
      if (enc.bountyAmount > 0) coreLines.push(`Active bounty: ${enc.bountyAmount} SK.`);
      if (enc.narrativeHint) coreLines.push(`Hint: ${enc.narrativeHint}`);
      if (enc.vendettaActive) {
        coreLines.push('⚠ VENDETTA MODE — frakcje mogą aktywnie tropić/atakować. Nie neutralizuj tego samowolnie: tylko atonement quest lub wygaśnięcie (2 tyg.) kończy stan.');
      }
    }

    if (coreLines.length) {
      parts.push({ text: `[Living World]\n${coreLines.join('\n')}`, priority: P1, label: 'lwCore' });
    }

    // P2 — NPC hearsay knowledge
    if (Array.isArray(lw.hearsayByNpc) && lw.hearsayByNpc.length > 0) {
      const hLines = ['## [NPC_KNOWLEDGE] — miejsca, o których każdy NPC MOŻE mówić'];
      hLines.push('Jeśli gracz pyta o miejsce, NPC może ujawnić TYLKO lokacje z własnej listy. Inne miejsca: NPC mówi "nie wiem" lub spekuluje bez szczegółów. Gdy NPC faktycznie ujawnia lokację, emit `stateChanges.locationMentioned: [{locationRef, locationName, byCampaignNpcId, byNpcId}]` — copy locationRef and locationName EXACTLY from this list.');
      for (const h of lw.hearsayByNpc) {
        const npcIdTag = h.campaignNpcId ? ` [id: ${h.campaignNpcId}]` : '';
        hLines.push(`- ${h.npcName}${npcIdTag} wie o:`);
        for (const loc of h.locations) {
          const danger = loc.danger && loc.danger !== 'safe' ? ` ⚠ ${loc.danger}` : '';
          const rt = loc.ref ? ` [ref: ${loc.ref}]` : `[id: ${loc.id}]`;
          hLines.push(`  · ${loc.name} (${loc.type}${danger}) ${rt}`);
        }
      }
      parts.push({ text: hLines.join('\n'), priority: P2, label: 'npcKnowledge' });
    }

    // P2 — NPC memory
    if (Array.isArray(lw.memoryByNpc) && lw.memoryByNpc.length > 0) {
      const mLines = ['## [NPC_MEMORY] — co każdy NPC wie, pamięta i uważa'];
      mLines.push('Każdy NPC ma stałe przekonania + osobiste doświadczenia. Część jest publiczna, część NPC ujawni tylko zaufanej osobie lub przy mocnej perswazji. Nie powtarzaj dosłownie — zaadaptuj do stylu NPC. Prefiks `(zawsze)` = stałe przekonanie / baseline; `(ta kampania)` = coś, co NPC PRZEŻYŁ z graczem w trakcie tej rozgrywki (zawsze bierz pod uwagę zanim wygenerujesz dialog). Jeśli nowe wydarzenie w scenie kształtuje dalszy obraz NPC — emit `npcMemoryUpdates`.');
      for (const b of lw.memoryByNpc) {
        const npcIdTag = b.campaignNpcId ? ` [id: ${b.campaignNpcId}]` : '';
        mLines.push(`- ${b.npcName}${npcIdTag}:`);
        for (const entry of b.entries) {
          const tag = entry.source === 'campaign_current' ? '(ta kampania)'
            : entry.source === 'baseline' ? '(zawsze)'
            : typeof entry.source === 'string' && entry.source.startsWith('campaign:') ? '(poprzednia kampania)'
            : `(${entry.source})`;
          mLines.push(`  · ${tag} ${entry.content}`);
        }
      }
      parts.push({ text: mLines.join('\n'), priority: P2, label: 'npcMemory' });
    }

    // P3 — world bounds
    if (lw.worldBoundsHint) {
      const h = lw.worldBoundsHint;
      const wbLines = ['## [WORLD BOUNDS]'];
      wbLines.push(`- N: ${h.remainingN} km · za granicą: ${h.barrierN.name} (${h.barrierN.desc})`);
      wbLines.push(`- S: ${h.remainingS} km · za granicą: ${h.barrierS.name} (${h.barrierS.desc})`);
      wbLines.push(`- E: ${h.remainingE} km · za granicą: ${h.barrierE.name} (${h.barrierE.desc})`);
      wbLines.push(`- W: ${h.remainingW} km · za granicą: ${h.barrierW.name} (${h.barrierW.desc})`);
      wbLines.push('Granice są nieprzekraczalne — gdy gracz próbuje przejść, narratuj barierę, nie pozwól mu jej minąć. Nowe lokacje poza granicami są odrzucane przez silnik.');
      parts.push({ text: wbLines.join('\n'), priority: P3, label: 'worldBounds' });
    }

    // P3 — seeded settlements
    if (lw.seededSettlements?.entries?.length) {
      const sLines = ['## SEEDED SETTLEMENTS (reuse these — do NOT invent new hamlets/villages/towns/cities/capitals)'];
      for (const s of lw.seededSettlements.entries) {
        const stag = s.isCapital ? ' [GLOBAL CAPITAL]' : '';
        const desc = s.description ? ` — ${s.description}` : '';
        const sRef = s.id ? ` [ref: world:${s.id}]` : '';
        sLines.push(`- ${s.name}${sRef} (${s.type}, ~${s.distanceKm} km away)${stag}${desc}`);
      }
      const caps = lw.seededSettlements.caps;
      if (caps) {
        const capParts = [];
        for (const [type, n] of Object.entries(caps)) {
          if (typeof n === 'number' && n > 0) capParts.push(`${n} ${type}`);
        }
        if (capParts.length > 0) {
          sLines.push(`Campaign seed: ${capParts.join(', ')} (plus global capital Yeralden). Settlements are creation-time-only — new settlement types emitted mid-play will be silently rejected.`);
        }
      }
      parts.push({ text: sLines.join('\n'), priority: P3, label: 'seededSettlements' });
    }

    // P3 — sublocations
    if (lw.settlement) {
      const s = lw.settlement;
      const slLines = [`## SUBLOCATIONS IN ${s.parentName} (${s.locationType})`];
      const fmt = (c) => `${c.canonicalName}${c.id ? ` [ref: world:${c.id}]` : ''}${c.slotType ? ` [${c.slotType}]` : ''}`;
      if (s.budget.filled.required.length) slLines.push(`Required (always present): ${s.budget.filled.required.map(fmt).join(', ')}`);
      if (s.budget.filled.optional.length) slLines.push(`Optional filled: ${s.budget.filled.optional.map(fmt).join(', ')}`);
      if (s.budget.filled.custom.length) slLines.push(`Custom (unique narrative): ${s.budget.filled.custom.map(fmt).join(', ')}`);
      if (s.budget.openOptional.length) slLines.push(`Open optional slots (narrative hint, not a budget): ${s.budget.openOptional.join(', ')}`);
      slLines.push(`When introducing a new sublocation: emit slotType matching an open optional slot OR use a narratively distinctive custom name (e.g. ${activeStyle.sublocationExamples.good}). Generic names like ${activeStyle.sublocationExamples.bad} will be rejected.`);
      parts.push({ text: slLines.join('\n'), priority: P3, label: 'sublocations' });
    }

    // P3 — ambient chatter
    if (lw.npcs?.length) {
      const npcList = lw.npcs
        .map((n) => `${n.name}${n.role ? ` (${n.role})` : ''}${n.paused ? ' [recently away]' : ''}`)
        .join(', ');
      const chatLines = [`Persistent NPCs here: ${npcList}`];
      chatLines.push('Ambient chatter (optional — use at most one to color the scene):');
      for (const n of lw.npcs.slice(0, 3)) {
        const line = pickChatterLine({ role: n.role, personality: n.role, disposition: 0 });
        if (line) chatLines.push(`  • ${n.name} might say: "${line}"`);
      }
      parts.push({ text: chatLines.join('\n'), priority: P3, label: 'ambientChatter' });
    }

    // P3 — DM agent memory + pending hooks (trim hooks to top-2)
    if (lw.dmAgent) {
      const dm = lw.dmAgent;
      const dmLines = [];
      if (dm.dmMemory?.length) {
        dmLines.push('DM memory (what you planned / introduced / waiting on):');
        for (const entry of dm.dmMemory) {
          const tag = entry.status ? `[${entry.status}]` : '';
          const when = entry.plannedFor ? ` (for: ${entry.plannedFor})` : '';
          dmLines.push(`- ${tag} ${entry.summary}${when}`.trim());
        }
      }
      if (dm.pendingHooks?.length) {
        dmLines.push('');
        dmLines.push('Pending hooks (weave in when timing fits — do not force):');
        for (const hook of dm.pendingHooks.slice(0, 2)) {
          const tag = `[${hook.priority || 'normal'} ${hook.kind || 'generic'}]`;
          const when = hook.idealTiming ? ` (timing: ${hook.idealTiming})` : '';
          dmLines.push(`- ${tag} ${hook.summary}${when}`.trim());
        }
      }
      if (dmLines.length) {
        parts.push({ text: dmLines.join('\n'), priority: P3, label: 'dmAgent' });
      }
    }

    // P1 — MOVEMENT block
    if (lw.travel) {
      const t = lw.travel;
      const tLines = ['## [MOVEMENT]'];

      if (t.unresolved) {
        tLines.push(
          `Gracz mówi że chce iść do "${t.targetName}", ale ta lokacja nie jest mu znana (nie była odwiedzona ani wspomniana przez NPC). ` +
          `Narratuj dezorientację — postać nie wie gdzie to jest, błądzi lub pyta o drogę. ` +
          `NIE emituj \`stateChanges.currentLocation\` (drop). NIE twórz nowej lokacji.`,
        );
      } else if (t.kind === 'travel' && !t.targetInFog) {
        tLines.push(
          `Gracz mówi że chce iść do "${t.targetName}", ale ta lokacja nie jest mu znana. ` +
          `Narratuj dezorientację — postać nie wie gdzie to jest. NIE emituj \`stateChanges.currentLocation\`.`,
        );
      } else {
        const km = (t.distanceKm ?? 0).toFixed(2);
        const fromB = t.fromBiome ? (t.fromBiome.name || t.fromBiome.biome) : '?';
        const toB = t.toBiome ? (t.toBiome.name || t.toBiome.biome) : '?';
        const hasRouteFamiliarity = t.kind === 'travel' && t.routeFamiliarity;
        const tc = hasRouteFamiliarity ? (t.routeFamiliarity.traversalCount ?? 0) : null;
        const familiarTag = tc >= 3 ? ` [familiar (${tc}x) — compress travel]` : tc === 0 ? ' [first time — describe richly]' : '';
        if (t.kind === 'travel') {
          tLines.push(`Trasa: ${t.fromName}${refTag(t.fromRef)} (${fromB}) → ${t.targetName}${refTag(t.targetRef)} (${toB}), ${km} km.${familiarTag}`);
        } else {
          tLines.push(`Trasa: ${t.fromName}${refTag(t.fromRef)} (${fromB}) → punkt (${t.toX.toFixed(2)}, ${t.toY.toFixed(2)}) (${toB}), ${km} km.${familiarTag}`);
        }
        if (t.biomeTransitions?.length) {
          const transitions = t.biomeTransitions
            .map((tr) => `${(tr.fromBiome.name || tr.fromBiome.biome)} → ${(tr.toBiome.name || tr.toBiome.biome)} po ${tr.atKm.toFixed(2)} km`)
            .join('; ');
          tLines.push(`Przejścia biomów: ${transitions}.`);
        } else {
          tLines.push(`Przejść biomów brak — cała droga przez ${fromB}.`);
        }
        if (t.poisAlongPath?.length) {
          tLines.push(`POI mijane (≤250 m od trasy):`);
          for (const p of t.poisAlongPath) {
            const sideLabel = p.side === 'left' ? 'lewo' : 'prawo';
            const poiRef = p.location.kind && p.location.id ? refTag(p.location) : '';
            tLines.push(`  - ${p.location.name}${poiRef} (${p.location.locationType || 'generic'}) — po ${p.alongKm.toFixed(2)} km, ${(p.perpKm * 1000).toFixed(0)} m na ${sideLabel}`);
          }
        } else {
          tLines.push(`POI mijane: brak w 250 m promieniu trasy.`);
        }
        if (t.poisAtDestination?.length) {
          const labels = t.poisAtDestination
            .map((p) => {
              const pRef = p.location.kind && p.location.id ? refTag(p.location) : '';
              return `${p.location.name}${pRef} (${(p.distKm * 1000).toFixed(0)} m)`;
            })
            .join(', ');
          tLines.push(`POI na docelowym polu (≤250 m): ${labels}.`);
        } else {
          tLines.push(`Na docelowym polu nie ma znanego POI — gracz ląduje w pustkowiu/biomie.`);
        }
        if (t.barrierHit) {
          tLines.push(
            `⚠ BARIERA: ruch przekraczał granicę świata (${t.barrierHit.direction}). ` +
            `Za nią: ${t.barrierHit.barrier.name} — ${t.barrierHit.barrier.desc}. ` +
            `Narratuj barierę i ZATRZYMAJ gracza tuż przed nią. NIE pozwól mu przejść. ` +
            `Pozycja końcowa = punkt na granicy (clampnięty), nie poza nią.`,
          );
        }
        if (t.kind === 'travel') {
          const refInstr = t.targetRef
            ? ` AND \`stateChanges.currentLocationRef: "${t.targetRef.kind}:${t.targetRef.id}"\``
            : '';
          tLines.push(
            `Narracja: krótki opis przemarszu (1-2 zdania, wzmianka o mijanych POI jeśli były), zakończony przybyciem do ${t.targetName}. ` +
            `Emit \`stateChanges.currentLocation: "${t.targetName}"\`${refInstr}. NIE twórz nowych lokacji ani encounterów po drodze.`,
          );
        } else {
          tLines.push(
            `Narracja: krótki opis przemarszu w biomie (1-2 zdania, wzmianka o mijanych POI), zakończony zatrzymaniem w terenie. ` +
            `Emit \`stateChanges.currentX: ${t.toX.toFixed(2)}, stateChanges.currentY: ${t.toY.toFixed(2)}\`. ` +
            `Możesz wymyślić jednorazowy flavor name dla tego miejsca w \`stateChanges.currentLocation\` (np. „skraj Czarnoboru", „samotny dąb na łące") — to NIE staje się trwałą lokacją w bazie. NIE twórz \`newLocations\`.`,
          );
        }
      }
      parts.push({ text: tLines.join('\n'), priority: P1, label: 'movement' });
    } else if (contextBlocks.exitingFrom && !lw.dungeon) {
      const exitName = sanitizeForPrompt(contextBlocks.exitingFrom);
      parts.push({
        text: `## [MOVEMENT]\nGracz opuszcza lokację „${exitName}". NIE emituj currentLocation: „${exitName}". Jeśli lokacja ma rodzica (np. sublokacja budynku), emituj currentLocation = nazwa rodzica. Jeśli nie wiesz dokąd gracz zmierza — pomiń currentLocation.`,
        priority: P1,
        label: 'movement',
      });
    }

    // P1 — DUNGEON ROOM
    if (lw.dungeon) {
      const d = lw.dungeon;
      const dLines = ['## DUNGEON ROOM — DETERMINISTIC CONTENTS (NARRATE EXACTLY, DO NOT INVENT)'];
      const roomRefTag = d.roomRef ? ` [ref: ${d.roomRef}]` : '';
      dLines.push(`Room: ${d.roomName}${roomRefTag} (role: ${d.role}${d.dungeonName ? `, in: ${d.dungeonName}` : ''})`);
      if (d.theme || d.difficulty) dLines.push(`Theme: ${d.theme || '?'}, difficulty: ${d.difficulty || '?'}`);
      if (d.exits?.length) {
        dLines.push('Exits:');
        for (const e of d.exits) {
          const gate = e.gated ? ` [GATED${e.gateHint ? `: ${e.gateHint}` : ''}]` : '';
          const cleared = e.cleared ? ' (cleared earlier)' : '';
          const exitRef = e.targetRef ? ` [ref: ${e.targetRef}]` : '';
          const targetLabel = e.targetRoomName ? ` → ${e.targetRoomName}${exitRef}` : '';
          dLines.push(`  - ${e.direction}${targetLabel} (${e.targetRole})${gate}${cleared}`);
        }
      }
      if (d.trap && !d.trapSprung) {
        const dmgTxt = d.trap.damage ? `, ${d.trap.damage} damage` : '';
        dLines.push(`Trap (not yet sprung): ${d.trap.label} — DC ${d.trap.dc} ${d.trap.stat}${dmgTxt}. Effect: ${d.trap.effect}`);
      } else if (d.trapSprung) {
        dLines.push(`Trap: already sprung — narrate its aftermath if relevant, do not re-trigger.`);
      }
      if (d.enemies?.length && !d.entryCleared) {
        dLines.push(`Enemies (not yet cleared): ${d.enemies.join(', ')}`);
      } else if (d.entryCleared) {
        dLines.push(`Enemies: this room was cleared earlier — narrate signs of the prior fight, do NOT spawn the same enemies again.`);
      }
      if (d.puzzle) {
        dLines.push(`Puzzle: ${d.puzzle.label} — DC ${d.puzzle.dc} ${d.puzzle.stat}.`);
        dLines.push(`  Solution hint (for narration, do NOT hand it to the player literally): ${d.puzzle.solutionHint}`);
      }
      if (d.loot?.length && !d.lootTaken) {
        const lootList = d.loot.map((l) => `${l.name} (${l.rarity}, ${typeof l.quantity === 'string' ? l.quantity : `${l.quantity}x`}${l.category ? `, ${l.category}` : ''})`).join('; ');
        dLines.push(`Loot (hidden unless searched): ${lootList}`);
      } else if (d.lootTaken) {
        dLines.push(`Loot: already taken earlier.`);
      }
      if (d.flavorSeed) dLines.push(`Flavor seed: "${d.flavorSeed}"`);
      dLines.push('');
      dLines.push(`RULES for this dungeon room:`);
      dLines.push(`- First entry: narrate the combat encounter with the LISTED enemies ONLY. Do NOT invent extras.`);
      dLines.push(`- Trap activates on careless movement or failed ${d.trap?.stat || 'Zręczność'} check. Narrate once, then mark \`stateChanges.dungeonRoom.trapSprung = true\`.`);
      dLines.push(`- Loot stays hidden until searched. On reveal, add entries to \`stateChanges.newItems\` and mark \`stateChanges.dungeonRoom.lootTaken = true\`.`);
      dLines.push(`- Player may act creatively (smash walls, burn webs) — allow the improvisation, BUT DO NOT create new rooms, enemies, traps, or loot.`);
      dLines.push(`- After combat resolves (all listed enemies defeated), set \`stateChanges.dungeonRoom.entryCleared = true\`.`);
      dLines.push(`- Movement through an exit: narrate transition + set \`stateChanges.currentLocation\` to the target room's canonical name AND \`stateChanges.currentLocationRef\` to the target's [ref: ...] tag.`);
      parts.push({ text: dLines.join('\n'), priority: P1, label: 'dungeonRoom' });
    }
  }

  if (parts.length === 0) return { text: '', estTokens: 0 };

  // ── Priority-aware trimming ──
  let totalChars = parts.reduce((sum, p) => sum + estChars(p.text), 0);
  let estTokens = Math.ceil(totalChars / 4);

  if (estTokens > TOKEN_HARD_CAP) {
    const p3 = parts.filter((p) => p.priority === P3).sort((a, b) => estChars(b.text) - estChars(a.text));
    for (const item of p3) {
      if (estTokens <= TOKEN_HARD_CAP) break;
      const saved = estChars(item.text);
      item.text = '';
      totalChars -= saved;
      estTokens = Math.ceil(totalChars / 4);
      log.info({ label: item.label, savedChars: saved }, 'P3 block trimmed for token budget');
    }
  }
  if (estTokens > TOKEN_HARD_CAP) {
    const p2 = parts.filter((p) => p.priority === P2 && estChars(p.text) > 0)
      .sort((a, b) => estChars(b.text) - estChars(a.text));
    for (const item of p2) {
      if (estTokens <= TOKEN_HARD_CAP) break;
      if (item.label === 'npcMemory') {
        const memLines = item.text.split('\n');
        const header = memLines.slice(0, 2).join('\n');
        const entries = memLines.slice(2);
        const excess = (estTokens - TOKEN_HARD_CAP) * 4;
        let cut = 0;
        let chars = 0;
        for (cut = 0; cut < entries.length && chars < excess; cut++) chars += entries[cut].length + 1;
        item.text = [header, `(${cut} oldest entries trimmed)`, ...entries.slice(cut)].join('\n');
        totalChars -= chars;
        estTokens = Math.ceil(totalChars / 4);
      } else {
        const saved = estChars(item.text);
        item.text = '';
        totalChars -= saved;
        estTokens = Math.ceil(totalChars / 4);
      }
      log.info({ label: item.label }, 'P2 block trimmed for token budget');
    }
  }

  if (estTokens > TOKEN_HARD_CAP) {
    log.warn({ estTokens, totalChars }, 'Context section still over cap after P2/P3 trim');
  } else if (estTokens > TOKEN_WARN_THRESHOLD) {
    log.warn({ estTokens, totalChars }, 'Context section approaching token budget');
  }

  const surviving = parts.filter((p) => estChars(p.text) > 0).map((p) => p.text);
  let assembled = `\n── EXPANDED CONTEXT (use in your response) ──\n${surviving.join('\n\n')}`;
  assembled += `\n\n── REMINDER: Return ONLY valid JSON. Field order: diceRolls → dialogueSegments → stateChanges (last). ──`;

  estTokens = Math.ceil(assembled.length / 4);
  return { text: assembled, estTokens };
}
