import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveShopArchetype, buildShopInventory, buildRandomInventory,
  createTradeSession, calculateItemBuyPrice, calculateItemSellPrice,
  resolveHaggle, executeBuy, executeSell,
} from '../../services/tradeEngine.js';
import { canAfford, applyDiscount, formatCoinPrice } from '../../../shared/domain/pricing.js';
import { gameData } from '../../services/gameDataService.js';
import { formatMoney } from '../../services/gameState.js';
import { getSkillLevel } from '../../data/rpgSystem.js';

export default function TradePanel({ trade, character, world, dispatch, onHaggle, disabled }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('buy');
  const [selectedItem, setSelectedItem] = useState(null);
  const [haggleResult, setHaggleResult] = useState(null);

  // Build shop inventory on first render / when pendingSetup
  useEffect(() => {
    if (!trade?.active || !trade.pendingSetup) return;

    const npcName = trade.npcName;
    const npcRole = trade.npcRole || 'general';
    const archetype = resolveShopArchetype(npcRole);
    const locationType = resolveLocationType(world?.currentLocation);
    const equipment = gameData.equipment || {};
    const materials = gameData.materials || [];

    let shopItems;
    if (archetype === 'general' && !['merchant', 'trader', 'general'].some((k) => npcRole.toLowerCase().includes(k))) {
      shopItems = buildRandomInventory(npcName, equipment, materials);
    } else {
      shopItems = buildShopInventory(archetype, equipment, materials, npcName, locationType);
    }

    dispatch({
      type: 'UPDATE_TRADE',
      payload: {
        pendingSetup: false,
        shopItems,
        npcRole,
        archetype,
        locationType,
      },
    });
  }, [trade?.pendingSetup, trade?.npcName, trade?.npcRole, world?.currentLocation, dispatch]);

  const disposition = trade?.disposition || 0;
  const locationMod = 0;

  const equipmentCatalog = gameData.equipment || {};

  // Compute buy prices
  const shopItemsWithPrices = useMemo(() => {
    return (trade?.shopItems || []).map((item) => ({
      ...item,
      buyPrice: calculateItemBuyPrice(item, disposition, locationMod, equipmentCatalog),
      haggledPrice: trade?.haggleDiscounts?.[item.id]
        ? trade.haggleDiscounts[item.id]
        : null,
    }));
  }, [trade?.shopItems, disposition, locationMod, trade?.haggleDiscounts, equipmentCatalog]);

  // Player inventory with sell prices
  const sellableItems = useMemo(() => {
    const handelLevel = getSkillLevel(character?.skills, 'Handel');
    return (character?.inventory || []).map((item) => ({
      ...item,
      sellPrice: calculateItemSellPrice(item, handelLevel, equipmentCatalog),
    }));
  }, [character?.inventory, character?.skills, equipmentCatalog]);

  const money = character?.money || { gold: 0, silver: 0, copper: 0 };

  const handleBuy = useCallback((item) => {
    const price = item.haggledPrice || item.buyPrice;
    if (!canAfford(money, price)) return;

    const changes = executeBuy(item, price);
    dispatch({ type: 'APPLY_STATE_CHANGES', payload: changes });

    // Remove bought item from shop
    dispatch({
      type: 'UPDATE_TRADE',
      payload: {
        shopItems: (trade?.shopItems || []).filter((i) => i.id !== item.id),
      },
    });

    setSelectedItem(null);
    setHaggleResult(null);
  }, [money, trade?.shopItems, dispatch]);

  const handleSell = useCallback((item) => {
    const changes = executeSell(item, item.sellPrice);
    dispatch({ type: 'APPLY_STATE_CHANGES', payload: changes });
  }, [dispatch]);

  const handleHaggle = useCallback((item) => {
    if ((trade?.haggleAttempts || 0) >= (trade?.maxHaggle || 3)) return;

    const result = resolveHaggle(
      character,
      0, // momentum — could pass from game state
      'medium',
      world?.npcs || [],
    );

    const attempts = (trade?.haggleAttempts || 0) + 1;
    const updates = { haggleAttempts: attempts };

    if (result.success && result.discountPercent > 0) {
      const basePrice = item.haggledPrice || item.buyPrice;
      const newPrice = applyDiscount(basePrice, result.discountPercent);
      updates.haggleDiscounts = {
        ...(trade?.haggleDiscounts || {}),
        [item.id]: newPrice,
      };
    }

    dispatch({ type: 'UPDATE_TRADE', payload: updates });
    setHaggleResult(result);

    // Trigger AI flavor text if callback provided
    if (onHaggle) {
      onHaggle({
        npcName: trade?.npcName,
        itemName: item.name,
        success: result.success,
        discountPercent: result.discountPercent,
        disposition,
      });
    }
  }, [character, trade, disposition, world?.npcs, onHaggle, dispatch]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'END_TRADE' });
  }, [dispatch]);

  if (!trade?.active) return null;

  const canHaggle = (trade?.haggleAttempts || 0) < (trade?.maxHaggle || 3);
  const dispositionLabel = disposition > 10 ? 'friendly' : disposition < -10 ? 'hostile' : 'neutral';
  const dispositionColor = disposition > 10 ? 'text-success' : disposition < -10 ? 'text-error' : 'text-warning';

  return (
    <div className="bg-surface-container-low/60 backdrop-blur-sm border border-tertiary/20 rounded-sm p-3 space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-tertiary">storefront</span>
          <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface">
            {t('trade.title')}
          </span>
          <span className="text-[10px] text-on-surface-variant">— {trade.npcName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] ${dispositionColor}`}>
            {t('trade.disposition')}: {dispositionLabel} ({disposition > 0 ? '+' : ''}{disposition})
          </span>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-surface-container-high/40 rounded-sm transition-colors"
          >
            <span className="material-symbols-outlined text-xs text-on-surface-variant">close</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {['buy', 'sell'].map((t_) => (
          <button
            key={t_}
            onClick={() => { setTab(t_); setSelectedItem(null); setHaggleResult(null); }}
            className={`flex-1 py-1.5 text-[10px] font-label font-bold uppercase tracking-widest rounded-sm transition-colors ${
              tab === t_
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-surface-container/40 text-on-surface-variant border border-outline-variant/15 hover:bg-surface-container-high/40'
            }`}
          >
            {t_ === 'buy' ? t('trade.tabBuy') : t('trade.tabSell')}
          </button>
        ))}
      </div>

      {/* Buy Tab */}
      {tab === 'buy' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
          {shopItemsWithPrices.length === 0 && (
            <p className="text-[10px] text-on-surface-variant text-center py-4">{t('trade.emptyShop')}</p>
          )}
          {shopItemsWithPrices.map((item) => {
            const price = item.haggledPrice || item.buyPrice;
            const affordable = canAfford(money, price);
            const isSelected = selectedItem?.id === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(isSelected ? null : item)}
                className={`p-2 rounded-sm border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-surface-container/30 border-outline-variant/10 hover:bg-surface-container/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-on-surface">{item.name}</span>
                  <div className="flex items-center gap-1.5">
                    {item.haggledPrice && (
                      <span className="text-[9px] text-on-surface-variant line-through">
                        {formatCoinPrice(item.buyPrice)}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold ${affordable ? 'text-tertiary' : 'text-error/60'}`}>
                      {formatCoinPrice(price)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-on-surface-variant">
                    {t(`trade.${item.availability || 'common'}`)}
                  </span>
                  {item.weight != null && (
                    <span className="text-[9px] text-on-surface-variant">
                      {t('trade.weight')}: {item.weight}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleHaggle(item); }}
                      disabled={disabled || !canHaggle}
                      className="px-2 py-1 text-[9px] font-label font-bold uppercase tracking-widest rounded-sm bg-surface-container-high/40 border border-outline-variant/20 text-on-surface-variant hover:bg-primary/10 hover:text-primary disabled:opacity-40 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[10px] mr-0.5 align-middle">handshake</span>
                      {t('trade.haggle')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBuy(item); }}
                      disabled={disabled || !affordable}
                      className="px-2 py-1 text-[9px] font-label font-bold uppercase tracking-widest rounded-sm bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
                    >
                      {t('trade.buy')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sell Tab */}
      {tab === 'sell' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
          {sellableItems.length === 0 && (
            <p className="text-[10px] text-on-surface-variant text-center py-4">{t('trade.emptyInventory')}</p>
          )}
          {sellableItems.map((item) => (
            <div
              key={item.id}
              className="p-2 rounded-sm border bg-surface-container/30 border-outline-variant/10 hover:bg-surface-container/50 transition-colors flex items-center justify-between"
            >
              <div>
                <span className="text-xs text-on-surface">{item.name}</span>
                <div className="text-[9px] text-on-surface-variant mt-0.5">
                  {t('trade.sellPrice')}: {formatCoinPrice(item.sellPrice)}
                </div>
              </div>
              <button
                onClick={() => handleSell(item)}
                disabled={disabled}
                className="px-2 py-1 text-[9px] font-label font-bold uppercase tracking-widest rounded-sm bg-tertiary/10 border border-tertiary/20 text-tertiary hover:bg-tertiary/20 disabled:opacity-40 transition-colors"
              >
                {t('trade.sell')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer: Purse + Haggle status */}
      <div className="flex items-center justify-between border-t border-outline-variant/10 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-tertiary">account_balance_wallet</span>
          <span className="text-[10px] text-tertiary font-bold">
            {t('trade.purse')}: {formatMoney(money)}
          </span>
        </div>
        <span className="text-[9px] text-on-surface-variant">
          {t('trade.haggleAttempts', { current: trade?.haggleAttempts || 0, max: trade?.maxHaggle || 3 })}
        </span>
      </div>

      {/* Haggle result log */}
      {haggleResult && (
        <div className={`text-[10px] p-2 rounded-sm border ${
          haggleResult.success
            ? 'bg-success/10 border-success/20 text-success'
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {haggleResult.success
            ? t('trade.haggleSuccess', { percent: haggleResult.discountPercent })
            : t('trade.haggleFail')}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──


function resolveLocationType(location) {
  if (!location) return 'city';
  const lower = (typeof location === 'string' ? location : location.name || '').toLowerCase();
  if (lower.includes('village') || lower.includes('wiosk') || lower.includes('osad')) return 'village';
  if (lower.includes('town') || lower.includes('miast')) return 'town';
  if (lower.includes('wild') || lower.includes('forest') || lower.includes('las') || lower.includes('puszcz')) return 'wilderness';
  return 'city';
}
