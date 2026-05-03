import { useTranslation } from 'react-i18next';
import { calculateRecruitChance } from '../../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../../../stores/handlers/partyHandlers';

export default function RecruitNpcPicker({ npcs, partySize, onAttempt, onCancel }) {
  const { t } = useTranslation();
  const partyFull = partySize >= MAX_COMPANIONS;

  return (
    <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('party.recruitTitle', 'Kogo chcesz zaprosić?')}
      </label>
      {partyFull ? (
        <p className="text-[10px] text-on-surface-variant/70 italic px-1">
          {t('party.partyFull', 'Drużyna pełna ({{current}}/{{max}})', {
            current: partySize,
            max: MAX_COMPANIONS,
          })}
        </p>
      ) : npcs.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {npcs.map((npc) => {
            const chance = calculateRecruitChance(npc.disposition);
            const tone = chance >= 80 ? 'text-emerald-400' : chance >= 50 ? 'text-amber-300' : 'text-rose-400';
            return (
              <button
                key={npc.id || npc.name}
                onClick={() => onAttempt(npc)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 rounded-sm transition-all"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-xs text-primary">person</span>
                  <span className="text-sm text-on-surface truncate">{npc.name}</span>
                  {npc.role && <span className="text-[9px] text-on-surface-variant truncate">({npc.role})</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-on-surface-variant tabular-nums">
                    disp {npc.disposition ?? 0}
                  </span>
                  <span className={`text-[10px] font-bold tabular-nums ${tone}`}>
                    {t('party.recruitChance', 'Szansa: {{chance}}%', { chance })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant/60 italic px-1">
          {t('party.noRecruitableNpcs', 'Brak NPC z którymi masz wystarczająco dobre relacje.')}
        </p>
      )}
      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
