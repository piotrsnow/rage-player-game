export const inventoryHandlers = {
  EQUIP_ITEM: (draft, action) => {
    const { itemId, slot } = action.payload || {};
    if (!itemId || !slot || !draft.character) return;
    if (!draft.character.equipped) {
      draft.character.equipped = { mainHand: null, offHand: null, armour: null };
    }
    draft.character.equipped[slot] = itemId;
    // Note: two-handed weapon offHand-clear is handled by UI dispatching
    // UNEQUIP_ITEM for offHand before dispatching EQUIP_ITEM for mainHand.
  },

  UNEQUIP_ITEM: (draft, action) => {
    const { slot } = action.payload || {};
    if (!slot || !draft.character) return;
    if (!draft.character.equipped) {
      draft.character.equipped = { mainHand: null, offHand: null, armour: null };
    }
    draft.character.equipped[slot] = null;
  },

  UPDATE_INVENTORY_ITEM_IMAGE: (draft, action) => {
    const { itemId, imageUrl } = action.payload || {};
    if (!itemId || !draft.character?.inventory?.length) return;
    const item = draft.character.inventory.find((i) => i?.id === itemId);
    if (item) item.imageUrl = imageUrl;
  },
};
