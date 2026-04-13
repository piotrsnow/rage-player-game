export const partyHandlers = {
  ADD_PARTY_COMPANION: (draft, action) => {
    if (!draft.party) draft.party = [];
    draft.party.push({ ...action.payload, type: 'companion' });
  },

  UPDATE_PARTY_MEMBER: (draft, action) => {
    const { id, updates } = action.payload;
    const member = (draft.party || []).find((m) => (m.id || m.name) === id);
    if (member) Object.assign(member, updates);
  },
};
