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
    }
    if (lw.recentEvents?.length) {
      lines.push('Recent world events at this location:');
      for (const e of lw.recentEvents) {
        const when = e.at ? new Date(e.at).toISOString().slice(0, 10) : '';
        const tag = `[${e.type}${when ? ` ${when}` : ''}]`;
        lines.push(`- ${tag} ${e.blurb || ''}`.trim());
      }
    }
    if (lines.length) {
      parts.push(`[Living World]\n${lines.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  return `\n── EXPANDED CONTEXT (use in your response) ──\n${parts.join('\n\n')}`;
}
