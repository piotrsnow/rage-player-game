import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import { rarityColors, typeIcons, rarityLabels, rarityBadgeColors } from './constants';

function formatPrice(price, t) {
  if (!price) return null;
  const parts = [];
  if (price.gold > 0) parts.push(`${price.gold} ${t('currency.goldShort', 'ZK')}`);
  if (price.silver > 0) parts.push(`${price.silver} ${t('currency.silverShort', 'SK')}`);
  if (price.copper > 0) parts.push(`${price.copper} ${t('currency.copperShort', 'MK')}`);
  return parts.join(' ');
}

function DamageTypeLabel({ damageType, t }) {
  if (damageType === 'melee-2h') return t('inventory.damageMelee2h', 'Broń dwuręczna');
  if (damageType === 'melee-1h') return t('inventory.damageMelee1h', 'Broń jednoręczna');
  if (damageType === 'ranged-dex') return t('inventory.damageRangedDex', 'Broń dystansowa');
  if (damageType === 'ranged-str-dex') return t('inventory.damageRangedStrDex', 'Broń miotana');
  if (damageType === 'ranged-fixed') return t('inventory.damageRangedFixed', 'Broń palna');
  return null;
}

export default function ItemTooltip({ item }) {
  const { t } = useTranslation();

  const rarity = item.rarity || item.availability || 'common';
  const rarityColor = rarityColors[rarity] || rarityColors.common;
  const badgeColor = rarityBadgeColors[rarity] || rarityBadgeColors.common;
  const icon = typeIcons[item.type] || typeIcons.misc;
  const resolvedImageUrl = item.imageUrl ? apiClient.resolveMediaUrl(item.imageUrl) : null;

  const resolved = item.baseType ? gameData.resolveBaseType(item.baseType) : null;
  const combat = resolved?.combat || null;
  const combatSource = resolved?.combatSource || null;
  const weight = resolved?.weight ?? item.weight ?? null;
  const price = resolved?.price || item.price || null;
  const properties = resolved?.properties || item.properties || [];
  const priceText = formatPrice(price, t);

  const textColor = rarityColor.split(' ').find((c) => c.startsWith('text-')) || 'text-on-surface';

  return (
    <div className="w-[280px]">
      {resolvedImageUrl && (
        <div className="mb-2 w-full aspect-square rounded-sm overflow-hidden border border-outline-variant/20 bg-surface-container-highest/50 flex items-center justify-center">
          <img src={resolvedImageUrl} alt={item.name} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`material-symbols-outlined text-xl ${textColor} shrink-0`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`font-headline text-sm leading-tight ${textColor}`}>{item.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${badgeColor}`}>
              {t(rarityLabels[rarity] || rarityLabels.common)}
            </span>
            {resolved?.name && (
              <span className="text-[9px] font-label text-on-surface-variant/60">{resolved.name}</span>
            )}
            {!resolved && item.type && (
              <span className="text-[9px] font-label text-on-surface-variant/60 capitalize">
                {t(`inventory.types.${item.type}`, item.type)}
              </span>
            )}
          </div>
        </div>
      </div>

      {combatSource === 'weapon' && combat && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface">
            <span className="material-symbols-outlined text-xs text-error/80">swords</span>
            <span className="font-label uppercase tracking-wider text-on-surface-variant/60">
              {t('inventory.damage', 'Obrażenia')}
            </span>
            <span className="font-headline text-[11px] text-error">
              {combat.damageType === 'ranged-fixed'
                ? `${combat.fixedDamage ?? 0}`
                : `+${combat.bonus ?? 0}`}
            </span>
            {combat.twoHanded && (
              <span className="text-[9px] font-label text-on-surface-variant/50 ml-auto">2H</span>
            )}
          </div>
          <div className="text-[9px] text-on-surface-variant/60 font-label">
            <DamageTypeLabel damageType={combat.damageType} t={t} />
            {combat.range && <span> · {t('inventory.range', 'Zasięg')} {combat.range}</span>}
          </div>
          {combat.qualities?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {combat.qualities.map((q) => (
                <span key={q} className="text-[9px] px-1.5 py-0.5 bg-error/10 border border-error/20 rounded-sm text-error/90">
                  {q}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {combatSource === 'armour' && combat && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface">
            <span className="material-symbols-outlined text-xs text-primary-dim">shield</span>
            <span className="font-label uppercase tracking-wider text-on-surface-variant/60">
              {t('inventory.armourValue', 'Pancerz')}
            </span>
            <span className="font-headline text-[11px] text-primary">
              {combat.damageReduction ?? 0}
            </span>
          </div>
          {combat.dodgePenalty !== 0 && combat.dodgePenalty != null && (
            <div className="text-[9px] text-on-surface-variant/60 font-label">
              {t('inventory.dodgePenalty', 'Kara do uniku')}: <span className="text-error">{combat.dodgePenalty}</span>
            </div>
          )}
          {combat.type && (
            <div className="text-[9px] text-on-surface-variant/60 font-label capitalize">
              {t(`inventory.armourType.${combat.type}`, combat.type)}
            </div>
          )}
        </div>
      )}

      {combatSource === 'shield' && combat && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface">
            <span className="material-symbols-outlined text-xs text-primary-dim">shield_with_heart</span>
            <span className="font-label uppercase tracking-wider text-on-surface-variant/60">
              {t('inventory.blockChance', 'Szansa blokowania')}
            </span>
            <span className="font-headline text-[11px] text-primary">{combat.blockChance ?? 0}%</span>
          </div>
          {combat.blockReduction != null && (
            <div className="text-[9px] text-on-surface-variant/60 font-label">
              {t('inventory.blockReduction', 'Redukcja bloku')}: {Math.round((combat.blockReduction ?? 0) * 100)}%
            </div>
          )}
          {combat.dodgePenalty !== 0 && combat.dodgePenalty != null && (
            <div className="text-[9px] text-on-surface-variant/60 font-label">
              {t('inventory.dodgePenalty', 'Kara do uniku')}: <span className="text-error">{combat.dodgePenalty}</span>
            </div>
          )}
        </div>
      )}

      {item.description && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 text-[10px] text-on-surface-variant/70 leading-snug italic">
          {item.description}
        </div>
      )}

      {(weight != null || priceText) && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[9px] text-on-surface-variant/60">
          {weight != null && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">scale</span>
              {weight} {t('inventory.weightUnit', 'Enc')}
            </span>
          )}
          {priceText && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">paid</span>
              {priceText}
            </span>
          )}
        </div>
      )}

      {properties.length > 0 && !combatSource && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 flex flex-wrap gap-1">
          {properties.map((prop) => (
            <span key={prop} className="text-[9px] px-1.5 py-0.5 bg-surface-container-highest/50 border border-outline-variant/15 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
