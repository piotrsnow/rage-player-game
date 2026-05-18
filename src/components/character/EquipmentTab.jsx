import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useAI } from '../../hooks/useAI';
import { useInventoryActions } from '../../hooks/useInventoryActions';
import { isManaCrystal } from '../../data/rpgMagic';
import { getEquippableSlots, getEquippedSlot, rarityColors, rarityGlows, typeIcons, SLOT_CONFIG } from './inventory/constants';
import InventoryImage from './inventory/InventoryImage';
import ItemDetailBox from './inventory/ItemDetailBox';
import PocketFilter from './inventory/PocketFilter';
import CrystalUseModal from './inventory/CrystalUseModal';
import UseItemModal from './inventory/UseItemModal';
import EnchantItemModal from './inventory/EnchantItemModal';

export default function EquipmentTab({
  character,
  dispatch,
  autoSave,
  isMultiplayer,
  settings,
  onItemAction,
  npcsInScene,
  campaignId = null,
}) {
  const { t } = useTranslation();
  const items = character.inventory || [];
  const equipped = character.equipped || {};
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [crystalItemId, setCrystalItemId] = useState(null);
  const [useItemModalItem, setUseItemModalItem] = useState(null);
  const [enchantModalItem, setEnchantModalItem] = useState(null);
  const [regeneratingItemId, setRegeneratingItemId] = useState(null);
  const [sortByDate, setSortByDate] = useState(false);
  const [activePocket, setActivePocket] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 16;

  const knowsAnySpell = Array.isArray(character?.spells?.known) && character.spells.known.length > 0;
  const canEnchant = !isMultiplayer && Boolean(campaignId) && knowsAnySpell;

  const { generateItemImageForInventoryItem } = useAI();
  const canRegenerateItemImage = !isMultiplayer && settings.itemImagesEnabled !== false;

  const selectedItem = items.find((i) => i.id === selectedItemId) || null;

  const sortedItems = useMemo(() => {
    let result = items;
    if (activePocket) result = result.filter((i) => i.pocket === activePocket);
    if (sortByDate) {
      result = [...result].sort((a, b) => {
        const da = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const db = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return db - da;
      });
    }
    return result;
  }, [items, sortByDate, activePocket]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedItems = sortedItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleEquipItem = (itemId, slot) => {
    dispatch({ type: 'EQUIP_ITEM', payload: { itemId, slot } });
    if (autoSave) autoSave();
  };

  const handleUnequipItem = (slot) => {
    dispatch({ type: 'UNEQUIP_ITEM', payload: { slot } });
    if (autoSave) autoSave();
  };

  const handleRegenerateItemImage = useCallback(async (itemId) => {
    const target = items.find((i) => i.id === itemId);
    if (!target || regeneratingItemId) return;
    setRegeneratingItemId(itemId);
    try {
      await generateItemImageForInventoryItem(target, { force: true });
    } finally {
      setRegeneratingItemId(null);
    }
  }, [items, regeneratingItemId, generateItemImageForInventoryItem]);

  const handleUseManaCrystal = (itemId, choice) => {
    dispatch({ type: 'USE_MANA_CRYSTAL', payload: { itemId, choice } });
    if (autoSave) autoSave();
  };

  const handleItemLoreChange = useCallback((itemId, longDescription) => {
    dispatch({ type: 'UPDATE_ITEM_LONG_DESCRIPTION', payload: { itemId, longDescription } });
    if (autoSave) autoSave();
  }, [dispatch, autoSave]);

  const handleSetPocket = useCallback((itemId, pocket) => {
    dispatch({ type: 'SET_ITEM_POCKET', payload: { itemId, pocket } });
    if (autoSave) autoSave();
  }, [dispatch, autoSave]);

  const { discardItem } = useInventoryActions(character, dispatch);
  const handleDiscardItem = useCallback(async (itemId) => {
    try {
      await discardItem(itemId);
      setSelectedItemId((current) => (current === itemId ? null : current));
    } catch (err) {
      console.error('Failed to discard item:', err);
    }
  }, [discardItem]);

  return (
    <>
      <div className="flex flex-col gap-6 animate-fade-in">
        {/* Detail panel — full width, top */}
        {selectedItem ? (
          <div className="bg-surface-container-low p-5 border border-outline-variant/10 rounded-sm shadow-xl animate-in fade-in slide-in-from-top-3 duration-150">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-tertiary font-headline flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">inventory_2</span>
                {t('inventory.itemDetails', { defaultValue: 'Szczegóły przedmiotu' })}
              </h3>
              <button
                onClick={() => setSelectedItemId(null)}
                aria-label={t('common.close')}
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <ItemDetailBox
              item={selectedItem}
              items={items}
              equipped={equipped}
              equippedSlot={getEquippedSlot(selectedItem, equipped)}
              equippableSlots={getEquippableSlots(selectedItem)}
              onEquipItem={handleEquipItem}
              onUnequipItem={handleUnequipItem}
              onUseManaCrystal={(itemId) => setCrystalItemId(itemId)}
              onUseItem={onItemAction ? (itemId) => setUseItemModalItem(items.find((i) => i.id === itemId) || null) : undefined}
              onEnchantItem={canEnchant ? (itemId) => setEnchantModalItem(items.find((i) => i.id === itemId) || null) : undefined}
              onDiscardItem={!isMultiplayer ? handleDiscardItem : undefined}
              onRegenerateImage={canRegenerateItemImage ? handleRegenerateItemImage : null}
              onLoreChange={!isMultiplayer ? handleItemLoreChange : undefined}
              onSetPocket={handleSetPocket}
              isRegenerating={regeneratingItemId === selectedItem.id}
              horizontal
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant/40 border border-dashed border-outline-variant/15 rounded-sm">
            <span className="material-symbols-outlined text-4xl mb-2">touch_app</span>
            <p className="text-xs font-label uppercase tracking-widest">
              {t('inventory.selectItemHint', { defaultValue: 'Wybierz przedmiot' })}
            </p>
          </div>
        )}

        {/* Item grid — full width, bottom */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-tertiary font-headline text-xl">
              {t('inventory.equipmentTab', { defaultValue: 'Ekwipunek' })}
              <span className="ml-2 text-sm text-on-surface-variant font-label">({items.length})</span>
            </h3>
            <button
              onClick={() => { setSortByDate((v) => !v); setPage(0); }}
              className={`flex items-center gap-1 px-2 py-1 text-[9px] font-label font-bold uppercase tracking-wider rounded-sm border transition-colors ${
                sortByDate
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-surface-container-highest/50 border-outline-variant/15 text-on-surface-variant hover:bg-primary/10 hover:border-primary/20 hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">schedule</span>
              {t('inventory.newest', 'Najnowsze')}
            </button>
          </div>

          <div className="mb-3">
            <PocketFilter
              items={items}
              activePocket={activePocket}
              onPocketChange={(p) => { setActivePocket(p); setPage(0); }}
            />
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {pagedItems.map((item) => {
                const rarityKey = item.rarity || item.availability || 'common';
                const rarity = rarityColors[rarityKey] || rarityColors.common;
                const glow = rarityGlows[rarityKey] || '';
                const icon = typeIcons[item.type] || typeIcons.misc;
                const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;
                const isSelected = selectedItemId === item.id;
                const eqSlot = getEquippedSlot(item, equipped);

                return (
                  <div
                    key={item.id}
                    className={`relative aspect-square bg-surface-container-highest border ${rarity} ${glow} cursor-pointer group transition-all hover:scale-[1.03] ${
                      isSelected ? 'ring-2 ring-primary scale-[1.03] shadow-[0_0_20px_rgba(197,154,255,0.3)]' : ''
                    }`}
                    onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                  >
                    <InventoryImage
                      imageUrl={resolvedImageUrl}
                      alt={item.name}
                      sizeClass="w-full h-full"
                      fallbackIcon={icon}
                      fallbackIconClass="text-4xl"
                      imageClassName="group-hover:scale-105 transition-transform"
                      wrapperClassName="flex items-center justify-center"
                    />
                    <div className="absolute inset-x-0 bottom-0 px-2 pt-5 pb-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
                      <span className="block text-[11px] font-label leading-tight truncate text-on-surface">
                        {item.name}
                      </span>
                      {item.quantity > 1 && (
                        <span className="text-[9px] text-on-surface-variant/70">x{item.quantity}</span>
                      )}
                    </div>
                    {eqSlot && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(147,130,220,0.5)]">
                        <span className="material-symbols-outlined text-[11px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {SLOT_CONFIG[eqSlot].icon}
                        </span>
                      </div>
                    )}
                    {(item.rarity === 'legendary' || item.availability === 'exotic') && (
                      <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-tertiary rounded-full shadow-[0_0_8px_rgba(255,239,213,0.6)]" />
                    )}
                    {(item.rarity === 'epic' || item.rarity === 'rare') && (
                      <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(197,154,255,0.6)]" />
                    )}
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, PAGE_SIZE - pagedItems.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="aspect-square bg-surface-dim/50 border border-outline-variant/10 border-dashed rounded-sm"
                />
              ))}
            </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="w-7 h-7 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant/70">
                {safePage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="w-7 h-7 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {crystalItemId && (
        <CrystalUseModal
          character={character}
          onClose={() => setCrystalItemId(null)}
          onChoose={(choice) => {
            handleUseManaCrystal(crystalItemId, choice);
            setCrystalItemId(null);
            setSelectedItemId(null);
          }}
        />
      )}

      {useItemModalItem && (
        <UseItemModal
          item={useItemModalItem}
          character={character}
          npcs={npcsInScene || []}
          items={items.filter((i) => i.id !== useItemModalItem.id)}
          campaignId={isMultiplayer ? null : campaignId}
          dispatch={dispatch}
          onClose={() => setUseItemModalItem(null)}
          onSubmit={(actionText) => {
            setUseItemModalItem(null);
            setSelectedItemId(null);
            if (onItemAction) onItemAction(actionText);
          }}
        />
      )}

      {enchantModalItem && (
        <EnchantItemModal
          item={enchantModalItem}
          character={character}
          campaignId={campaignId}
          dispatch={dispatch}
          onClose={() => setEnchantModalItem(null)}
          onSubmit={onItemAction ? (actionText) => {
            setEnchantModalItem(null);
            setSelectedItemId(null);
            onItemAction(actionText);
          } : null}
        />
      )}
    </>
  );
}
