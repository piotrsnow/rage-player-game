/**
 * Group system-only chat messages by scene timestamp boundaries.
 *
 * Rationale: chat messages don't carry sceneId (except DM messages), but every
 * message has `timestamp: Date.now()` and every scene has a timestamp too.
 * For each system message we find the latest scene with `scene.timestamp <=
 * msg.timestamp` — that's the scene during which the event happened.
 */

const SYSTEM_LOG_SUBTYPES = new Set([
  'item_gained', 'item_lost',
  'damage', 'healing',
  'mana', 'mana_max',
  'xp', 'level_up',
  'quest_new', 'quest_completed', 'quest_reward',
  'quest_objective_completed', 'quest_objective_progress',
  'money_spent', 'money_gained',
  'combat_hit', 'combat_miss', 'combat_critical', 'combat_defeat',
  'combat_fled', 'combat_end', 'combat_start',
  'skill_xp', 'skill_levelup', 'skill_badge',
  'char_xp', 'character_levelup',
  'achievement_unlock',
  'location_discovered', 'location_changed',
  'crafting_failed', 'alchemy_failed',
  'spell_learned', 'scroll_consumed', 'scroll_gained',
  'status_change',
  'campaign_end',
  'npc_met', 'npc_died', 'npc_disposition',
  'faction_change',
  'attribute_change',
  'effect_added',
]);

export function isSystemLogMessage(msg) {
  return msg?.role === 'system' && SYSTEM_LOG_SUBTYPES.has(msg.subtype);
}

/**
 * @param {{chatHistory: Array, scenes: Array}} input
 * @returns {Array<{sceneIndex: number, scene: object|null, messages: Array}>}
 *   sceneIndex === -1 means messages emitted before the first scene exists.
 *   Empty groups (scene with no messages) are still returned so the modal can
 *   render an "empty scene" placeholder if desired.
 */
export function groupSystemLogsByScene({ chatHistory = [], scenes = [] }) {
  const buckets = new Map();
  buckets.set(-1, { sceneIndex: -1, scene: null, messages: [] });
  scenes.forEach((scene, idx) => {
    buckets.set(idx, { sceneIndex: idx, scene, messages: [] });
  });

  // Pre-sort scene timestamps once for binary-friendly lookup. Scenes are
  // already chronological in practice, but we don't rely on that.
  const sceneStamps = scenes.map((s, i) => ({ idx: i, ts: typeof s?.timestamp === 'number' ? s.timestamp : 0 }));

  function findSceneIndex(msgTs) {
    if (typeof msgTs !== 'number') return -1;
    let result = -1;
    for (const { idx, ts } of sceneStamps) {
      if (ts <= msgTs && idx > result) result = idx;
    }
    return result;
  }

  for (const msg of chatHistory) {
    if (!isSystemLogMessage(msg)) continue;
    const idx = findSceneIndex(msg.timestamp);
    const bucket = buckets.get(idx) || buckets.get(-1);
    bucket.messages.push(msg);
  }

  // Drop the pre-scene bucket if empty so the UI doesn't show an empty header.
  const groups = [];
  const preScene = buckets.get(-1);
  if (preScene.messages.length > 0) groups.push(preScene);
  for (let i = 0; i < scenes.length; i++) {
    groups.push(buckets.get(i));
  }
  return groups;
}
