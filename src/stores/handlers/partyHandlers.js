import { npcToCompanion } from '../../services/partyRecruitment';

export const MAX_COMPANIONS = 3;

function findNpc(draft, npcId, npcName) {
  const list = draft.world?.npcs;
  if (!Array.isArray(list)) return null;
  if (npcId) {
    const byId = list.find((n) => n?.id === npcId);
    if (byId) return byId;
  }
  if (npcName) {
    const lower = npcName.toLowerCase();
    return list.find((n) => n?.name?.toLowerCase() === lower) || null;
  }
  return null;
}

export const partyHandlers = {
  UPDATE_PARTY_MEMBER: (draft, action) => {
    const { id, updates } = action.payload;
    const member = (draft.party || []).find((m) => (m.id || m.name) === id);
    if (member) Object.assign(member, updates);
  },

  RECRUIT_NPC_SUCCESS: (draft, action) => {
    const { npcId, npcName, criticalSuccess } = action.payload || {};
    const npc = findNpc(draft, npcId, npcName);
    if (!npc) return;
    if (!draft.party) draft.party = [];
    if (draft.party.length >= MAX_COMPANIONS) return;
    if (draft.party.some((m) => (m.recruitedFromNpcId || m.id) === npc.id)) return;
    draft.party.push(npcToCompanion(npc));
    npc.inParty = true;
    npc.recruitCooldownUntilSceneIndex = null;
    if (criticalSuccess) {
      npc.disposition = Math.min(50, (npc.disposition || 0) + 5);
    }
  },

  RECRUIT_NPC_FAILURE: (draft, action) => {
    const { npcId, npcName, criticalFailure } = action.payload || {};
    const npc = findNpc(draft, npcId, npcName);
    if (!npc) return;
    const penalty = criticalFailure ? 15 : 5;
    const cooldown = criticalFailure ? 6 : 3;
    npc.disposition = Math.max(-50, (npc.disposition || 0) - penalty);
    const sceneIndex = (draft.scenes || []).length;
    npc.recruitCooldownUntilSceneIndex = sceneIndex + cooldown;
  },

  DISMISS_PARTY_COMPANION: (draft, action) => {
    const { id } = action.payload || {};
    if (!id || !Array.isArray(draft.party)) return;
    const idx = draft.party.findIndex((m) => (m.id || m.name) === id);
    if (idx < 0) return;
    const removed = draft.party[idx];
    const sourceId = removed.recruitedFromNpcId || removed.id;
    const npc = findNpc(draft, sourceId, removed.name);
    if (npc) {
      npc.inParty = false;
      npc.disposition = Math.max(-50, (npc.disposition || 0) - 2);
    }
    if (draft.activeCharacterId === id) {
      draft.activeCharacterId = draft.character?.name || null;
    }
    draft.party.splice(idx, 1);
  },

  SET_LOCAL_DICE_ROLL: (draft, action) => {
    draft.localDiceRoll = action.payload || null;
  },

  CLEAR_LOCAL_DICE_ROLL: (draft) => {
    draft.localDiceRoll = null;
  },
};
