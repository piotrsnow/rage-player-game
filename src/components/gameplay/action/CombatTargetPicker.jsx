import { useTranslation } from 'react-i18next';

const ATTITUDE_STYLES = {
  hostile: 'bg-error/20 text-error border-error/30',
  neutral: 'bg-warning/20 text-warning border-warning/30',
  friendly: 'bg-success/20 text-success border-success/30',
};

export default function CombatTargetPicker({
  npcs,
  disabled,
  onInitiateCombat,
  onAttackNpc,
  onCancel,
}) {
  const { t } = useTranslation();

  return (
    <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('gameplay.selectTarget')}
      </label>

      <button
        onClick={onInitiateCombat}
        disabled={disabled}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-label text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-sm text-error">target</span>
        {t('gameplay.generalCombat')}
      </button>

      {npcs.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {npcs.map((npc) => {
            const attitudeKey = npc.attitude === 'hostile' ? 'attitudeHostile'
              : npc.attitude === 'friendly' ? 'attitudeFriendly' : 'attitudeNeutral';
            const attitudeStyle = ATTITUDE_STYLES[npc.attitude] || ATTITUDE_STYLES.neutral;
            return (
              <div
                key={npc.id || npc.name}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 rounded-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-on-surface truncate">{npc.name}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm border font-label uppercase tracking-wider ${attitudeStyle}`}>
                    {t(`gameplay.${attitudeKey}`)}
                  </span>
                </div>
                <button
                  onClick={() => onAttackNpc(npc.name)}
                  disabled={disabled}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-label uppercase tracking-widest text-error hover:text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-xs">swords</span>
                  {t('gameplay.attackNpc')}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant/60 italic px-1">
          {t('gameplay.noNpcsNearby')}
        </p>
      )}

      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t('gameplay.cancelCombat')}
      </button>
    </div>
  );
}
