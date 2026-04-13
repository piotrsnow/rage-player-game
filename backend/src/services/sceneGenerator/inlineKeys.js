/**
 * Encje, które `buildLeanSystemPrompt` umieści w "Key NPCs", "Active Quests"
 * i "ALREADY DISCOVERED" w dynamicSuffix. Używane przez `assembleContext`,
 * żeby pominąć je w EXPANDED CONTEXT i nie dublować tych samych danych.
 *
 * MUSI być zsynchronizowane z slice'ami w buildLeanSystemPrompt:
 * NPCs: alive ≠ false, sort po |disposition|, slice(0, 8)
 * Quests: quests.active.slice(0, 5)
 * Codex: world.codexSummary.slice(0, 10)
 */
export function getInlineEntityKeys(coreState) {
  const world = coreState?.world || {};
  const quests = coreState?.quests || {};

  const allNpcs = Array.isArray(world.npcs) ? world.npcs : [];
  const npcs = allNpcs
    .filter(n => n && n.alive !== false)
    .sort((a, b) => Math.abs(b.disposition || 0) - Math.abs(a.disposition || 0))
    .slice(0, 8)
    .map(n => n.name)
    .filter(Boolean);

  const activeQuests = Array.isArray(quests.active) ? quests.active : [];
  const questNames = activeQuests
    .slice(0, 5)
    .map(q => q.name)
    .filter(Boolean);

  const codexSummary = Array.isArray(world.codexSummary) ? world.codexSummary : [];
  const codexNames = codexSummary
    .slice(0, 10)
    .map(c => c.name)
    .filter(Boolean);

  return { npcs, quests: questNames, codex: codexNames };
}
