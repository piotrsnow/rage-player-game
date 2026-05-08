import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import CombatLogEntry from '../CombatLogEntry';

function CombatLog({ combatLog, legacyLog, expanded = false }) {
  const { t } = useTranslation();
  const newestId = combatLog.length > 0 ? combatLog[combatLog.length - 1].id : null;

  const wrapperClass = expanded
    ? 'flex-1 min-w-0 flex flex-col rounded-md border border-outline-variant/10 bg-surface-container/20 overflow-hidden h-[clamp(200px,30vh,400px)]'
    : 'flex-1 min-w-0 flex flex-col rounded-md border border-outline-variant/10 bg-surface-container/20 overflow-hidden max-h-[314px] xl:h-[254px] xl:max-h-[254px]';

  if (combatLog.length === 0 && (!legacyLog || legacyLog.length === 0)) {
    return (
      <div className={wrapperClass}>
        <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-3 py-2 border-b border-outline-variant/10 shrink-0">
          {t('combat.battleProgress', 'Battle Progress')}
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <span className="text-[11px] text-outline-variant/50 italic">
            {t('combat.logEmpty', 'Waiting for first action...')}
          </span>
        </div>
      </div>
    );
  }

  if (combatLog.length === 0 && legacyLog?.length > 0) {
    return (
      <div className={wrapperClass}>
        <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-3 py-2 border-b border-outline-variant/10 shrink-0">
          {t('combat.battleProgress', 'Battle Progress')}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
          {legacyLog.slice(-5).reverse().map((entry, i) => (
            <div key={`legacy_${i}`} className="text-[11px] text-outline-variant leading-snug px-2 py-1">
              {entry}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-3 py-2 border-b border-outline-variant/10 shrink-0">
        {t('combat.battleProgress', 'Battle Progress')}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
        {[...combatLog].reverse().map((entry) => (
          <CombatLogEntry
            key={entry.id}
            entry={entry}
            t={t}
            isNew={entry.id === newestId}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(CombatLog);
