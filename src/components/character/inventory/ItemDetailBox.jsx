import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import InventoryImage from './InventoryImage';
import { rarityColors, typeIcons, SLOT_CONFIG, rarityLabels, rarityBadgeColors } from './constants';

export default function ItemDetailBox({ item, equippedSlot, equippableSlots, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const rarity = item.rarity || item.availability || 'common';
  const rarityColor = rarityColors[rarity] || rarityColors.common;
  const badgeColor = rarityBadgeColors[rarity] || rarityBadgeColors.common;
  const icon = typeIcons[item.type] || typeIcons.misc;
  const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;

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
          className={`material-symbols-outlined text-2xl ${rarityColor.split(' ').find((c) => c.startsWith('text-')) || 'text-on-surface'}`}
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
          {properties.map((prop) => (
            <span key={prop} className="text-[9px] px-1.5 py-0.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}

      {price && (
        <div className="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant/60">
          <span className="material-symbols-outlined text-xs">paid</span>
          {price.gold > 0 && <span>{price.gold} {t('currency.goldShort', 'ZK')}</span>}
          {price.silver > 0 && <span>{price.silver} {t('currency.silverShort', 'SK')}</span>}
          {price.copper > 0 && <span>{price.copper} {t('currency.copperShort', 'MK')}</span>}
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
            {equippableSlots.map((slot) => (
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
