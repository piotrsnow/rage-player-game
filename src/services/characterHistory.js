const MAX_TIMELINE_ENTRIES = 50;
const NARRATIVE_TRUNCATE = 120;

function truncate(text, max = NARRATIVE_TRUNCATE) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/**
 * Walks scenes from newest to oldest; returns the last non-null dice roll
 * (uses `diceRolls` last entry when present, else `diceRoll`).
 */
export function findLastDiceRollInScenes(scenes = []) {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i];
    const list = Array.isArray(s?.diceRolls) && s.diceRolls.length > 0
      ? s.diceRolls
      : (s?.diceRoll ? [s.diceRoll] : []);
    if (list.length) return list[list.length - 1] || null;
  }
  return null;
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

const ATTR_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];
const RECENT_ACTIONS_CAP = 15;

export function buildReputationDigest(character, scenes, campaign) {
  const safe = character || {};

  const topSkills = Object.entries(safe.skills || {})
    .map(([name, data]) => ({
      name,
      level: typeof data === 'object' ? (data.level || 0) : (data || 0),
    }))
    .sort((a, b) => b.level - a.level)
    .slice(0, 5)
    .filter((s) => s.level > 0);

  const attrs = safe.attributes || {};
  const attrObj = {};
  for (const k of ATTR_KEYS) {
    attrObj[k] = Number(attrs[k] ?? 0);
  }

  const titles = Array.isArray(safe.activeTitle)
    ? [safe.activeTitle]
    : (safe.activeTitle ? [safe.activeTitle] : []);

  const charPayload = {
    name: safe.name || 'Nieznany',
    species: safe.species || 'człowiek',
    gender: safe.gender || 'nieznana',
    level: safe.characterLevel || safe.level || 1,
    attributes: attrObj,
    topSkills,
    factions: safe.factions || {},
    backstory: typeof safe.backstory === 'string' ? safe.backstory.slice(0, 600) : '',
    titles,
  };

  const sceneArr = Array.isArray(scenes) ? scenes : [];
  const recentActions = [];
  const start = Math.max(0, sceneArr.length - RECENT_ACTIONS_CAP);
  for (let i = sceneArr.length - 1; i >= start; i--) {
    const s = sceneArr[i];
    if (!s?.chosenAction) continue;
    const entry = { action: truncate(s.chosenAction, 100) };
    if (s.diceRoll) {
      entry.roll = {
        skill: s.diceRoll.skill || '',
        success: !!s.diceRoll.success,
      };
    }
    recentActions.push(entry);
  }

  const quests = [];
  const questSrc = campaign?.quests || [];
  for (const q of questSrc) {
    if (!q?.name) continue;
    quests.push({ name: q.name, completed: !!q.completed });
  }

  const digestPayload = {
    sceneCount: sceneArr.length,
    quests,
    recentActions,
  };

  return { character: charPayload, campaignDigest: digestPayload };
}
