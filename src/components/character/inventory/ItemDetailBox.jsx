import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import { isManaCrystal } from '../../../data/rpgMagic';
import AttackModesDisplay from '../../shared/AttackModesDisplay';
import SpecialPropertiesDisplay from '../../shared/SpecialPropertiesDisplay';
import { useItemAttackModes } from '../../../hooks/useItemAttackModes';
import InventoryImage from './InventoryImage';
import { rarityColors, typeIcons, SLOT_CONFIG, rarityLabels, rarityBadgeColors } from './constants';

function formatPrice(price, t) {
  if (!price) return null;
  const parts = [];
  if (price.gold > 0) parts.push(`${price.gold} ${t('currency.goldShort', 'ZK')}`);
  if (price.silver > 0) parts.push(`${price.silver} ${t('currency.silverShort', 'SK')}`);
  if (price.copper > 0) parts.push(`${price.copper} ${t('currency.copperShort', 'MK')}`);
  return parts.length ? parts.join(' ') : null;
}

function Delta({ value, invert = false, suffix = '', t, large = false }) {
  if (value == null || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? 'text-primary' : 'text-error';
  const arrow = positive ? 'arrow_upward' : 'arrow_downward';
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`inline-flex items-center gap-0.5 ${large ? 'text-sm' : 'text-[10px]'} font-label ${color}`}>
      <span className={`material-symbols-outlined ${large ? 'text-sm' : 'text-[11px]'}`}>{arrow}</span>
      {sign}{value}{suffix}
    </span>
  );
}

function findEquippedForSlot(slot, items, equipped) {
  const id = equipped?.[slot];
  if (!id) return null;
  return items.find((i) => i.id === id) || null;
}

function getResolved(item) {
  return item?.baseType ? gameData.resolveBaseType(item.baseType) : null;
}

function WeaponStats({ combat, t, large = false }) {
  return (
    <AttackModesDisplay
      attackModes={combat.attackModes}
      qualities={combat.qualities}
      twoHanded={combat.twoHanded}
      large={large}
    />
  );
}

function ArmourStats({ combat, compareCombat, t, large = false }) {
  const drDelta = compareCombat ? (combat.damageReduction ?? 0) - (compareCombat.damageReduction ?? 0) : null;
  const penaltyDelta = compareCombat ? (combat.dodgePenalty ?? 0) - (compareCombat.dodgePenalty ?? 0) : null;
  return (
    <div className={large ? 'space-y-2' : 'space-y-1.5'}>
      <div className={`flex items-center ${large ? 'gap-2' : 'gap-2'}`}>
        <span className={`material-symbols-outlined ${large ? 'text-lg' : 'text-sm'} text-primary-dim`}>shield</span>
        <span className={`${large ? 'text-base' : 'text-[10px]'} font-label uppercase tracking-wider text-on-surface-variant/60`}>
          {t('inventory.armourValue', 'Pancerz')}
        </span>
        <span className={`font-headline ${large ? 'text-lg' : 'text-sm'} text-primary`}>{combat.damageReduction ?? 0}</span>
        <Delta value={drDelta} t={t} large={large} />
      </div>
      <div className={`${large ? 'text-xs' : 'text-[9px]'} text-on-surface-variant/50 font-label leading-tight`}>
        {t('inventory.armourAbsorbHint', { dr: combat.damageReduction ?? 0, defaultValue: `Pochłania ${combat.damageReduction ?? 0} obrażeń z każdego trafienia` })}
      </div>
      {(combat.dodgePenalty != null && combat.dodgePenalty !== 0) && (
        <div className={`flex items-center gap-2 ${large ? 'text-base' : 'text-[10px]'} text-on-surface-variant/70 font-label`}>
          <span>{t('inventory.dodgePenalty', 'Kara do uniku')}:</span>
          <span className="text-error">{combat.dodgePenalty}</span>
          <Delta value={penaltyDelta} invert t={t} large={large} />
        </div>
      )}
      {combat.type && (
        <div className={`${large ? 'text-base' : 'text-[10px]'} text-on-surface-variant/60 font-label capitalize`}>
          {t(`inventory.armourType.${combat.type}`, combat.type)}
        </div>
      )}
    </div>
  );
}

function ShieldStats({ combat, compareCombat, t, large = false }) {
  const blockDelta = compareCombat ? (combat.blockChance ?? 0) - (compareCombat.blockChance ?? 0) : null;
  const reductionDelta = compareCombat
    ? Math.round(((combat.blockReduction ?? 0) - (compareCombat.blockReduction ?? 0)) * 100)
    : null;
  const penaltyDelta = compareCombat ? (combat.dodgePenalty ?? 0) - (compareCombat.dodgePenalty ?? 0) : null;
  return (
    <div className={large ? 'space-y-2' : 'space-y-1.5'}>
      <div className={`flex items-center ${large ? 'gap-2' : 'gap-2'}`}>
        <span className={`material-symbols-outlined ${large ? 'text-lg' : 'text-sm'} text-primary-dim`}>shield_with_heart</span>
        <span className={`${large ? 'text-base' : 'text-[10px]'} font-label uppercase tracking-wider text-on-surface-variant/60`}>
          {t('inventory.blockChance', 'Szansa blokowania')}
        </span>
        <span className={`font-headline ${large ? 'text-lg' : 'text-sm'} text-primary`}>{combat.blockChance ?? 0}%</span>
        <Delta value={blockDelta} suffix="%" t={t} large={large} />
      </div>
      {combat.blockReduction != null && (
        <div className={`flex items-center gap-2 ${large ? 'text-base' : 'text-[10px]'} text-on-surface-variant/70 font-label`}>
          <span>{t('inventory.blockReduction', 'Redukcja bloku')}:</span>
          <span>{Math.round((combat.blockReduction ?? 0) * 100)}%</span>
          <Delta value={reductionDelta} suffix="%" t={t} large={large} />
        </div>
      )}
      {(combat.dodgePenalty != null && combat.dodgePenalty !== 0) && (
        <div className={`flex items-center gap-2 ${large ? 'text-base' : 'text-[10px]'} text-on-surface-variant/70 font-label`}>
          <span>{t('inventory.dodgePenalty', 'Kara do uniku')}:</span>
          <span className="text-error">{combat.dodgePenalty}</span>
          <Delta value={penaltyDelta} invert t={t} large={large} />
        </div>
      )}
    </div>
  );
}

const LINEAGE_BADGE_TONE = {
  common: 'border-outline-variant/20 text-on-surface-variant bg-on-surface-variant/5',
  uncommon: 'border-primary/20 text-primary-dim bg-primary/5',
  rare: 'border-primary/40 text-primary bg-primary/10',
  epic: 'border-tertiary/30 text-tertiary-dim bg-tertiary/10',
  legendary: 'border-tertiary/50 text-tertiary bg-tertiary/15',
};

function lineageToneClass(rarity) {
  return LINEAGE_BADGE_TONE[(rarity || 'common').toLowerCase()] || LINEAGE_BADGE_TONE.common;
}

export default function ItemDetailBox({
  item,
  items = [],
  equipped = {},
  equippedSlot,
  equippableSlots,
  onEquipItem,
  onUnequipItem,
  onUseManaCrystal,
  onUseItem,
  onEnchantItem,
  onDiscardItem,
  onRegenerateImage,
  onLoreChange,
  onSetPocket,
  isRegenerating = false,
  largeImage = false,
  horizontal = false,
}) {
  const { t } = useTranslation();
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [regeneratingLore, setRegeneratingLore] = useState(false);
  const copyResetRef = useRef(null);

  const handleDiscardClick = useCallback(async () => {
    if (!onDiscardItem) return;
    if (!confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    setDiscarding(true);
    try {
      await onDiscardItem(item.id);
    } finally {
      setDiscarding(false);
      setConfirmingDiscard(false);
    }
  }, [onDiscardItem, confirmingDiscard, item.id]);

  const cancelDiscardConfirm = useCallback(() => {
    if (discarding) return;
    setConfirmingDiscard(false);
  }, [discarding]);

  const handleRegenerateLore = useCallback(async () => {
    if (regeneratingLore || !onLoreChange) return;
    setRegeneratingLore(true);
    try {
      const result = await apiClient.post('/ai/generate-long-description', {
        entityType: 'item',
        name: item.name,
        description: item.description || '',
        itemType: item.type || '',
        rarity: item.rarity || '',
      });
      if (result?.longDescription) {
        onLoreChange(item.id, result.longDescription);
      }
    } catch { /* best-effort */ } finally {
      setRegeneratingLore(false);
    }
  }, [regeneratingLore, onLoreChange, item.id, item.name, item.description, item.type, item.rarity]);

  const handleCopyPrompt = useCallback(async () => {
    if (!item.fullImagePrompt) return;
    try {
      await navigator.clipboard.writeText(item.fullImagePrompt);
      setPromptCopied(true);
      clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setPromptCopied(false), 2000);
    } catch { /* clipboard may be unavailable */ }
  }, [item.fullImagePrompt]);

  const rarity = item.rarity || item.availability || 'common';
  const rarityColor = rarityColors[rarity] || rarityColors.common;
  const badgeColor = rarityBadgeColors[rarity] || rarityBadgeColors.common;
  const icon = typeIcons[item.type] || typeIcons.misc;
  const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;

  const resolved = getResolved(item);
  const combat = resolved?.combat || null;
  const combatSource = resolved?.combatSource || null;
  const weight = resolved?.weight ?? item.weight ?? null;
  const properties = resolved?.properties || item.properties || [];
  const price = resolved?.price || item.price || null;
  const priceText = formatPrice(price, t);

  const compareSlot = !equippedSlot && equippableSlots.length > 0 ? equippableSlots[0] : null;
  const compareItem = compareSlot ? findEquippedForSlot(compareSlot, items, equipped) : null;
  const compareResolved = getResolved(compareItem);
  const compareCombat = (compareResolved?.combatSource === combatSource) ? compareResolved.combat : null;
  const isCrystal = isManaCrystal(item);

  const {
    attackModes,
    explanation: attackModesExplanation,
    specialProperties: itemSpecialProperties,
    loading: attackModesLoading,
    reloading: attackModesReloading,
    reload: reloadAttackModes,
  } = useItemAttackModes(
    combatSource ? null : item,
    combat ? { attackModes: combat } : null,
  );
  const canReloadStats = !combatSource && !resolved?.attackModes;

  const imageBlock = (imageClass = 'w-full aspect-[3/4]') => (
    <>
      {resolvedImageUrl ? (
        <div className="relative">
          <InventoryImage
            imageUrl={resolvedImageUrl}
            alt={item.name}
            sizeClass={imageClass}
            fallbackIcon={icon}
            wrapperClassName="border border-outline-variant/20 flex items-center justify-center overflow-hidden"
          />
          {item.fullImagePrompt && !promptExpanded && (
            <button
              type="button"
              onClick={() => setPromptExpanded(true)}
              aria-label={t('inventory.imagePromptTooltip', 'Prompt obrazka')}
              className="absolute top-2 left-2 flex items-center justify-center w-8 h-8 rounded-sm bg-surface-container-highest/60 backdrop-blur-md border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:bg-surface-container-highest/80 hover:border-primary/40 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">history_edu</span>
            </button>
          )}
          {promptExpanded && (
            <div className="absolute inset-0 flex items-end p-2" style={{ zIndex: 5 }}>
              <div className="w-full rounded-sm bg-surface-container-highest/70 backdrop-blur-md border border-outline-variant/25 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/15">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history_edu</span>
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant truncate">
                      {t('inventory.imagePromptTooltip', 'Prompt obrazka')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      aria-label={t('inventory.copyImagePrompt', 'Skopiuj prompt')}
                      className={`flex items-center gap-1 px-2 h-7 rounded-sm border transition-all ${
                        promptCopied
                          ? 'bg-success/15 border-success/40 text-success'
                          : 'bg-surface-container-highest/60 border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {promptCopied ? 'check' : 'content_copy'}
                      </span>
                      <span className="text-[10px] font-label uppercase tracking-widest">
                        {promptCopied
                          ? t('inventory.imagePromptCopied', 'Skopiowano!')
                          : t('inventory.copyImagePrompt', 'Skopiuj prompt')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptExpanded(false)}
                      aria-label={t('common.close', 'Zamknij')}
                      className="flex items-center justify-center w-7 h-7 rounded-sm bg-surface-container-highest/60 border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2 max-h-32 overflow-y-auto">
                  <p className="text-[11px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words">
                    {item.fullImagePrompt}
                  </p>
                </div>
              </div>
            </div>
          )}
          {onRegenerateImage && (
            <button
              type="button"
              onClick={() => onRegenerateImage(item.id)}
              disabled={isRegenerating}
              aria-label={t('inventory.regenerateImage', 'Wygeneruj ponownie')}
              title={t('inventory.regenerateImage', 'Wygeneruj ponownie')}
              className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-sm bg-surface-container-highest/80 backdrop-blur-sm text-on-surface-variant hover:text-primary border border-outline-variant/20 hover:border-primary/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
            >
              <span className={`material-symbols-outlined text-base ${isRegenerating ? 'animate-spin' : ''}`}>
                {isRegenerating ? 'progress_activity' : 'refresh'}
              </span>
            </button>
          )}
        </div>
      ) : onRegenerateImage ? (
        <button
          type="button"
          onClick={() => onRegenerateImage(item.id)}
          disabled={isRegenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-label uppercase tracking-wider text-on-surface-variant hover:text-primary border border-outline-variant/20 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className={`material-symbols-outlined text-sm ${isRegenerating ? 'animate-spin' : ''}`}>
            {isRegenerating ? 'progress_activity' : 'auto_fix_high'}
          </span>
          {t('inventory.regenerateImage', 'Wygeneruj ponownie')}
        </button>
      ) : null}
    </>
  );

  const nameBlock = (
    <div className="flex items-center gap-3">
      <span
        className={`material-symbols-outlined text-3xl ${rarityColor.split(' ').find((c) => c.startsWith('text-')) || 'text-on-surface'}`}
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 32" }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="font-headline text-2xl text-on-surface leading-tight">{item.name}</h4>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`inline-block text-xs font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${badgeColor}`}>
            {t(rarityLabels[rarity] || rarityLabels.common)}
          </span>
          {item.baseType && (
            <span className="text-sm font-label text-on-surface-variant/60">{resolved?.name || item.baseType}</span>
          )}
          {!item.baseType && item.type && (
            <span className="text-sm font-label text-on-surface-variant/60 capitalize">{t(`inventory.types.${item.type}`, item.type)}</span>
          )}
        </div>
      </div>
    </div>
  );

  const descriptionBlock = (
    <>
      {item.description && (
        <p className="text-sm text-on-surface-variant/80 leading-relaxed mt-2">
          {item.description}
        </p>
      )}
      {item.longDescription ? (
        <div className="mt-2 pt-2 border-t border-outline-variant/10">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-label uppercase tracking-widest text-on-surface-variant/50">
              {t('inventory.itemLore', 'Historia / szczegóły')}
            </p>
            {onLoreChange && (
              <button
                type="button"
                onClick={handleRegenerateLore}
                disabled={regeneratingLore}
                className="flex items-center gap-1 text-sm font-label text-on-surface-variant/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-sm ${regeneratingLore ? 'animate-spin' : ''}`}>
                  {regeneratingLore ? 'progress_activity' : 'refresh'}
                </span>
                {t('inventory.regenerateLore', 'Regeneruj')}
              </button>
            )}
          </div>
          <p className="text-sm text-on-surface-variant/70 leading-relaxed italic">
            {item.longDescription}
          </p>
        </div>
      ) : onLoreChange ? (
        <div className="mt-2 pt-2 border-t border-outline-variant/10">
          <button
            type="button"
            onClick={handleRegenerateLore}
            disabled={regeneratingLore}
            className="flex items-center gap-1.5 text-sm font-label text-on-surface-variant/50 hover:text-primary transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${regeneratingLore ? 'animate-spin' : ''}`}>
              {regeneratingLore ? 'progress_activity' : 'auto_stories'}
            </span>
            {regeneratingLore
              ? t('inventory.generatingLore', 'Generowanie historii...')
              : t('inventory.generateLore', 'Wygeneruj historię / szczegóły')}
          </button>
        </div>
      ) : null}
      {Array.isArray(item.composedFrom) && item.composedFrom.length > 0 && (
        <div className="border-t border-outline-variant/10 pt-2 mt-2">
          <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60 mb-1.5">
            {t('inventory.composedFromLabel', 'Składa się z')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {item.composedFrom.map((src, idx) => (
              <span
                key={`${src.itemKey || src.name || 'src'}_${idx}`}
                className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-sm border ${lineageToneClass(src.rarity)}`}
              >
                {src.kind === 'enchant_source' && (
                  <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                )}
                <span>{src.name || t('inventory.unknownItem', 'nieznane')}</span>
                {src.spell && (
                  <span className="opacity-60">+ {src.spell}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {(weight != null || priceText) && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-outline-variant/10 text-sm text-on-surface-variant/60">
          {weight != null ? (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">scale</span>
              {weight} {t('inventory.weightUnit', 'Enc')}
            </span>
          ) : <span />}
          {priceText && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">paid</span>
              {priceText}
            </span>
          )}
        </div>
      )}
    </>
  );

  const combatBlock = (
    <>
      {combat && (
        <div>
          {combatSource === 'weapon' && <WeaponStats combat={combat} t={t} large />}
          {combatSource === 'armour' && <ArmourStats combat={combat} compareCombat={compareCombat} t={t} large />}
          {combatSource === 'shield' && <ShieldStats combat={combat} compareCombat={compareCombat} t={t} large />}
          {compareItem && compareCombat && (
            <div className="mt-2 text-xs text-on-surface-variant/50 font-label italic">
              {t('inventory.compareWith', 'Porównanie z')}: {compareItem.name}
            </div>
          )}
        </div>
      )}
      {!combatSource && resolved?.attackModes && (
        <div>
          <AttackModesDisplay attackModes={resolved.attackModes} large />
          <SpecialPropertiesDisplay specialProperties={item.specialProperties || []} large />
        </div>
      )}
      {!combatSource && attackModesLoading && (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant/50">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          <span className="font-label">{t('inventory.loadingCombat', 'Ładowanie statystyk...')}</span>
        </div>
      )}
      {canReloadStats && attackModes && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-sm font-label uppercase tracking-wider text-on-surface-variant/50">
              {t('inventory.generatedStats', 'Wygenerowane staty')}
            </span>
            <button
              type="button"
              onClick={reloadAttackModes}
              disabled={attackModesReloading}
              title={t('inventory.reloadStats', 'Przelicz ponownie')}
              className="flex items-center gap-1 px-2 py-1 text-sm font-label text-on-surface-variant/60 hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined text-base ${attackModesReloading ? 'animate-spin' : ''}`}>
                {attackModesReloading ? 'progress_activity' : 'refresh'}
              </span>
              {t('inventory.reloadStats', 'Przelicz')}
            </button>
          </div>
          <AttackModesDisplay attackModes={attackModes} large />
          <SpecialPropertiesDisplay specialProperties={itemSpecialProperties} large />
          {attackModesExplanation && (
            <p className="text-sm text-on-surface-variant/60 leading-snug mt-2 italic">
              {attackModesExplanation}
            </p>
          )}
        </div>
      )}
      {canReloadStats && !attackModes && !attackModesLoading && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant/50 font-label">
              {t('inventory.noAttackModes', 'Brak statystyk bojowych')}
            </span>
            <button
              type="button"
              onClick={reloadAttackModes}
              disabled={attackModesReloading}
              title={t('inventory.reloadStats', 'Przelicz ponownie')}
              className="flex items-center gap-1 px-2 py-1 text-sm font-label text-on-surface-variant/60 hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined text-base ${attackModesReloading ? 'animate-spin' : ''}`}>
                {attackModesReloading ? 'progress_activity' : 'refresh'}
              </span>
              {t('inventory.reloadStats', 'Przelicz')}
            </button>
          </div>
          {attackModesExplanation && (
            <p className="text-sm text-on-surface-variant/60 leading-snug mt-2 italic">
              {attackModesExplanation}
            </p>
          )}
        </div>
      )}
      {properties.length > 0 && !combat && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {properties.map((prop) => (
            <span key={prop} className="text-xs px-2 py-0.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const pocketOptions = [...new Set([
    'Główna', 'Przednia', 'Lewa', 'Prawa',
    ...items.map((i) => i.pocket).filter(Boolean),
  ])];

  const pocketSelect = onSetPocket ? (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-sm text-on-surface-variant/60">work</span>
      <select
        value={item.pocket || ''}
        onChange={(e) => onSetPocket(item.id, e.target.value || null)}
        className="px-2 py-1 text-[11px] bg-surface-container-highest border border-outline-variant/20 rounded-sm text-on-surface focus:outline-none focus:border-primary/50 cursor-pointer"
      >
        <option value="">{t('inventory.pockets.none', '—')}</option>
        {pocketOptions.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  ) : null;

  const actionsBlock = (
    <div className="flex gap-2 flex-wrap items-center">
      {isCrystal ? (
        <button
          onClick={() => onUseManaCrystal?.(item.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-tertiary/15 text-tertiary border border-tertiary/30 rounded-sm hover:bg-tertiary/25 transition-colors shadow-[0_0_10px_rgba(197,154,255,0.2)]"
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          {t('inventory.useCrystal', 'Użyj kryształu')}
        </button>
      ) : equippedSlot ? (
        <button
          onClick={() => onUnequipItem(equippedSlot)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 rounded-sm hover:bg-error/20 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">close</span>
          {t('inventory.unequip', 'Unequip')}
        </button>
      ) : null}
      {!isCrystal && !equippedSlot && equippableSlots.length > 0 && equippableSlots.map((slot) => (
        <button
          key={slot}
          onClick={() => onEquipItem(item.id, slot)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">{SLOT_CONFIG[slot].icon}</span>
          {t(SLOT_CONFIG[slot].label, SLOT_CONFIG[slot].fallback)}
        </button>
      ))}
      {onUseItem && !isCrystal && (
        <button
          onClick={() => onUseItem(item.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-tertiary/10 text-tertiary border border-tertiary/20 rounded-sm hover:bg-tertiary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">back_hand</span>
          {t('inventory.use', 'Użyj')}
        </button>
      )}
      {onEnchantItem && !isCrystal && !item.props?.questItem && (
        <button
          onClick={() => onEnchantItem(item.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">auto_fix_high</span>
          {t('inventory.enchant', 'Zaczaruj')}
        </button>
      )}
      {onDiscardItem && !isCrystal && (
        item.props?.questItem ? (
          <button
            disabled
            title={t('inventory.cannotDiscardQuest', 'Nie możesz wyrzucić przedmiotu fabularnego')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-surface-container/40 text-on-surface-variant/40 border border-outline-variant/15 rounded-sm cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            {t('inventory.discard', 'Wyrzuć')}
          </button>
        ) : confirmingDiscard ? (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/80">
              {t('inventory.discardConfirmQuestion', 'Na pewno?')}
            </span>
            <button
              onClick={handleDiscardClick}
              disabled={discarding}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/30 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <span className={`material-symbols-outlined text-sm ${discarding ? 'animate-spin' : ''}`}>
                {discarding ? 'progress_activity' : 'check'}
              </span>
              {t('inventory.discardConfirm', 'Tak')}
            </button>
            <button
              onClick={cancelDiscardConfirm}
              disabled={discarding}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-surface-container/40 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container/60 transition-colors disabled:opacity-50"
            >
              {t('common.cancel', 'Anuluj')}
            </button>
          </div>
        ) : (
          <button
            onClick={handleDiscardClick}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 rounded-sm hover:bg-error/20 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            {t('inventory.discard', 'Wyrzuć')}
          </button>
        )
      )}
      {pocketSelect}
    </div>
  );

  if (horizontal) {
    return (
      <div className={`mt-3 bg-surface-container border ${rarityColor} rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-150`}>
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr_1fr] gap-5">
          {/* Col 1: Image */}
          <div className="min-w-0">
            {imageBlock('w-full aspect-square')}
          </div>

          {/* Col 2: Name + Description */}
          <div className="min-w-0">
            {nameBlock}
            {descriptionBlock}
          </div>

          {/* Col 3: Combat stats + Properties */}
          <div className="min-w-0 space-y-3">
            {combatBlock}
          </div>
        </div>

        <div className="border-t border-outline-variant/10 pt-3 mt-4">
          {actionsBlock}
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-3 bg-surface-container border ${rarityColor} rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-150`}>
      {resolvedImageUrl && (
        <div className="mb-3 relative">
          <InventoryImage
            imageUrl={resolvedImageUrl}
            alt={item.name}
            sizeClass={largeImage ? 'w-full aspect-[3/4]' : 'w-full aspect-square'}
            fallbackIcon={icon}
            wrapperClassName="border border-outline-variant/20 flex items-center justify-center overflow-hidden"
          />
          {item.fullImagePrompt && !promptExpanded && (
            <button
              type="button"
              onClick={() => setPromptExpanded(true)}
              aria-label={t('inventory.imagePromptTooltip', 'Prompt obrazka')}
              className="absolute top-2 left-2 flex items-center justify-center w-8 h-8 rounded-sm bg-surface-container-highest/60 backdrop-blur-md border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:bg-surface-container-highest/80 hover:border-primary/40 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">history_edu</span>
            </button>
          )}
          {promptExpanded && (
            <div className="absolute inset-0 flex items-end p-2" style={{ zIndex: 5 }}>
              <div className="w-full rounded-sm bg-surface-container-highest/70 backdrop-blur-md border border-outline-variant/25 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/15">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history_edu</span>
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant truncate">
                      {t('inventory.imagePromptTooltip', 'Prompt obrazka')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      aria-label={t('inventory.copyImagePrompt', 'Skopiuj prompt')}
                      className={`flex items-center gap-1 px-2 h-7 rounded-sm border transition-all ${
                        promptCopied
                          ? 'bg-success/15 border-success/40 text-success'
                          : 'bg-surface-container-highest/60 border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {promptCopied ? 'check' : 'content_copy'}
                      </span>
                      <span className="text-[10px] font-label uppercase tracking-widest">
                        {promptCopied
                          ? t('inventory.imagePromptCopied', 'Skopiowano!')
                          : t('inventory.copyImagePrompt', 'Skopiuj prompt')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptExpanded(false)}
                      aria-label={t('common.close', 'Zamknij')}
                      className="flex items-center justify-center w-7 h-7 rounded-sm bg-surface-container-highest/60 border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2 max-h-32 overflow-y-auto">
                  <p className="text-[11px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words">
                    {item.fullImagePrompt}
                  </p>
                </div>
              </div>
            </div>
          )}
          {onRegenerateImage && (
            <button
              type="button"
              onClick={() => onRegenerateImage(item.id)}
              disabled={isRegenerating}
              aria-label={t('inventory.regenerateImage', 'Wygeneruj ponownie')}
              title={t('inventory.regenerateImage', 'Wygeneruj ponownie')}
              className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-sm bg-surface-container-highest/80 backdrop-blur-sm text-on-surface-variant hover:text-primary border border-outline-variant/20 hover:border-primary/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
            >
              <span className={`material-symbols-outlined text-base ${isRegenerating ? 'animate-spin' : ''}`}>
                {isRegenerating ? 'progress_activity' : 'refresh'}
              </span>
            </button>
          )}
        </div>
      )}
      {!resolvedImageUrl && onRegenerateImage && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => onRegenerateImage(item.id)}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-label uppercase tracking-wider text-on-surface-variant hover:text-primary border border-outline-variant/20 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-sm ${isRegenerating ? 'animate-spin' : ''}`}>
              {isRegenerating ? 'progress_activity' : 'auto_fix_high'}
            </span>
            {t('inventory.regenerateImage', 'Wygeneruj ponownie')}
          </button>
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
          <h4 className="font-headline text-lg text-on-surface leading-tight">{item.name}</h4>
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

      {combat && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3">
          {combatSource === 'weapon' && <WeaponStats combat={combat} t={t} />}
          {combatSource === 'armour' && <ArmourStats combat={combat} compareCombat={compareCombat} t={t} />}
          {combatSource === 'shield' && <ShieldStats combat={combat} compareCombat={compareCombat} t={t} />}
          {compareItem && compareCombat && (
            <div className="mt-2 text-[9px] text-on-surface-variant/50 font-label italic">
              {t('inventory.compareWith', 'Porównanie z')}: {compareItem.name}
            </div>
          )}
        </div>
      )}

      {!combatSource && resolved?.attackModes && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3">
          <AttackModesDisplay attackModes={resolved.attackModes} />
          <SpecialPropertiesDisplay specialProperties={item.specialProperties || []} />
        </div>
      )}

      {!combatSource && attackModesLoading && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3 flex items-center gap-2 text-xs text-on-surface-variant/50">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          <span className="font-label">{t('inventory.loadingCombat', 'Ładowanie statystyk...')}</span>
        </div>
      )}

      {canReloadStats && attackModes && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-label uppercase tracking-wider text-on-surface-variant/50">
              {t('inventory.generatedStats', 'Wygenerowane staty')}
            </span>
            <button
              type="button"
              onClick={reloadAttackModes}
              disabled={attackModesReloading}
              title={t('inventory.reloadStats', 'Przelicz ponownie')}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-label text-on-surface-variant/60 hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined text-sm ${attackModesReloading ? 'animate-spin' : ''}`}>
                {attackModesReloading ? 'progress_activity' : 'refresh'}
              </span>
              {t('inventory.reloadStats', 'Przelicz')}
            </button>
          </div>
          <AttackModesDisplay attackModes={attackModes} />
          <SpecialPropertiesDisplay specialProperties={itemSpecialProperties} />
          {attackModesExplanation && (
            <p className="text-[11px] text-on-surface-variant/60 leading-snug mt-2 italic">
              {attackModesExplanation}
            </p>
          )}
        </div>
      )}

      {canReloadStats && !attackModes && !attackModesLoading && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant/50 font-label">
              {t('inventory.noAttackModes', 'Brak statystyk bojowych')}
            </span>
            <button
              type="button"
              onClick={reloadAttackModes}
              disabled={attackModesReloading}
              title={t('inventory.reloadStats', 'Przelicz ponownie')}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-label text-on-surface-variant/60 hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined text-sm ${attackModesReloading ? 'animate-spin' : ''}`}>
                {attackModesReloading ? 'progress_activity' : 'refresh'}
              </span>
              {t('inventory.reloadStats', 'Przelicz')}
            </button>
          </div>
          {attackModesExplanation && (
            <p className="text-[11px] text-on-surface-variant/60 leading-snug mt-2 italic">
              {attackModesExplanation}
            </p>
          )}
        </div>
      )}

      {item.description && (
        <p className="text-xs text-on-surface-variant/80 leading-relaxed border-t border-outline-variant/10 pt-2 mt-3">
          {item.description}
        </p>
      )}
      {item.longDescription ? (
        <div className="mt-2 pt-2 border-t border-outline-variant/10">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50">
              {t('inventory.itemLore', 'Historia / szczegóły')}
            </p>
            {onLoreChange && (
              <button
                type="button"
                onClick={handleRegenerateLore}
                disabled={regeneratingLore}
                className="flex items-center gap-1 text-[10px] font-label text-on-surface-variant/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-xs ${regeneratingLore ? 'animate-spin' : ''}`}>
                  {regeneratingLore ? 'progress_activity' : 'refresh'}
                </span>
                {t('inventory.regenerateLore', 'Regeneruj')}
              </button>
            )}
          </div>
          <p className="text-xs text-on-surface-variant/70 leading-relaxed italic">
            {item.longDescription}
          </p>
        </div>
      ) : onLoreChange ? (
        <div className="mt-2 pt-2 border-t border-outline-variant/10">
          <button
            type="button"
            onClick={handleRegenerateLore}
            disabled={regeneratingLore}
            className="flex items-center gap-1.5 text-xs font-label text-on-surface-variant/50 hover:text-primary transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${regeneratingLore ? 'animate-spin' : ''}`}>
              {regeneratingLore ? 'progress_activity' : 'auto_stories'}
            </span>
            {regeneratingLore
              ? t('inventory.generatingLore', 'Generowanie historii...')
              : t('inventory.generateLore', 'Wygeneruj historię / szczegóły')}
          </button>
        </div>
      ) : null}

      {properties.length > 0 && !combat && (
        <div className="flex flex-wrap gap-1 mt-2">
          {properties.map((prop) => (
            <span key={prop} className="text-[9px] px-1.5 py-0.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}

      {(weight != null || priceText) && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-outline-variant/10 text-[10px] text-on-surface-variant/60">
          {weight != null ? (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">scale</span>
              {weight} {t('inventory.weightUnit', 'Enc')}
            </span>
          ) : <span />}
          {priceText && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">paid</span>
              {priceText}
            </span>
          )}
        </div>
      )}

      {Array.isArray(item.composedFrom) && item.composedFrom.length > 0 && (
        <div className="border-t border-outline-variant/10 pt-2 mt-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 mb-1.5">
            {t('inventory.composedFromLabel', 'Składa się z')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {item.composedFrom.map((src, idx) => (
              <span
                key={`${src.itemKey || src.name || 'src'}_${idx}`}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm border ${lineageToneClass(src.rarity)}`}
              >
                {src.kind === 'enchant_source' && (
                  <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
                )}
                <span>{src.name || t('inventory.unknownItem', 'nieznane')}</span>
                {src.spell && (
                  <span className="opacity-60">+ {src.spell}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-outline-variant/10 pt-3 mt-3">
        <div className="flex gap-2 flex-wrap">
          {isCrystal ? (
            <button
              onClick={() => onUseManaCrystal?.(item.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-tertiary/15 text-tertiary border border-tertiary/30 rounded-sm hover:bg-tertiary/25 transition-colors shadow-[0_0_10px_rgba(197,154,255,0.2)]"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {t('inventory.useCrystal', 'Użyj kryształu')}
            </button>
          ) : equippedSlot ? (
            <button
              onClick={() => onUnequipItem(equippedSlot)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 rounded-sm hover:bg-error/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              {t('inventory.unequip', 'Unequip')}
            </button>
          ) : null}
          {!isCrystal && !equippedSlot && equippableSlots.length > 0 && equippableSlots.map((slot) => (
            <button
              key={slot}
              onClick={() => onEquipItem(item.id, slot)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">{SLOT_CONFIG[slot].icon}</span>
              {t(SLOT_CONFIG[slot].label, SLOT_CONFIG[slot].fallback)}
            </button>
          ))}
          {onUseItem && !isCrystal && (
            <button
              onClick={() => onUseItem(item.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-tertiary/10 text-tertiary border border-tertiary/20 rounded-sm hover:bg-tertiary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">back_hand</span>
              {t('inventory.use', 'Użyj')}
            </button>
          )}
          {onEnchantItem && !isCrystal && !item.props?.questItem && (
            <button
              onClick={() => onEnchantItem(item.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              {t('inventory.enchant', 'Zaczaruj')}
            </button>
          )}
          {onDiscardItem && !isCrystal && (
            item.props?.questItem ? (
              <button
                disabled
                title={t('inventory.cannotDiscardQuest', 'Nie możesz wyrzucić przedmiotu fabularnego')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-surface-container/40 text-on-surface-variant/40 border border-outline-variant/15 rounded-sm cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {t('inventory.discard', 'Wyrzuć')}
              </button>
            ) : confirmingDiscard ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/80">
                  {t('inventory.discardConfirmQuestion', 'Na pewno?')}
                </span>
                <button
                  onClick={handleDiscardClick}
                  disabled={discarding}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/30 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  <span className={`material-symbols-outlined text-sm ${discarding ? 'animate-spin' : ''}`}>
                    {discarding ? 'progress_activity' : 'check'}
                  </span>
                  {t('inventory.discardConfirm', 'Tak')}
                </button>
                <button
                  onClick={cancelDiscardConfirm}
                  disabled={discarding}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-surface-container/40 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container/60 transition-colors disabled:opacity-50"
                >
                  {t('common.cancel', 'Anuluj')}
                </button>
              </div>
            ) : (
              <button
                onClick={handleDiscardClick}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20 rounded-sm hover:bg-error/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {t('inventory.discard', 'Wyrzuć')}
              </button>
            )
          )}
          {pocketSelect}
        </div>
      </div>
    </div>
  );
}
