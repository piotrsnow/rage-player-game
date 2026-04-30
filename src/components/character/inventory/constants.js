import { gameData } from '../../../services/gameDataService';

export const rarityColors = {
  common: 'border-outline-variant/20 text-on-surface-variant',
  uncommon: 'border-primary/20 text-primary-dim',
  rare: 'border-primary/40 text-primary shadow-[0_0_8px_rgba(147,130,220,0.15)]',
  epic: 'border-tertiary/30 text-tertiary-dim shadow-[0_0_10px_rgba(197,154,255,0.25)]',
  legendary: 'border-tertiary/50 text-tertiary shadow-[0_0_12px_rgba(255,239,213,0.3)]',
};

export const rarityGlows = {
  common: '',
  uncommon: 'shadow-[inset_0_0_8px_rgba(147,130,220,0.12)]',
  rare: 'shadow-[inset_0_0_10px_rgba(147,130,220,0.22)]',
  epic: 'shadow-[inset_0_0_12px_rgba(197,154,255,0.28)]',
  legendary: 'shadow-[inset_0_0_14px_rgba(255,239,213,0.35)]',
};

export const typeIcons = {
  weapon: 'swords',
  armor: 'shield',
  armour: 'shield',
  potion: 'local_bar',
  scroll: 'receipt_long',
  artifact: 'diamond',
  tool: 'handyman',
  food: 'restaurant',
  clothing: 'checkroom',
  key: 'key',
  book: 'menu_book',
  ring: 'diamond',
  ammunition: 'target',
  trinket: 'token',
  currency: 'paid',
  shield: 'shield_with_heart',
  manaCrystal: 'auto_awesome',
  misc: 'category',
};

export const SLOT_CONFIG = {
  mainHand: { icon: 'swords', label: 'inventory.slotMainHand', fallback: 'Main Hand' },
  offHand: { icon: 'shield_with_heart', label: 'inventory.slotOffHand', fallback: 'Off Hand' },
  armour: { icon: 'shield', label: 'inventory.slotArmour', fallback: 'Armour' },
};

export const DECORATIVE_SLOT_CONFIG = {
  head: { icon: 'military_tech', label: 'inventory.slotHead', fallback: 'Head' },
  neck: { icon: 'emoji_events', label: 'inventory.slotNeck', fallback: 'Neck' },
  shoulders: { icon: 'accessibility', label: 'inventory.slotShoulders', fallback: 'Shoulders' },
  cloak: { icon: 'dry_cleaning', label: 'inventory.slotCloak', fallback: 'Cloak' },
  amulet: { icon: 'auto_awesome', label: 'inventory.slotAmulet', fallback: 'Amulet' },
  gloves: { icon: 'sports_mma', label: 'inventory.slotGloves', fallback: 'Gloves' },
  belt: { icon: 'drag_handle', label: 'inventory.slotBelt', fallback: 'Belt' },
  legs: { icon: 'airline_seat_legroom_normal', label: 'inventory.slotLegs', fallback: 'Legs' },
  boots: { icon: 'hiking', label: 'inventory.slotBoots', fallback: 'Boots' },
  ring1: { icon: 'diamond', label: 'inventory.slotRing', fallback: 'Ring' },
  ring2: { icon: 'diamond', label: 'inventory.slotRing', fallback: 'Ring' },
  quiver: { icon: 'inventory_2', label: 'inventory.slotQuiver', fallback: 'Quiver' },
  talisman1: { icon: 'stars', label: 'inventory.slotTalisman', fallback: 'Talisman' },
  talisman2: { icon: 'stars', label: 'inventory.slotTalisman', fallback: 'Talisman' },
};

export const rarityLabels = {
  common: 'inventory.rarityCommon',
  uncommon: 'inventory.rarityUncommon',
  rare: 'inventory.rarityRare',
  epic: 'inventory.rarityEpic',
  legendary: 'inventory.rarityLegendary',
};

export const rarityBadgeColors = {
  common: 'bg-on-surface-variant/10 text-on-surface-variant',
  uncommon: 'bg-primary/10 text-primary-dim',
  rare: 'bg-primary/20 text-primary',
  epic: 'bg-tertiary/15 text-tertiary-dim',
  legendary: 'bg-tertiary/25 text-tertiary',
};

export function getEquippableSlots(item) {
  const slotType = gameData.getEquipSlotType(item);
  if (!slotType) return [];
  if (slotType === 'weapon') {
    const isTwoHanded = item.baseType ? gameData.isTwoHanded(item.baseType) : false;
    if (isTwoHanded) return ['mainHand'];
    return ['mainHand', 'offHand'];
  }
  if (slotType === 'shield') return ['offHand'];
  if (slotType === 'armour') return ['armour'];
  return [];
}

export function getEquippedSlot(item, equipped) {
  if (!equipped || !item) return null;
  if (equipped.mainHand === item.id) return 'mainHand';
  if (equipped.offHand === item.id) return 'offHand';
  if (equipped.armour === item.id) return 'armour';
  return null;
}
