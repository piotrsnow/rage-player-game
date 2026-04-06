const MAX_TIMELINE_ENTRIES = 50;
const NARRATIVE_TRUNCATE = 120;

function truncate(text, max = NARRATIVE_TRUNCATE) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export function buildHistorySummary(scenes = []) {
  const totalScenes = scenes.length;
  let diceRolls = 0;
  let successes = 0;
  let failures = 0;

  for (const scene of scenes) {
    if (scene.diceRoll) {
      diceRolls++;
      if (scene.diceRoll.success) successes++;
      else failures++;
    }
  }

  const lastScene = scenes[scenes.length - 1];
  const lastAction = lastScene?.chosenAction || null;
  const lastNarrative = truncate(lastScene?.narrative, 200);

  return { totalScenes, diceRolls, successes, failures, lastAction, lastNarrative };
}

export function buildTimeline(scenes = []) {
  const entries = [];

  const start = Math.max(0, scenes.length - MAX_TIMELINE_ENTRIES);
  for (let i = scenes.length - 1; i >= start; i--) {
    const scene = scenes[i];
    const entry = {
      index: i + 1,
      timestamp: scene.timestamp || null,
      action: scene.chosenAction || null,
      diceRoll: scene.diceRoll
        ? {
            skill: scene.diceRoll.skill,
            roll: scene.diceRoll.roll,
            target: scene.diceRoll.target || scene.diceRoll.dc,
            sl: scene.diceRoll.sl ?? 0,
            success: !!scene.diceRoll.success,
          }
        : null,
      narrativeSnippet: truncate(scene.narrative),
    };
    entries.push(entry);
  }

  return entries;
}
