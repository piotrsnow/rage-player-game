import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import AttackModesDisplay from '../../shared/AttackModesDisplay';
import { useItemAttackModes } from '../../../hooks/useItemAttackModes';
import { rarityColors, typeIcons, rarityLabels, rarityBadgeColors } from './constants';

function formatPrice(price, t) {
  if (!price) return null;
  const parts = [];
  if (price.gold > 0) parts.push(`${price.gold} ${t('currency.goldShort', 'ZK')}`);
  if (price.silver > 0) parts.push(`${price.silver} ${t('currency.silverShort', 'SK')}`);
  if (price.copper > 0) parts.push(`${price.copper} ${t('currency.copperShort', 'MK')}`);
  return parts.join(' ');
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

  const { attackModes, loading: attackModesLoading } = useItemAttackModes(
    combatSource ? null : item,
    combat ? { attackModes: combat } : null,
  );

  const textColor = rarityColor.split(' ').find((c) => c.startsWith('text-')) || 'text-on-surface';

  return (
    <div className="w-[320px]">
      {resolvedImageUrl && (
        <div className="mb-2 w-full aspect-square rounded-sm overflow-hidden border border-outline-variant/20 bg-surface-container-highest/50 flex items-center justify-center">
          <img src={resolvedImageUrl} alt={item.name} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`material-symbols-outlined text-2xl ${textColor} shrink-0`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`font-headline text-base leading-tight ${textColor}`}>{item.name}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[11px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${badgeColor}`}>
              {t(rarityLabels[rarity] || rarityLabels.common)}
            </span>
            {resolved?.name && (
              <span className="text-[11px] font-label text-on-surface-variant/60">{resolved.name}</span>
            )}
            {!resolved && item.type && (
              <span className="text-[11px] font-label text-on-surface-variant/60 capitalize">
                {t(`inventory.types.${item.type}`, item.type)}
              </span>
            )}
          </div>
        </div>
      </div>

      {combatSource === 'weapon' && combat?.attackModes && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15">
          <AttackModesDisplay
            attackModes={combat.attackModes}
            qualities={combat.qualities}
            twoHanded={combat.twoHanded}
            compact
          />
        </div>
      )}

      {!combatSource && resolved?.attackModes && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15">
          <AttackModesDisplay attackModes={resolved.attackModes} compact />
        </div>
      )}

      {combatSource === 'armour' && combat && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-on-surface">
            <span className="material-symbols-outlined text-sm text-primary-dim">shield</span>
            <span className="font-label uppercase tracking-wider text-on-surface-variant/60">
              {t('inventory.armourValue', 'Pancerz')}
            </span>
            <span className="font-headline text-sm text-primary">
              {combat.damageReduction ?? 0}
            </span>
          </div>
          <div className="text-[10px] text-on-surface-variant/50 font-label leading-tight">
            {t('inventory.armourAbsorbHint', { dr: combat.damageReduction ?? 0, defaultValue: `Pochłania ${combat.damageReduction ?? 0} obrażeń z każdego trafienia` })}
          </div>
          {combat.dodgePenalty !== 0 && combat.dodgePenalty != null && (
            <div className="text-[11px] text-on-surface-variant/60 font-label">
              {t('inventory.dodgePenalty', 'Kara do uniku')}: <span className="text-error">{combat.dodgePenalty}</span>
            </div>
          )}
          {combat.type && (
            <div className="text-[11px] text-on-surface-variant/60 font-label capitalize">
              {t(`inventory.armourType.${combat.type}`, combat.type)}
            </div>
          )}
        </div>
      )}

      {combatSource === 'shield' && combat && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-on-surface">
            <span className="material-symbols-outlined text-sm text-primary-dim">shield_with_heart</span>
            <span className="font-label uppercase tracking-wider text-on-surface-variant/60">
              {t('inventory.blockChance', 'Szansa blokowania')}
            </span>
            <span className="font-headline text-sm text-primary">{combat.blockChance ?? 0}%</span>
          </div>
          {combat.blockReduction != null && (
            <div className="text-[11px] text-on-surface-variant/60 font-label">
              {t('inventory.blockReduction', 'Redukcja bloku')}: {Math.round((combat.blockReduction ?? 0) * 100)}%
            </div>
          )}
          {combat.dodgePenalty !== 0 && combat.dodgePenalty != null && (
            <div className="text-[11px] text-on-surface-variant/60 font-label">
              {t('inventory.dodgePenalty', 'Kara do uniku')}: <span className="text-error">{combat.dodgePenalty}</span>
            </div>
          )}
        </div>
      )}

      {!combatSource && attackModesLoading && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 flex items-center gap-2 text-xs text-on-surface-variant/50">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          <span className="font-label">{t('inventory.loadingCombat', 'Ładowanie statystyk...')}</span>
        </div>
      )}

      {!combatSource && !resolved?.attackModes && attackModes && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15">
          <AttackModesDisplay attackModes={attackModes} compact />
        </div>
      )}

      {item.description && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 text-xs text-on-surface-variant/70 leading-snug italic">
          {item.description}
        </div>
      )}

      {(weight != null || priceText) && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[11px] text-on-surface-variant/60">
          {weight != null && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">scale</span>
              {weight} {t('inventory.weightUnit', 'Enc')}
            </span>
          )}
          {priceText && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">paid</span>
              {priceText}
            </span>
          )}
        </div>
      )}

      {properties.length > 0 && !combatSource && (
        <div className="mt-2 pt-2 border-t border-outline-variant/15 flex flex-wrap gap-1">
          {properties.map((prop) => (
            <span key={prop} className="text-[10px] px-1.5 py-0.5 bg-surface-container-highest/50 border border-outline-variant/15 rounded-sm text-on-surface-variant/70">
              {prop}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
