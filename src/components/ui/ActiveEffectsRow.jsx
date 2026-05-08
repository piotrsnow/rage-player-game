import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CATEGORY_COLORS = {
  buff: 'border-green-500/60 text-green-400',
  debuff: 'border-red-500/60 text-red-400',
  dot: 'border-orange-500/60 text-orange-400',
  control: 'border-blue-500/60 text-blue-400',
  mixed: 'border-gray-400/60 text-gray-300',
};

const CATEGORY_ICONS = {
  buff: 'shield_with_heart',
  debuff: 'heart_broken',
  dot: 'local_fire_department',
  control: 'ac_unit',
  mixed: 'blur_on',
};

const SOURCE_ICONS = {
  spell: 'auto_fix_high',
  item: 'inventory_2',
  combat: 'swords',
  trap: 'warning',
  environmental: 'eco',
  ai: 'auto_awesome',
};

function formatDuration(duration) {
  if (!duration) return '';
  switch (duration.type) {
    case 'rounds': return duration.remaining != null ? `${duration.remaining} rnd` : '';
    case 'scenes': return duration.remaining != null ? `${duration.remaining} sc` : '';
    case 'time': return duration.remaining != null ? `${duration.remaining}h` : '';
    case 'permanent': return '∞';
    case 'until_rest': return '→rest';
    case 'manual': return '✋';
    default: return '';
  }
}

function formatMechanics(mechanics) {
  if (!mechanics) return '';
  const parts = [];
  if (mechanics.attributeMods && Object.keys(mechanics.attributeMods).length) {
    parts.push(Object.entries(mechanics.attributeMods)
      .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
      .join(', '));
  }
  if (mechanics.skillMods && Object.keys(mechanics.skillMods).length) {
    parts.push(Object.entries(mechanics.skillMods)
      .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
      .join(', '));
  }
  if (mechanics.testMod) parts.push(`test ${mechanics.testMod > 0 ? '+' : ''}${mechanics.testMod}`);
  if (mechanics.dotDamage) parts.push(`${mechanics.dotDamage} dmg/tick`);
  if (mechanics.dotHeal) parts.push(`+${mechanics.dotHeal} heal/tick`);
  if (mechanics.damageReduction) parts.push(`DR ${mechanics.damageReduction > 0 ? '+' : ''}${mechanics.damageReduction}`);
  if (mechanics.restrictions?.length) parts.push(mechanics.restrictions.join(', '));
  return parts.join(' · ');
}

function EffectBadge({ effect, compact = false }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const colorClass = CATEGORY_COLORS[effect.category] || CATEGORY_COLORS.mixed;
  const icon = SOURCE_ICONS[effect.source] || CATEGORY_ICONS[effect.category] || 'blur_on';
  const durText = formatDuration(effect.duration);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded-sm border bg-surface-container/40 backdrop-blur-sm ${colorClass} ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
        <span className={`material-symbols-outlined ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{icon}</span>
        {!compact && <span className="font-medium truncate max-w-[60px]">{effect.name}</span>}
        {durText && <span className="opacity-70 text-[8px]">{durText}</span>}
      </div>

      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 rounded-sm bg-surface-container-high border border-outline-variant/20 shadow-xl text-[10px] text-on-surface pointer-events-none">
          <div className="font-bold mb-0.5">{effect.name}</div>
          {effect.description && <div className="text-on-surface-variant mb-1">{effect.description}</div>}
          <div className="space-y-0.5 text-[9px]">
            {durText && <div className="text-on-surface-variant">Duration: {durText}</div>}
            {formatMechanics(effect.mechanics) && (
              <div className="text-on-surface-variant">{formatMechanics(effect.mechanics)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActiveEffectsRow({ effects, compact = false, maxVisible = 6 }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!effects?.length) return null;

  const visible = expanded ? effects : effects.slice(0, maxVisible);
  const overflow = effects.length - maxVisible;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((fx) => (
        <EffectBadge key={fx.id} effect={fx} compact={compact} />
      ))}
      {!expanded && overflow > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="px-1 py-0.5 rounded-sm bg-surface-container text-[9px] text-on-surface-variant hover:text-on-surface transition-colors"
        >
          +{overflow}
        </button>
      )}
    </div>
  );
}
