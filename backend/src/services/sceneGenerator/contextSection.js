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

  if (parts.length === 0) return '';
  return `\n── EXPANDED CONTEXT (use in your response) ──\n${parts.join('\n\n')}`;
}
