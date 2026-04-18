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
    if (lw.locationName) lines.push(`Canonical location: ${lw.locationName}`);
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
      const annotatedNpcs = lw.npcs.filter((n) => n.activeGoal || n.recentMilestones?.length);
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
    if (lines.length) {
      parts.push(`[Living World]\n${lines.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  return `\n── EXPANDED CONTEXT (use in your response) ──\n${parts.join('\n\n')}`;
}
