import { isManaCrystal } from '../../data/rpgMagic';
import { calculateMaxWounds } from '../../services/gameState';

const ATTRIBUTE_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];
const ATTRIBUTE_CAP = 25;

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

  USE_MANA_CRYSTAL: (draft, action) => {
    const { itemId, choice } = action.payload || {};
    const char = draft.character;
    if (!itemId || !choice || !char?.inventory?.length) return;
    const item = char.inventory.find((i) => i?.id === itemId);
    if (!item || !isManaCrystal(item)) return;

    if (choice === 'mana') {
      if (!char.mana) char.mana = { current: 0, max: 0 };
      char.mana.max = (char.mana.max || 0) + 1;
      char.mana.current = (char.mana.current || 0) + 1;
    } else if (ATTRIBUTE_KEYS.includes(choice)) {
      if (!char.attributes) return;
      const current = char.attributes[choice] ?? 0;
      if (current >= ATTRIBUTE_CAP) return;
      char.attributes[choice] = current + 1;
      if (choice === 'wytrzymalosc') {
        char.maxWounds = calculateMaxWounds(char.attributes.wytrzymalosc);
      }
    } else {
      return;
    }

    char.inventory = char.inventory.filter((i) => i?.id !== itemId);
  },
};
