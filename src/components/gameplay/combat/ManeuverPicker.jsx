import { gameData } from '../../../services/gameDataService';
import { getDistance } from '../../../services/combatEngine';

const MANOEUVRE_ICONS = {
  attack: 'swords',
  rangedAttack: 'gps_fixed',
  dodge: 'shield',
  feint: 'swap_horiz',
  charge: 'directions_run',
  flee: 'exit_to_app',
  castSpell: 'auto_awesome',
  defend: 'security',
};

function isCustomAttackManoeuvre(manoeuvreKey) {
  return Boolean(manoeuvreKey && gameData.manoeuvres[manoeuvreKey]?.type === 'offensive');
}

export default function ManeuverPicker({
  availableManoeuvres,
  selectedManoeuvre,
  selectedTarget,
  customDescription,
  showSavedAttacks,
  savedCustomAttacks,
  enemies,
  myCombatant,
  selectedTargetOutOfMeleeRange,
  onManoeuvreSelect,
  onSelectTarget,
  onCustomDescriptionChange,
  onToggleSavedAttacks,
  onSelectSavedAttack,
  onRemoveCustomAttack,
  onExecute,
  t,
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {availableManoeuvres.map(([key, man]) => (
          <button
            key={key}
            onClick={() => onManoeuvreSelect(key)}
            className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-sm border text-[11px] transition-all ${
              selectedManoeuvre === key
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container/60'
            }`}
          >
            <span className="material-symbols-outlined text-base">{MANOEUVRE_ICONS[key] || 'help'}</span>
            <span className="font-bold">{t(`combat.manoeuvres.${key}`, man.name)}</span>
          </button>
        ))}
      </div>

      {selectedManoeuvre && (gameData.manoeuvres[selectedManoeuvre]?.type === 'offensive' || gameData.manoeuvres[selectedManoeuvre]?.type === 'magic') && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-on-surface-variant">
            {t('combat.selectTarget', 'Select Target')}:
          </div>
          <div className="flex gap-2 flex-wrap">
            {enemies.filter((e) => !e.isDefeated).map((e) => {
              const dist = myCombatant ? getDistance(myCombatant, e) : 0;
              return (
                <button
                  key={e.id}
                  onClick={() => onSelectTarget(e.id)}
                  className={`px-3 py-1.5 rounded-sm border text-[11px] font-bold transition-all ${
                    selectedTarget === e.id
                      ? 'bg-error/15 text-error border-error/30'
                      : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-error/20'
                  }`}
                >
                  {e.name} ({e.wounds}/{e.maxWounds})
                  <span className="ml-1 text-[10px] text-outline-variant font-normal">{dist}y</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedTargetOutOfMeleeRange && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-sm text-[11px] text-amber-400">
          <span className="material-symbols-outlined text-sm">warning</span>
          {t('combat.outOfRange', 'Target too far for melee. Move closer or use Charge.')}
        </div>
      )}

      {isCustomAttackManoeuvre(selectedManoeuvre) && (
        <div className="space-y-1.5">
          <label className="block text-[11px] text-on-surface-variant">
            {t('combat.customAttackLabel', 'Describe your attack')}
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleSavedAttacks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-surface-container/40 text-on-surface-variant border border-outline-variant/15 rounded-sm hover:border-primary/25 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">history</span>
              {t('combat.savedAttacksButton', 'Twoje ataki')}
              <span className="material-symbols-outlined text-sm">
                {showSavedAttacks ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          </div>
          {showSavedAttacks && (
            <div className="rounded-sm border border-outline-variant/15 bg-surface-container/30 overflow-hidden">
              {savedCustomAttacks.length > 0 ? (
                <div className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
                  {savedCustomAttacks.map((attack, index) => (
                    <div
                      key={`${index}_${attack}`}
                      className="flex items-start gap-2 px-2 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSavedAttack(attack)}
                        className="flex-1 min-w-0 px-2 py-1.5 text-left text-[12px] text-on-surface hover:bg-primary/10 rounded-sm transition-colors"
                      >
                        {attack}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveCustomAttack(attack)}
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-sm text-outline-variant hover:text-error hover:bg-error/10 transition-colors"
                        aria-label={t('combat.deleteSavedAttack', 'Usuń zapisany atak')}
                        title={t('combat.deleteSavedAttack', 'Usuń zapisany atak')}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2.5 text-[11px] text-outline-variant">
                  {t('combat.noSavedAttacks', 'Brak zapisanych niestandardowych ataków.')}
                </div>
              )}
            </div>
          )}
          <textarea
            value={customDescription}
            onChange={(event) => onCustomDescriptionChange(event.target.value)}
            rows={3}
            placeholder={t('combat.customAttackPlaceholder', 'Describe how you strike to earn creativity bonus to the attack roll.')}
            className="w-full px-3 py-2 rounded-sm border border-outline-variant/15 bg-surface-container/40 text-[12px] text-on-surface placeholder:text-outline-variant/70 focus:outline-none focus:border-primary/30 resize-y min-h-[88px]"
          />
          <div className="text-[10px] text-outline-variant">
            {t('combat.customAttackHint', 'A richer, more tactical description can grant extra creativity to the attack roll.')}
          </div>
        </div>
      )}

      <button
        onClick={onExecute}
        disabled={!selectedManoeuvre || ((gameData.manoeuvres[selectedManoeuvre]?.type === 'offensive' || gameData.manoeuvres[selectedManoeuvre]?.type === 'magic') && !selectedTarget) || selectedTargetOutOfMeleeRange}
        className="w-full px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/20 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {selectedTargetOutOfMeleeRange ? t('combat.outOfRangeShort', 'Out of range') : t('combat.execute', 'Execute')}
      </button>
    </div>
  );
}
