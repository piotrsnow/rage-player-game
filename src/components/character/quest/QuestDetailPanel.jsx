import { useState } from 'react';
import RewardBadge from './RewardBadge';
import { TYPE_STYLES, TYPE_ICONS, isReadyToTurnIn, getVisibleObjectives } from './helpers';

export default function QuestDetailPanel({ selected, findNpc, onVerifyObjective, t }) {
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-6">
        <span className="material-symbols-outlined text-3xl text-outline/15 mb-2">auto_stories</span>
        <p className="text-on-surface-variant/60 text-xs">{t('quests.selectQuest')}</p>
      </div>
    );
  }

  const ready = isReadyToTurnIn(selected);

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`material-symbols-outlined text-base ${
            selected._status === 'completed' ? 'text-emerald-400'
            : ready ? 'text-amber-400'
            : 'text-primary'
          }`}>
            {selected._status === 'completed' ? 'check_circle' : ready ? 'assignment_return' : 'task_alt'}
          </span>
          <h4 className={`font-headline text-on-surface flex-1 ${selected._status === 'completed' ? 'line-through opacity-60' : ''}`}>
            {selected.name}
          </h4>
          {selected.type && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border ${TYPE_STYLES[selected.type] || TYPE_STYLES.side}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{TYPE_ICONS[selected.type] || TYPE_ICONS.side}</span>
              {t(`gameplay.questType_${selected.type}`)}
            </span>
          )}
        </div>
        <p className="text-on-surface-variant text-xs leading-relaxed ml-6">{selected.description}</p>
      </div>

      <RewardBadge reward={selected.reward} t={t} />

      {selected._status === 'active' && ready && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-sm p-3">
          <span className="material-symbols-outlined text-sm text-amber-400">assignment_return</span>
          <div>
            <p className="text-[10px] font-label uppercase tracking-widest text-amber-400">
              {t('quests.readyToTurnIn')}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {t('quests.returnToNpc', {
                npc: findNpc(selected.turnInNpcId || selected.questGiverId)?.name || selected.turnInNpcId || selected.questGiverId || '???',
              })}
            </p>
          </div>
        </div>
      )}

      {(selected.questGiverId || selected.turnInNpcId) && (
        <div className="flex items-center gap-4 ml-1">
          {selected.questGiverId && (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-on-surface-variant">person</span>
              <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">{t('quests.questGiver')}:</span>
              <span className="text-xs text-on-surface">{findNpc(selected.questGiverId)?.name || selected.questGiverId}</span>
            </div>
          )}
          {selected.turnInNpcId && selected.turnInNpcId !== selected.questGiverId && (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-on-surface-variant">assignment_return</span>
              <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">{t('quests.turnInNpc')}:</span>
              <span className="text-xs text-on-surface">{findNpc(selected.turnInNpcId)?.name || selected.turnInNpcId}</span>
            </div>
          )}
        </div>
      )}

      {selected.completionCondition && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-sm p-3 ml-1">
          <span className={`material-symbols-outlined text-sm mt-0.5 ${selected._status === 'active' ? 'text-primary-dim' : 'text-outline'}`}>
            emoji_events
          </span>
          <div>
            <p className={`text-[10px] font-label uppercase tracking-widest ${selected._status === 'active' ? 'text-primary-dim' : 'text-outline'}`}>
              {t('quests.completionCondition')}
            </p>
            <p className="text-xs text-on-surface mt-0.5 leading-relaxed">{selected.completionCondition}</p>
          </div>
        </div>
      )}

      {selected.objectives?.length > 0 && (() => {
        const { visible: visibleObjs, hiddenCount } = selected._status === 'completed'
          ? { visible: selected.objectives, hiddenCount: 0 }
          : getVisibleObjectives(selected.objectives);
        return (
        <div className="space-y-1.5 ml-1">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
            {t('quests.objectives')}
          </p>
          {visibleObjs.map((obj) => {
            const isVerifying = verifyingId === obj.id;
            return (
              <div key={obj.id} className="group flex items-start gap-2 py-1 px-2 rounded-sm hover:bg-surface-container-highest/60 transition-colors">
                <span className={`material-symbols-outlined text-sm mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline/30'}`}>
                  {obj.completed ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${obj.completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                    {obj.description}
                  </p>
                  {!obj.completed && typeof obj.progress === 'string' && obj.progress.trim() && (
                    <p className="text-[10px] text-primary-dim/70 italic mt-0.5">{obj.progress}</p>
                  )}
                </div>
                {!obj.completed && selected._status === 'active' && (
                  isVerifying ? (
                    <span className="material-symbols-outlined text-sm text-primary animate-spin shrink-0 mt-0.5">progress_activity</span>
                  ) : (
                    <button
                      type="button"
                      title={t('quests.verifyObjective')}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setVerifyingId(obj.id);
                        setVerifyResult(null);
                        try {
                          const res = await onVerifyObjective(selected.id, obj.id);
                          setVerifyResult({ objectiveId: obj.id, fulfilled: res.fulfilled, reasoning: res.reasoning });
                        } catch {
                          setVerifyResult({ objectiveId: obj.id, fulfilled: false, reasoning: t('quests.verifyError') });
                        } finally {
                          setVerifyingId(null);
                        }
                      }}
                      className="material-symbols-outlined text-sm text-outline/40 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 cursor-pointer"
                    >
                      manage_search
                    </button>
                  )
                )}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-2 py-1 px-2 text-outline/40">
              <span className="material-symbols-outlined text-sm mt-0.5">lock</span>
              <p className="text-xs italic">{t('quests.hiddenObjectives', { count: hiddenCount })}</p>
            </div>
          )}
          {verifyResult && (
            <div className={`mt-2 px-3 py-2 rounded-sm text-xs leading-relaxed border ${
              verifyResult.fulfilled
                ? 'bg-primary/5 border-primary/15 text-primary'
                : 'bg-outline/5 border-outline-variant/15 text-on-surface-variant'
            }`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="material-symbols-outlined text-xs">
                  {verifyResult.fulfilled ? 'check_circle' : 'info'}
                </span>
                <span className="font-label text-[10px] uppercase tracking-widest">
                  {verifyResult.fulfilled ? t('quests.objectiveVerified') : t('quests.objectiveNotFulfilled')}
                </span>
              </div>
              {verifyResult.reasoning && <p className="ml-5">{verifyResult.reasoning}</p>}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
