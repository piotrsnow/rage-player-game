import { useTranslation } from 'react-i18next';
import { calculateRecruitChance } from '../../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../../../stores/handlers/partyHandlers';

export default function RecruitNpcPicker({ npcs, partySize, onAttempt, onCancel }) {
  const { t } = useTranslation();
  const partyFull = partySize >= MAX_COMPANIONS;

  return (
    <div className="bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">group_add</span>
          <h2 className="text-sm font-bold text-on-surface">
            {t('party.recruitTitle', 'Kogo chcesz zaprosić?')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant font-label">
            {t('party.teamSize', 'Drużyna: {{current}}/{{max}}', { current: partySize, max: MAX_COMPANIONS })}
          </span>
          <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {partyFull ? (
          <p className="text-xs text-on-surface-variant/70 italic px-1">
            {t('party.partyFull', 'Drużyna pełna ({{current}}/{{max}})', {
              current: partySize,
              max: MAX_COMPANIONS,
            })}
          </p>
        ) : npcs.length > 0 ? (
          <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            {npcs.map((npc) => {
              const chance = calculateRecruitChance(npc.disposition);
              const tone = chance >= 80 ? 'text-emerald-400' : chance >= 50 ? 'text-amber-300' : 'text-rose-400';
              return (
                <button
                  key={npc.id || npc.name}
                  onClick={() => onAttempt(npc)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 rounded-sm transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-sm text-primary">person</span>
                    <span className="text-sm text-on-surface truncate">{npc.name}</span>
                    {npc.role && <span className="text-[10px] text-on-surface-variant">· {npc.role}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-on-surface-variant tabular-nums">
                      disp {npc.disposition ?? 0}
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums ${tone}`}>
                      {chance}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant/60 italic px-1">
            {t('party.noRecruitableNpcs', 'Brak NPC z którymi masz wystarczająco dobre relacje.')}
          </p>
        )}
      </div>
    </div>
  );
}
