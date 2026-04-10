import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { gameData } from '../../services/gameDataService';
import Tooltip from '../ui/Tooltip';
import MaterialBagPanel from './MaterialBagPanel';

const rarityColors = {
  common: 'border-outline-variant/20 text-on-surface-variant',
  uncommon: 'border-primary/20 text-primary-dim',
  rare: 'border-primary/40 text-primary shadow-[0_0_8px_rgba(147,130,220,0.15)]',
  epic: 'border-tertiary/30 text-tertiary-dim shadow-[0_0_10px_rgba(197,154,255,0.25)]',
  legendary: 'border-tertiary/50 text-tertiary shadow-[0_0_12px_rgba(255,239,213,0.3)]',
};

const typeIcons = {
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
  misc: 'category',
};

const SLOT_CONFIG = {
  mainHand: { icon: 'swords', label: 'inventory.slotMainHand', fallback: 'Main Hand' },
  offHand: { icon: 'shield_with_heart', label: 'inventory.slotOffHand', fallback: 'Off Hand' },
  armour: { icon: 'shield', label: 'inventory.slotArmour', fallback: 'Armour' },
};

function CoinDisplay({ value, label, color }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-[9px] font-bold shadow-sm`}>
        {label.charAt(0)}
      </div>
      <span className="text-sm font-headline text-on-surface">{value}</span>
    </div>
  );
}

const rarityLabels = {
  common: 'inventory.rarityCommon',
  uncommon: 'inventory.rarityUncommon',
  rare: 'inventory.rarityRare',
  epic: 'inventory.rarityEpic',
  legendary: 'inventory.rarityLegendary',
};

const rarityBadgeColors = {
  common: 'bg-on-surface-variant/10 text-on-surface-variant',
  uncommon: 'bg-primary/10 text-primary-dim',
  rare: 'bg-primary/20 text-primary',
  epic: 'bg-tertiary/15 text-tertiary-dim',
  legendary: 'bg-tertiary/25 text-tertiary',
};

function InventoryImage({
  imageUrl,
  alt,
  sizeClass,
  fallbackIcon,
  fallbackIconClass = 'text-xl',
  wrapperClassName = '',
  imageClassName = '',
  showLargePreview = false,
  previewSizeClass = 'w-[360px] h-[360px]',
}) {
  const [isLoading, setIsLoading] = useState(Boolean(imageUrl));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoading(Boolean(imageUrl));
  }, [imageUrl]);

  const previewContent = (showLargePreview && imageUrl && !hasError)
    ? (
      <div className={previewSizeClass}>
        <img src={imageUrl} alt={alt} className="w-full h-full object-cover rounded-sm border border-outline-variant/20" />
      </div>
    )
    : null;

  if (!imageUrl || hasError) {
    return (
      <div className={`relative ${sizeClass} ${wrapperClassName}`}>
        <span
          className={`material-symbols-outlined ${fallbackIconClass} text-on-surface-variant/80`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          {fallbackIcon}
        </span>
      </div>
    );
  }

  const imageNode = (
    <div className={`relative ${sizeClass} ${wrapperClassName}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-surface-container-highest/80 rounded-sm flex items-center justify-center z-10">
          <span className="material-symbols-outlined text-base text-primary-dim animate-spin">progress_activity</span>
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full rounded-sm object-cover border border-outline-variant/15 ${imageClassName} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );

  if (!previewContent) return imageNode;
  return (
    <Tooltip content={previewContent} tooltipClassName="!max-w-none !p-2">
      {imageNode}
    </Tooltip>
  );
}

/** Get which slot an item can be equipped to */
function getEquippableSlots(item) {
  const slotType = gameData.getEquipSlotType(item);
  if (!slotType) return [];
  if (slotType === 'weapon') {
    const isTwoHanded = item.baseType ? gameData.isTwoHanded(item.baseType) : false;
    // Two-handed weapons only go in mainHand
    if (isTwoHanded) return ['mainHand'];
    return ['mainHand', 'offHand'];
  }
  if (slotType === 'shield') return ['offHand'];
  if (slotType === 'armour') return ['armour'];
  return [];
}

/** Check if a given item is equipped in any slot */
function getEquippedSlot(item, equipped) {
  if (!equipped || !item) return null;
  if (equipped.mainHand === item.id) return 'mainHand';
  if (equipped.offHand === item.id) return 'offHand';
  if (equipped.armour === item.id) return 'armour';
  return null;
}

function EquipmentSlot({ slotKey, equipped, items, onEquipItem, onUnequipItem, disabled, disabledReason }) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const config = SLOT_CONFIG[slotKey];
  const equippedItemId = equipped?.[slotKey];
  const equippedItem = equippedItemId ? items.find(i => i.id === equippedItemId) : null;
  const resolvedImage = equippedItem?.imageUrl ? apiClient.resolveMediaUrl(equippedItem.imageUrl) : null;

  // Filter inventory items that can go in this slot and aren't equipped elsewhere
  const availableItems = items.filter(item => {
    if (getEquippedSlot(item, equipped)) return false;
    return getEquippableSlots(item).includes(slotKey);
  });

  const handleSlotClick = () => {
    if (disabled) return;
    if (equippedItem) {
      onUnequipItem(slotKey);
    } else if (availableItems.length > 0) {
      setShowPicker(!showPicker);
    }
  };

  const handlePickItem = (itemId) => {
    onEquipItem(itemId, slotKey);
    setShowPicker(false);
  };

  return (
    <div className="relative">
      <Tooltip content={disabled ? disabledReason : equippedItem?.name || t(config.label, config.fallback)}>
        <button
          onClick={handleSlotClick}
          disabled={disabled && !equippedItem}
          className={`
            w-full aspect-square bg-surface-container-highest border rounded-sm flex flex-col items-center justify-center gap-1
            transition-all cursor-pointer relative
            ${equippedItem
              ? 'border-primary/40 ring-1 ring-primary/30 hover:ring-primary/50'
              : disabled
                ? 'border-outline-variant/10 opacity-40 cursor-not-allowed'
                : 'border-outline-variant/20 hover:border-primary/30 hover:bg-surface-container/50'
            }
          `}
        >
          {equippedItem ? (
            <>
              <InventoryImage
                imageUrl={resolvedImage}
                alt={equippedItem.name}
                sizeClass="w-8 h-8"
                fallbackIcon={typeIcons[equippedItem.type] || config.icon}
                fallbackIconClass="text-base"
                wrapperClassName="flex items-center justify-center"
              />
              <span className="text-[7px] font-label leading-tight max-w-[calc(100%-4px)] truncate text-on-surface">
                {equippedItem.name}
              </span>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-error/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-[10px] text-on-error">close</span>
              </div>
            </>
          ) : (
            <>
              <span
                className="material-symbols-outlined text-lg text-on-surface-variant/30"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}
              >
                {config.icon}
              </span>
              <span className="text-[7px] font-label text-on-surface-variant/30 uppercase tracking-wider">
                {t(config.label, config.fallback)}
              </span>
            </>
          )}
        </button>
      </Tooltip>

      {showPicker && availableItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-surface-container border border-outline-variant/20 rounded-sm shadow-xl max-h-48 overflow-y-auto">
          {availableItems.map(item => {
            const imgUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
            return (
              <button
                key={item.id}
                onClick={() => handlePickItem(item.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-primary/10 transition-colors text-left"
              >
                <InventoryImage
                  imageUrl={imgUrl}
                  alt={item.name}
                  sizeClass="w-6 h-6"
                  fallbackIcon={typeIcons[item.type] || 'category'}
                  fallbackIconClass="text-sm"
                  wrapperClassName="flex items-center justify-center flex-shrink-0"
                />
                <span className="text-[10px] text-on-surface truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EquipmentSlotsBar({ equipped, items, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  // Check if mainHand weapon is two-handed → disable offHand
  const mainHandItem = equipped?.mainHand ? items.find(i => i.id === equipped.mainHand) : null;
  const mainIsTwoHanded = mainHandItem?.baseType ? gameData.isTwoHanded(mainHandItem.baseType) : false;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-sm text-on-surface-variant/50">person</span>
        <span className="text-[10px] font-label text-on-surface-variant/50 uppercase tracking-widest">
          {t('inventory.equipment', 'Equipment')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <EquipmentSlot
          slotKey="mainHand"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
        />
        <EquipmentSlot
          slotKey="offHand"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
          disabled={mainIsTwoHanded}
          disabledReason={t('inventory.twoHandedBlocked', 'Two-handed weapon equipped')}
        />
        <EquipmentSlot
          slotKey="armour"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
        />
      </div>
    </div>
  );
}

function ItemDetailBox({ item, equippedSlot, equippableSlots, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const rarity = item.rarity || item.availability || 'common';
  const rarityColor = rarityColors[rarity] || rarityColors.common;
  const badgeColor = rarityBadgeColors[rarity] || rarityBadgeColors.common;
  const icon = typeIcons[item.type] || typeIcons.misc;
  const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;

  // Resolve baseType info
  const resolved = item.baseType ? gameData.resolveBaseType(item.baseType) : null;
  const properties = resolved?.properties || [];
  const price = resolved?.price;

  return (
    <div className={`mt-3 bg-surface-container border ${rarityColor} rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-150`}>
      {resolvedImageUrl && (
        <div className="mb-3">
          <InventoryImage
            imageUrl={resolvedImageUrl}
            alt={item.name}
            sizeClass="w-full h-40"
            fallbackIcon={icon}
            wrapperClassName="border border-outline-variant/20 flex items-center justify-center overflow-hidden"
            showLargePreview
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <span
          className={`material-symbols-outlined text-2xl ${rarityColor.split(' ').find(c => c.startsWith('text-')) || 'text-on-surface'}`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-headline text-sm text-on-surface leading-tight">{item.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-block text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${badgeColor}`}>
              {t(rarityLabels[rarity] || rarityLabels.common)}
            </span>
            {item.baseType && (
              <span className="text-[10px] font-label text-on-surface-variant/60">{resolved?.name || item.baseType}</span>
            )}
            {!item.baseType && item.type && (
              <span className="text-[10px] font-label text-on-surface-variant/60 capitalize">{t(`inventory.types.${item.type}`, item.type)}</span>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <p className="text-xs text-on-surface-variant/80 leading-relaxed border-t border-outline-variant/10 pt-2 mt-3">
          {item.description}
        </p>
      )}

      {properties.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {properties.map(prop => (
            <span key={prop} className="text-[9px] px-1.5 py-0.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}

      {price && (
        <div className="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant/60">
          <span className="material-symbols-outlined text-xs">paid</span>
          {price.gold > 0 && <span>{price.gold} GC</span>}
          {price.silver > 0 && <span>{price.silver} SS</span>}
          {price.copper > 0 && <span>{price.copper} CP</span>}
        </div>
      )}

      <div className="border-t border-outline-variant/10 pt-3 mt-3">
        {equippedSlot ? (
          <button
            onClick={() => onUnequipItem(equippedSlot)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 rounded-sm hover:bg-error/20 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            {t('inventory.unequip', 'Unequip')}
          </button>
        ) : equippableSlots.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {equippableSlots.map(slot => (
              <button
                key={slot}
                onClick={() => onEquipItem(item.id, slot)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">{SLOT_CONFIG[slot].icon}</span>
                {t(SLOT_CONFIG[slot].label, SLOT_CONFIG[slot].fallback)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Inventory({ items = [], money, equipped = {}, onEquipItem, onUnequipItem, materialBag = [] }) {
  const { t } = useTranslation();
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showMaterialBag, setShowMaterialBag] = useState(false);
  const maxSlots = 40;
  const emptySlots = Math.max(0, maxSlots - items.length);
  const purse = money || { gold: 0, silver: 0, copper: 0 };
  const selectedItem = items.find(i => i.id === selectedItemId) || null;
  const totalMaterials = materialBag.reduce((sum, m) => sum + (m.quantity || 1), 0);

  if (showMaterialBag) {
    return <MaterialBagPanel materials={materialBag} onClose={() => setShowMaterialBag(false)} />;
  }

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-tertiary font-headline text-xl">{t('inventory.title')}</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMaterialBag(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-wider rounded-sm bg-surface-container-highest/50 border border-outline-variant/15 text-on-surface-variant hover:bg-primary/10 hover:border-primary/20 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[12px]">inventory_2</span>
            {t('materialBag.title', 'Materials')}
            {totalMaterials > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[8px] font-bold bg-primary/20 text-primary rounded-full">
                {totalMaterials}
              </span>
            )}
          </button>
          <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
            {t('inventory.slots', { current: items.length, max: maxSlots })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-5 px-3 py-2.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm">
        <span className="material-symbols-outlined text-base text-on-surface-variant mr-1">account_balance_wallet</span>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mr-3">{t('currency.purse')}</span>
        <div className="flex items-center gap-4">
          <CoinDisplay value={purse.gold} label={t('currency.goldShort')} color="bg-yellow-500/90 text-yellow-950" />
          <CoinDisplay value={purse.silver} label={t('currency.silverShort')} color="bg-gray-300/90 text-gray-700" />
          <CoinDisplay value={purse.copper} label={t('currency.copperShort')} color="bg-orange-600/80 text-orange-100" />
        </div>
      </div>

      <EquipmentSlotsBar
        equipped={equipped}
        items={items}
        onEquipItem={onEquipItem}
        onUnequipItem={onUnequipItem}
      />

      <div className="grid grid-cols-4 gap-3">
        {items.map((item) => {
          const rarity = rarityColors[item.rarity || item.availability] || rarityColors.common;
          const icon = typeIcons[item.type] || typeIcons.misc;
          const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
          const isSelected = selectedItemId === item.id;
          const eqSlot = getEquippedSlot(item, equipped);
          return (
            <div
              key={item.id}
              className={`aspect-square bg-surface-container-highest border ${rarity} flex flex-col items-center justify-center gap-1 group cursor-pointer relative hover:scale-105 transition-transform ${isSelected ? 'ring-1 ring-primary/50 scale-105' : ''} ${eqSlot ? 'ring-1 ring-primary/40' : ''}`}
              onClick={() => setSelectedItemId(isSelected ? null : item.id)}
            >
              <InventoryImage
                imageUrl={resolvedImageUrl}
                alt={item.name}
                sizeClass="w-8 h-8"
                fallbackIcon={icon}
                fallbackIconClass="text-base"
                imageClassName="group-hover:scale-110 transition-transform"
                wrapperClassName="flex items-center justify-center"
                showLargePreview
              />
              <span className="text-[8px] font-label leading-tight max-w-[calc(100%-8px)] truncate opacity-70">
                {item.name}
              </span>
              {eqSlot && (
                <div className="absolute -top-1 -left-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-[0_0_6px_rgba(147,130,220,0.4)]">
                  <span className="material-symbols-outlined text-[10px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {SLOT_CONFIG[eqSlot].icon}
                  </span>
                </div>
              )}
              {(item.rarity === 'legendary' || item.availability === 'exotic') && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-tertiary rounded-full shadow-[0_0_6px_rgba(255,239,213,0.6)]" />
              )}
              {(item.rarity === 'epic' || item.rarity === 'rare') && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
              )}
            </div>
          );
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-square bg-surface-dim/50 border border-outline-variant/10 border-dashed"
          />
        ))}
      </div>

      {selectedItem && (
        <ItemDetailBox
          item={selectedItem}
          equippedSlot={getEquippedSlot(selectedItem, equipped)}
          equippableSlots={getEquippableSlots(selectedItem)}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
        />
      )}
    </div>
  );
}
