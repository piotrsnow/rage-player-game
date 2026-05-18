import { useTranslation } from 'react-i18next';
import {
  ATTACK_MODE_KEYS,
  evaluateAttackMode,
} from '../../../shared/domain/attackModes.js';
import {
  DAMAGE_TYPES,
  formatComponentLabel,
} from '../../../shared/domain/damageTypes.js';

const MODE_CONFIG = {
  melee:  { icon: 'swords',       label: 'attackModes.melee',  fallback: 'Wręcz' },
  ranged: { icon: 'gps_fixed',    label: 'attackModes.ranged', fallback: 'Dystans' },
  aoe:    { icon: 'destruction',  label: 'attackModes.aoe',    fallback: 'Obszar' },
};

const AOE_SHAPE_LABELS = {
  adjacent: 'Przyległy',
  cone: 'Stożek',
  line: 'Linia',
  radius: 'Okrąg',
};

function DamageComponentRow({ component, compact = false }) {
  const typeDef = DAMAGE_TYPES[component.type] || DAMAGE_TYPES.fizyczne;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`material-symbols-outlined ${compact ? 'text-xs' : 'text-base'} ${typeDef.color}`}>{typeDef.icon}</span>
      <span className="text-on-surface-variant/80">{formatComponentLabel(component)}</span>
    </span>
  );
}

function ModeRow({ modeKey, mode, attrs, compact = false }) {
  const { t } = useTranslation();
  const cfg = MODE_CONFIG[modeKey];
  const evaluated = attrs ? evaluateAttackMode(mode, attrs) : null;
  const modeQualities = mode.qualities || [];

  return (
    <div className={`flex items-start gap-2 ${compact ? 'py-0.5' : 'py-1'}`}>
      <span className={`material-symbols-outlined ${compact ? 'text-xs' : 'text-lg'} text-error/70 mt-0.5 shrink-0`}>
        {cfg.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-label uppercase tracking-wider text-on-surface-variant/60 ${compact ? 'text-[9px]' : 'text-sm'}`}>
            {t(cfg.label, cfg.fallback)}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {mode.damageComponents.map((c, i) => (
              <span key={i} className={`font-headline ${compact ? 'text-[11px]' : 'text-base'} text-error`}>
                <DamageComponentRow component={c} compact={compact} />
              </span>
            ))}
          </div>
          {evaluated && evaluated.total > 0 && (
            <span className={`${compact ? 'text-[10px]' : 'text-sm'} text-error/60`}>
              = {evaluated.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {modeKey === 'ranged' && mode.range && (
            <span className={`${compact ? 'text-[9px]' : 'text-xs'} text-on-surface-variant/50`}>
              {t('attackModes.range', 'Zasięg')}: {mode.range}
            </span>
          )}
          {modeKey === 'aoe' && (
            <>
              {mode.range && (
                <span className={`${compact ? 'text-[9px]' : 'text-xs'} text-on-surface-variant/50`}>
                  {t('attackModes.range', 'Zasięg')}: {mode.range}
                </span>
              )}
              {mode.aoeShape && (
                <span className={`${compact ? 'text-[9px]' : 'text-xs'} text-on-surface-variant/50`}>
                  {AOE_SHAPE_LABELS[mode.aoeShape] || mode.aoeShape} {mode.aoeSize}
                </span>
              )}
            </>
          )}
          {modeQualities.length > 0 && modeQualities.map((q) => (
            <span key={q} className={`${compact ? 'text-[8px]' : 'text-[11px]'} px-1 py-0.5 bg-error/8 border border-error/15 rounded-sm text-error/80`}>
              {q}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders attack modes for a weapon, spell, or item.
 *
 * @param {object} attackModes - { melee, ranged, aoe } from the entity
 * @param {object} [attrs] - Character attributes for computing numeric damage
 * @param {string[]} [qualities] - Top-level qualities (shown separately)
 * @param {boolean} [twoHanded] - Whether the weapon is two-handed
 * @param {boolean} [compact] - Compact mode for tooltips
 */
export default function AttackModesDisplay({
  attackModes,
  attrs,
  qualities = [],
  twoHanded = false,
  compact = false,
}) {
  const { t } = useTranslation();
  if (!attackModes) return null;

  const activeModes = ATTACK_MODE_KEYS.filter((k) => attackModes[k] != null);
  if (activeModes.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-label uppercase tracking-wider text-on-surface-variant/60 ${compact ? 'text-[9px]' : 'text-sm'}`}>
          {t('inventory.damage', 'Obrażenia')}
        </span>
        {twoHanded && (
          <span className={`${compact ? 'text-[9px]' : 'text-xs'} font-label text-on-surface-variant/50 ml-auto uppercase tracking-wider`}>2H</span>
        )}
      </div>

      {activeModes.map((key) => (
        <ModeRow key={key} modeKey={key} mode={attackModes[key]} attrs={attrs} compact={compact} />
      ))}

      {!compact && (
        <div className="text-xs text-on-surface-variant/50 font-label leading-snug mt-1">
          {t('inventory.damageFormulaSuffix', '- WYT celu - Pancerz = finalne obrażenia')}
        </div>
      )}

      {qualities.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {qualities.map((q) => (
            <span key={q} className={`${compact ? 'text-[9px]' : 'text-[11px]'} px-1.5 py-0.5 bg-error/10 border border-error/20 rounded-sm text-error/90`}>
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
