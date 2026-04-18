import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import MaterialBagPanel from './MaterialBagPanel';
import InventoryImage from './inventory/InventoryImage';
import EquipmentSlotsBar from './inventory/EquipmentSlotsBar';
import ItemTooltip from './inventory/ItemTooltip';
import Tooltip from '../ui/Tooltip';
import Button from '../ui/Button';
import { rarityColors, rarityGlows, typeIcons, SLOT_CONFIG, getEquippedSlot } from './inventory/constants';

const ITEMS_PER_PAGE = 12;

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

export default function Inventory({
  items = [],
  money,
  equipped = {},
  onEquipItem,
  onUnequipItem,
  materialBag = [],
  selectedItemId = null,
  onSelectItem,
}) {
  const { t } = useTranslation();
  const [showMaterialBag, setShowMaterialBag] = useState(false);
  const [page, setPage] = useState(1);
  const maxSlots = 40;
  const purse = money || { gold: 0, silver: 0, copper: 0 };
  const totalMaterials = materialBag.reduce((sum, m) => sum + (m.quantity || 1), 0);

  const handleSelect = (id) => {
    if (onSelectItem) onSelectItem(id);
  };

  const totalPages = Math.max(1, Math.ceil(maxSlots / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [items, safePage]);
  const slotsOnThisPage = Math.min(
    ITEMS_PER_PAGE,
    Math.max(0, maxSlots - (safePage - 1) * ITEMS_PER_PAGE)
  );
  const emptySlots = Math.max(0, slotsOnThisPage - pageItems.length);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
        {pageItems.map((item) => {
          const rarityKey = item.rarity || item.availability || 'common';
          const rarity = rarityColors[rarityKey] || rarityColors.common;
          const glow = rarityGlows[rarityKey] || '';
          const icon = typeIcons[item.type] || typeIcons.misc;
          const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
          const isSelected = selectedItemId === item.id;
          const eqSlot = getEquippedSlot(item, equipped);
          return (
            <Tooltip
              key={item.id}
              content={<ItemTooltip item={item} />}
              delay={100}
              className="contents"
              tooltipClassName="!max-w-none !p-3"
            >
              <div
                className={`aspect-square bg-surface-container-highest border ${rarity} ${glow} flex flex-col items-center justify-center gap-1 group cursor-pointer relative hover:scale-105 transition-transform ${isSelected ? 'ring-1 ring-primary/50 scale-105' : ''} ${eqSlot ? 'ring-1 ring-primary/40' : ''}`}
                onClick={() => handleSelect(isSelected ? null : item.id)}
              >
                <InventoryImage
                  imageUrl={resolvedImageUrl}
                  alt={item.name}
                  sizeClass="w-8 h-8"
                  fallbackIcon={icon}
                  fallbackIconClass="text-base"
                  imageClassName="group-hover:scale-110 transition-transform"
                  wrapperClassName="flex items-center justify-center"
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
            </Tooltip>
          );
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-square bg-surface-dim/50 border border-outline-variant/10 border-dashed"
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label={t('gallery.prev', 'Previous')}
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </Button>
          <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest tabular-nums">
            {safePage}/{totalPages}
          </span>
          <Button
            variant="secondary"
            size="icon"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label={t('gallery.next', 'Next')}
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </Button>
        </div>
      )}

    </div>
  );
}
