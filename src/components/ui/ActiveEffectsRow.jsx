import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

const EFFECT_NAME_PL = {
  'Blinded': 'Oślepienie',
  'Stunned': 'Ogłuszenie',
  'Poisoned': 'Zatrucie',
  'Burning': 'Podpalenie',
  'Frightened': 'Strach',
  'Frozen': 'Zamrożenie',
  'Bleeding': 'Krwawienie',
  'Paralyzed': 'Paraliż',
  'Slowed': 'Spowolnienie',
  'Weakened': 'Osłabienie',
  'Silenced': 'Uciszenie',
  'Charmed': 'Oczarowanie',
  'Prone': 'Powalenie',
  'Restrained': 'Unieruchomienie',
  'Deafened': 'Ogłuszenie (słuch)',
  'Invisible': 'Niewidzialność',
  'Haste': 'Przyspieszenie',
  'Shield': 'Tarcza',
  'Regeneration': 'Regeneracja',
  'Blessed': 'Błogosławieństwo',
};

function localizeEffectName(name) {
  return EFFECT_NAME_PL[name] || name;
}

const RESTRICTION_LABELS = {
  no_attack: 'Brak ataku',
  no_movement: 'Brak ruchu',
  no_magic: 'Brak magii',
  skip_turn: 'Pomijanie tury',
  disadvantage_on_attacks: 'Utrudnienie ataków',
  cannot_target_specific: 'Nie może wybrać celu',
  cannot_dodge: 'Nie może unikać',
  cannot_parry: 'Nie może parować',
  cannot_cast: 'Nie może rzucać zaklęć',
  half_movement: 'Połowa ruchu',
  no_reactions: 'Brak reakcji',
};

function formatRestriction(key) {
  if (RESTRICTION_LABELS[key]) return RESTRICTION_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  if (mechanics.restrictions?.length) parts.push(mechanics.restrictions.map(formatRestriction).join(', '));
  return parts.join(' · ');
}

function EffectBadge({ effect, compact = false, large = false }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);
  const badgeRef = useRef(null);
  const colorClass = CATEGORY_COLORS[effect.category] || CATEGORY_COLORS.mixed;
  const icon = SOURCE_ICONS[effect.source] || CATEGORY_ICONS[effect.category] || 'blur_on';
  const durText = formatDuration(effect.duration);

  const badgeText = large ? 'text-base' : compact ? 'text-[8px]' : 'text-[9px]';
  const iconText = large ? 'text-xl' : compact ? 'text-[10px]' : 'text-[11px]';
  const durClass = large ? 'text-sm' : 'text-[8px]';

  const handleMouseEnter = useCallback(() => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShowTooltip(true);
  }, []);

  const tooltipW = large ? 256 : 192;

  return (
    <div
      ref={badgeRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex items-center gap-1 ${large ? 'px-2 py-1' : 'px-1 py-0.5'} rounded-sm border bg-surface-container/40 backdrop-blur-sm ${colorClass} ${badgeText}`}>
        <span className={`material-symbols-outlined ${iconText}`}>{icon}</span>
        <span className={`font-medium truncate ${large ? 'max-w-[160px]' : 'max-w-[100px]'}`}>
          {localizeEffectName(effect.name)}{durText ? ` (${durText})` : ''}
        </span>
      </div>

      {showTooltip && tooltipPos && createPortal(
        <div
          className={`fixed z-[9999] ${large ? 'w-64 p-3' : 'w-48 p-2'} rounded-sm bg-surface-container-high border border-outline-variant/20 shadow-xl ${large ? 'text-lg' : 'text-[10px]'} text-on-surface pointer-events-none`}
          style={{
            left: Math.max(8, Math.min(tooltipPos.x - tooltipW / 2, window.innerWidth - tooltipW - 8)),
            top: Math.max(8, tooltipPos.y - 8),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-bold mb-0.5">{localizeEffectName(effect.name)}</div>
          {effect.description && <div className="text-on-surface-variant mb-1">{effect.description}</div>}
          <div className={`space-y-0.5 ${large ? 'text-base' : 'text-[9px]'}`}>
            {durText && <div className="text-on-surface-variant">Czas trwania: {durText}</div>}
            {formatMechanics(effect.mechanics) && (
              <div className="text-on-surface-variant">{formatMechanics(effect.mechanics)}</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function ActiveEffectsRow({ effects, compact = false, large = false, maxVisible = 6 }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!effects?.length) return null;

  const visible = expanded ? effects : effects.slice(0, maxVisible);
  const overflow = effects.length - maxVisible;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((fx) => (
        <EffectBadge key={fx.id} effect={fx} compact={compact} large={large} />
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
