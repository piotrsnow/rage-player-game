import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_KEYS, ATTRIBUTE_SHORT } from '../../../data/rpgSystem';

/**
 * Full NPC character sheet — used inside the World State NPC panel (expanded
 * section) and inside the chat NpcSheetModal. Reads the `stats` JSON shape
 * emitted by backend/src/services/npcs/npcCharacterSheet.js:
 *   { race, creatureKind, level, attributes, wounds, maxWounds, mana,
 *     skills, weapons, armourDR, traits }
 *
 * Renders nothing when the NPC has no stats yet (legacy rows pre-migration);
 * the caller should decide whether to hide itself entirely or show a
 * placeholder.
 */
export default function NpcStatCard({ npc }) {
  const { t } = useTranslation();
  const stats = npc?.stats;
  if (!stats || typeof stats !== 'object' || !stats.attributes) return null;

  const attrs = stats.attributes || {};
  const skills = stats.skills && typeof stats.skills === 'object' ? stats.skills : {};
  const weapons = Array.isArray(stats.weapons) ? stats.weapons : [];
  const traits = Array.isArray(stats.traits) ? stats.traits : [];
  const mana = stats.mana || { current: 0, max: 0 };
  const wounds = typeof stats.wounds === 'number' ? stats.wounds : stats.maxWounds;
  const maxWounds = stats.maxWounds;

  const raceLabel = npc.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc.creatureKind || t('worldState.races.none');

  return (
    <div className="mt-2 pt-2 border-t border-outline-variant/10 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-outline">{t('worldState.race')}:</span>
          <span className="font-medium text-on-surface">{raceLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-outline">{t('worldState.level')}:</span>
          <span className="font-bold text-primary">{stats.level ?? npc.level ?? 1}</span>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-outline mb-1">{t('worldState.attributes')}</div>
        <div className="grid grid-cols-6 gap-1">
          {ATTRIBUTE_KEYS.map((key) => (
            <div key={key} className="text-center px-1 py-1 rounded-sm bg-surface-container/50 border border-outline-variant/10">
              <div className="text-[9px] text-outline leading-tight">{ATTRIBUTE_SHORT[key]}</div>
              <div className="text-sm font-bold text-on-surface leading-tight">{attrs[key] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-error-container/15 border border-error/20">
          <span className="material-symbols-outlined text-xs text-error">favorite</span>
          <span className="text-outline">{t('worldState.wounds')}:</span>
          <span className="font-bold text-on-surface">{wounds}/{maxWounds}</span>
        </div>
        {mana?.max > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-tertiary-container/15 border border-tertiary/20">
            <span className="material-symbols-outlined text-xs text-tertiary">auto_fix_high</span>
            <span className="text-outline">{t('worldState.mana')}:</span>
            <span className="font-bold text-on-surface">{mana.current ?? mana.max}/{mana.max}</span>
          </div>
        )}
      </div>

      {Object.keys(skills).length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-outline mb-1">{t('worldState.skills')}</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(skills)
              .filter(([, level]) => typeof level === 'number' && level > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([name, level]) => (
                <span key={name} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/15 text-on-surface">
                  {name} <span className="text-primary font-bold">{level}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {(weapons.length > 0 || typeof stats.armourDR === 'number') && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {weapons.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-outline mb-1">{t('worldState.weapons')}</div>
              <div className="flex flex-wrap gap-1">
                {weapons.map((w, i) => (
                  <span key={`${w}_${i}`} className="px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/15 text-on-surface">{w}</span>
                ))}
              </div>
            </div>
          )}
          {typeof stats.armourDR === 'number' && stats.armourDR > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-outline mb-1">{t('worldState.armour')}</div>
              <span className="inline-block px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/15 text-on-surface font-bold">{stats.armourDR}</span>
            </div>
          )}
        </div>
      )}

      {traits.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-outline mb-1">{t('worldState.traits')}</div>
          <div className="flex flex-wrap gap-1">
            {traits.map((trait, i) => (
              <span key={`${trait}_${i}`} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-tertiary-container/15 border border-tertiary/20 text-tertiary">{trait}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
