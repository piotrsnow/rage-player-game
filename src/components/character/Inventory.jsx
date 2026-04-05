import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import Tooltip from '../ui/Tooltip';

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

function ItemDetailBox({ item, isEquipped, onEquip }) {
  const { t } = useTranslation();

  const rarity = item.rarity || 'common';
  const rarityColor = rarityColors[rarity] || rarityColors.common;
  const badgeColor = rarityBadgeColors[rarity] || rarityBadgeColors.common;
  const icon = typeIcons[item.type] || typeIcons.misc;
  const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
  const isWeapon = item.type === 'weapon';

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
            {item.type && (
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

      {isWeapon && onEquip && (
        <div className="border-t border-outline-variant/10 pt-3 mt-3">
          {isEquipped ? (
            <div className="flex items-center gap-1.5 text-[11px] text-primary font-bold">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              {t('inventory.equipped', 'Equipped')}
            </div>
          ) : (
            <button
              onClick={() => onEquip(item.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">swords</span>
              {t('inventory.equip', 'Equip')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Inventory({ items = [], money, equippedWeapon = '', onEquipWeapon }) {
  const { t } = useTranslation();
  const [selectedItemId, setSelectedItemId] = useState(null);
  const maxSlots = 40;
  const emptySlots = Math.max(0, maxSlots - items.length);
  const purse = money || { gold: 0, silver: 0, copper: 0 };
  const selectedItem = items.find(i => i.id === selectedItemId) || null;

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-tertiary font-headline text-xl">{t('inventory.title')}</h3>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('inventory.slots', { current: items.length, max: maxSlots })}
        </span>
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
      {selectedItem && <ItemDetailBox item={selectedItem} />}
      <div className="grid grid-cols-4 gap-3">
        {items.map((item) => {
          const rarity = rarityColors[item.rarity] || rarityColors.common;
          const icon = typeIcons[item.type] || typeIcons.misc;
          const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
          const isSelected = selectedItemId === item.id;
          const isEquipped = item.type === 'weapon' && item.name === equippedWeapon;
          return (
            <div
              key={item.id}
              className={`aspect-square bg-surface-container-highest border ${rarity} flex flex-col items-center justify-center gap-1 group cursor-pointer relative hover:scale-105 transition-transform ${isSelected ? 'ring-1 ring-primary/50 scale-105' : ''} ${isEquipped ? 'ring-1 ring-primary/40' : ''}`}
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
              {isEquipped && (
                <div className="absolute -top-1 -left-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-[0_0_6px_rgba(147,130,220,0.4)]">
                  <span className="material-symbols-outlined text-[10px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>swords</span>
                </div>
              )}
              {item.rarity === 'legendary' && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-tertiary rounded-full shadow-[0_0_6px_rgba(255,239,213,0.6)]" />
              )}
              {item.rarity === 'epic' && (
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
          isEquipped={selectedItem.type === 'weapon' && selectedItem.name === equippedWeapon}
          onEquip={onEquipWeapon}
        />
      )}
    </div>
  );
}
