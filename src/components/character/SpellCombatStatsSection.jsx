import { useTranslation } from 'react-i18next';
import { useSpellCombatStats } from '../../hooks/useSpellCombatStats';
import AttackModesDisplay from '../shared/AttackModesDisplay.jsx';
import { DAMAGE_TYPES, evaluateComponent } from '../../../shared/domain/damageTypes.js';

const SPELL_TYPE_LABELS = {
  buff: 'Wzmocnienie',
  utility: 'Utility',
  control: 'Kontrola',
};

function fmtScale(intScale) {
  if (intScale === 1) return 'INT';
  if (intScale === 0.5) return 'INT/2';
  if (intScale === 0.25) return 'INT/4';
  if (intScale === 0.33) return 'INT/3';
  if (intScale === 0.75) return '3/4 INT';
  return `${intScale}×INT`;
}

function HealPreview({ supportModes, attrs }) {
  const healMode = supportModes?.melee || supportModes?.ranged || supportModes?.aoe;
  if (!healMode?.healComponents?.length) return null;

  const int = attrs?.inteligencja || 0;
  const total = healMode.healComponents.reduce(
    (s, c) => s + evaluateComponent(c, attrs || {}), 0,
  );
  const first = healMode.healComponents[0];
  const typeDef = first?.type ? DAMAGE_TYPES[first.type] : null;

  const scale = first.intScale ? fmtScale(first.intScale) : '';
  const flat = (first.flat || 0) > 0 ? (scale ? ` + ${first.flat}` : `${first.flat}`) : '';
  const formula = `${scale}${flat}`;

  return (
    <div className="space-y-0.5">
      <span className="font-label uppercase tracking-wider text-on-surface-variant/60 text-sm">
        Leczenie
      </span>
      <div className="flex items-center gap-1.5 py-1">
        <span className="material-symbols-outlined text-xl text-emerald-400 mt-0.5 shrink-0">
          healing
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeDef && (
            <>
              <span className={`material-symbols-outlined text-lg ${typeDef.color}`}>{typeDef.icon}</span>
              <span className={`font-label uppercase tracking-wider text-xs ${typeDef.color}`}>{typeDef.label}</span>
            </>
          )}
          <span className="font-headline text-lg text-emerald-400">
            Leczy {formula} HP
          </span>
          {total > 0 && (
            <span className="text-base text-emerald-400/60">
              = {total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders spell combat stats (damage/heal/type) with lazy-fetch and a Przelicz button.
 * Designed to be embedded in spell detail modals (SpellsTab, CharacterPanel).
 *
 * For built-in spells, shows combatStats from the catalog (no reload button).
 * For custom spells, lazily fetches via useSpellCombatStats and offers reload.
 */
export default function SpellCombatStatsSection({ spell, character }) {
  const { t } = useTranslation();

  const hydratedSpell = character?.customSpells?.find(
    (s) => (spell?.customSpellId && s?.id === spell.customSpellId)
      || (s?.name && s.name === spell?.name),
  );
  const customSpellId = spell?.customSpellId || hydratedSpell?.id || null;
  const existingStats = spell?.combatStats ?? hydratedSpell?.combatStats ?? null;

  const meta = spell?.isCustom
    ? { isCustom: true, combatStats: existingStats }
    : null;

  const {
    combatStats, explanation, loading, reloading, reload,
  } = useSpellCombatStats(customSpellId, meta);

  const cs = spell?.isCustom ? combatStats : (spell?.combatStats ?? existingStats);

  if (!cs && !loading && !reloading && !spell?.isCustom) return null;

  const hasOffensiveModes = cs?.attackModes
    && (cs.attackModes.melee || cs.attackModes.ranged || cs.attackModes.aoe);

  return (
    <div className="rounded-sm bg-surface-container-high/40 border border-outline-variant/10 p-3 mt-3">
      {(loading || reloading) && (
        <div className="flex items-center gap-1.5 text-sm text-on-surface-variant/60">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          <span>{t('magic.generatingStats', { defaultValue: 'Generuję statystyki...' })}</span>
        </div>
      )}

      {!loading && !reloading && cs && (
        <>
          {cs.type === 'offensive' && hasOffensiveModes && (
            <AttackModesDisplay
              attackModes={cs.attackModes}
              attrs={character?.attributes}
              qualities={cs.qualities || []}
            />
          )}

          {cs.type === 'heal' && cs.supportModes && (
            <HealPreview
              supportModes={cs.supportModes}
              attrs={character?.attributes}
            />
          )}

          {SPELL_TYPE_LABELS[cs.type] && (
            <div className="flex items-center gap-1.5">
              <span className="font-label uppercase tracking-wider text-on-surface-variant/60 text-sm">
                {t('magic.spellType', 'Typ')}
              </span>
              <span className="text-sm px-1.5 py-0.5 bg-tertiary/10 border border-tertiary/20 rounded-sm text-tertiary/90">
                {SPELL_TYPE_LABELS[cs.type]}
              </span>
            </div>
          )}

          {explanation && (
            <p className="text-xs text-on-surface-variant/50 leading-snug mt-2 italic">
              {explanation}
            </p>
          )}
        </>
      )}

      {!loading && !reloading && !cs && spell?.isCustom && (
        <p className="text-sm text-on-surface-variant/60">
          {t('magic.noStatsYet', { defaultValue: 'Brak statystyk bojowych — kliknij Przelicz.' })}
        </p>
      )}

      {spell?.isCustom && customSpellId && (
        <button
          type="button"
          onClick={reload}
          disabled={loading || reloading}
          className="flex items-center gap-1.5 text-sm font-label text-on-surface-variant/80 hover:text-tertiary transition-colors disabled:opacity-50 mt-2"
        >
          <span className={`material-symbols-outlined text-base ${reloading ? 'animate-spin' : ''}`}>
            {reloading ? 'progress_activity' : 'refresh'}
          </span>
          {t('magic.reloadSpellStats', 'Przelicz staty')}
        </button>
      )}
    </div>
  );
}
