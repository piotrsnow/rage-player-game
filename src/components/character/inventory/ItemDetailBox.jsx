import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import { isManaCrystal } from '../../../data/rpgMagic';
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

function damageTypeLabel(damageType, t) {
  if (damageType === 'melee-2h') return t('inventory.damageMelee2h', 'Broń dwuręczna');
  if (damageType === 'melee-1h') return t('inventory.damageMelee1h', 'Broń jednoręczna');
  if (damageType === 'ranged-dex') return t('inventory.damageRangedDex', 'Broń dystansowa');
  if (damageType === 'ranged-str-dex') return t('inventory.damageRangedStrDex', 'Broń miotana');
  if (damageType === 'ranged-fixed') return t('inventory.damageRangedFixed', 'Broń palna');
  return null;
}

function Delta({ value, invert = false, suffix = '', t }) {
  if (value == null || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? 'text-primary' : 'text-error';
  const arrow = positive ? 'arrow_upward' : 'arrow_downward';
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-label ${color}`}>
      <span className="material-symbols-outlined text-[11px]">{arrow}</span>
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

function WeaponStats({ combat, compareCombat, t }) {
  const damageLabel = combat.damageType === 'ranged-fixed'
    ? `${combat.fixedDamage ?? 0}`
    : `+${combat.bonus ?? 0}`;
  const damageDelta = combat.damageType === 'ranged-fixed'
    ? (compareCombat?.damageType === 'ranged-fixed'
        ? (combat.fixedDamage ?? 0) - (compareCombat.fixedDamage ?? 0)
        : null)
    : (compareCombat ? (combat.bonus ?? 0) - (compareCombat.bonus ?? 0) : null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm text-error/80">swords</span>
        <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/60">
          {t('inventory.damage', 'Obrażenia')}
        </span>
        <span className="font-headline text-sm text-error">{damageLabel}</span>
        <Delta value={damageDelta} t={t} />
        {combat.twoHanded && (
          <span className="ml-auto text-[9px] font-label text-on-surface-variant/60 uppercase tracking-wider">2H</span>
        )}
      </div>
      <div className="text-[10px] text-on-surface-variant/60 font-label">
        {damageTypeLabel(combat.damageType, t)}
        {combat.range && <span> · {t('inventory.range', 'Zasięg')} {combat.range}</span>}
      </div>
      {combat.qualities?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {combat.qualities.map((q) => (
            <span key={q} className="text-[9px] px-1.5 py-0.5 bg-error/10 border border-error/20 rounded-sm text-error/90">
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ArmourStats({ combat, compareCombat, t }) {
  const drDelta = compareCombat ? (combat.damageReduction ?? 0) - (compareCombat.damageReduction ?? 0) : null;
  const penaltyDelta = compareCombat ? (combat.dodgePenalty ?? 0) - (compareCombat.dodgePenalty ?? 0) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm text-primary-dim">shield</span>
        <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/60">
          {t('inventory.armourValue', 'Pancerz')}
        </span>
        <span className="font-headline text-sm text-primary">{combat.damageReduction ?? 0}</span>
        <Delta value={drDelta} t={t} />
      </div>
      {(combat.dodgePenalty != null && combat.dodgePenalty !== 0) && (
        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/70 font-label">
          <span>{t('inventory.dodgePenalty', 'Kara do uniku')}:</span>
          <span className="text-error">{combat.dodgePenalty}</span>
          <Delta value={penaltyDelta} invert t={t} />
        </div>
      )}
      {combat.type && (
        <div className="text-[10px] text-on-surface-variant/60 font-label capitalize">
          {t(`inventory.armourType.${combat.type}`, combat.type)}
        </div>
      )}
    </div>
  );
}

function ShieldStats({ combat, compareCombat, t }) {
  const blockDelta = compareCombat ? (combat.blockChance ?? 0) - (compareCombat.blockChance ?? 0) : null;
  const reductionDelta = compareCombat
    ? Math.round(((combat.blockReduction ?? 0) - (compareCombat.blockReduction ?? 0)) * 100)
    : null;
  const penaltyDelta = compareCombat ? (combat.dodgePenalty ?? 0) - (compareCombat.dodgePenalty ?? 0) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm text-primary-dim">shield_with_heart</span>
        <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/60">
          {t('inventory.blockChance', 'Szansa blokowania')}
        </span>
        <span className="font-headline text-sm text-primary">{combat.blockChance ?? 0}%</span>
        <Delta value={blockDelta} suffix="%" t={t} />
      </div>
      {combat.blockReduction != null && (
        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/70 font-label">
          <span>{t('inventory.blockReduction', 'Redukcja bloku')}:</span>
          <span>{Math.round((combat.blockReduction ?? 0) * 100)}%</span>
          <Delta value={reductionDelta} suffix="%" t={t} />
        </div>
      )}
      {(combat.dodgePenalty != null && combat.dodgePenalty !== 0) && (
        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/70 font-label">
          <span>{t('inventory.dodgePenalty', 'Kara do uniku')}:</span>
          <span className="text-error">{combat.dodgePenalty}</span>
          <Delta value={penaltyDelta} invert t={t} />
        </div>
      )}
    </div>
  );
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
  onRegenerateImage,
  isRegenerating = false,
}) {
  const { t } = useTranslation();

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

  return (
    <div className={`mt-3 bg-surface-container border ${rarityColor} rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-150`}>
      {resolvedImageUrl && (
        <div className="mb-3 relative">
          <InventoryImage
            imageUrl={resolvedImageUrl}
            alt={item.name}
            sizeClass="w-full h-40"
            fallbackIcon={icon}
            wrapperClassName="border border-outline-variant/20 flex items-center justify-center overflow-hidden"
          />
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

      {combat && (
        <div className="border-t border-outline-variant/15 pt-3 mt-3">
          {combatSource === 'weapon' && <WeaponStats combat={combat} compareCombat={compareCombat} t={t} />}
          {combatSource === 'armour' && <ArmourStats combat={combat} compareCombat={compareCombat} t={t} />}
          {combatSource === 'shield' && <ShieldStats combat={combat} compareCombat={compareCombat} t={t} />}
          {compareItem && compareCombat && (
            <div className="mt-2 text-[9px] text-on-surface-variant/50 font-label italic">
              {t('inventory.compareWith', 'Porównanie z')}: {compareItem.name}
            </div>
          )}
        </div>
      )}

      {item.description && (
        <p className="text-xs text-on-surface-variant/80 leading-relaxed border-t border-outline-variant/10 pt-2 mt-3">
          {item.description}
        </p>
      )}

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

      <div className="border-t border-outline-variant/10 pt-3 mt-3">
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
