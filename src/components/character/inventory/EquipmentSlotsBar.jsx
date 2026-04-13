import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import Tooltip from '../../ui/Tooltip';
import InventoryImage from './InventoryImage';
import { SLOT_CONFIG, typeIcons, getEquippableSlots, getEquippedSlot } from './constants';

function EquipmentSlot({ slotKey, equipped, items, onEquipItem, onUnequipItem, disabled, disabledReason }) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const config = SLOT_CONFIG[slotKey];
  const equippedItemId = equipped?.[slotKey];
  const equippedItem = equippedItemId ? items.find((i) => i.id === equippedItemId) : null;
  const resolvedImage = equippedItem?.imageUrl ? apiClient.resolveMediaUrl(equippedItem.imageUrl) : null;

  const availableItems = items.filter((item) => {
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
          {availableItems.map((item) => {
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

export default function EquipmentSlotsBar({ equipped, items, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const mainHandItem = equipped?.mainHand ? items.find((i) => i.id === equipped.mainHand) : null;
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
