import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';

export default function QuestLog({ active = [], completed = [] }) {
  const { t } = useTranslation();
  const { verifyQuestObjective } = useAI();
  const [selectedId, setSelectedId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  const allQuests = [
    ...active.map((q) => ({ ...q, _status: 'active' })),
    ...completed.map((q) => ({ ...q, _status: 'completed' })),
  ];
  const selected = allQuests.find((q) => q.id === selectedId);

  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10">
        <h3 className="text-tertiary font-headline flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-sm">menu_book</span>
          {t('quests.activeChronicles')}
        </h3>
        <div className="text-center py-6">
          <span className="material-symbols-outlined text-3xl text-outline/20 block mb-2">explore</span>
          <p className="text-on-surface-variant text-xs">{t('quests.noQuests')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-tertiary font-headline flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">menu_book</span>
          {t('quests.activeChronicles')}
        </h3>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {active.length} / {active.length + completed.length}
        </span>
      </div>

      <div className="flex gap-5 min-h-[200px]">
        {/* Quest list */}
        <div className="w-2/5 min-w-0 space-y-1 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin">
          {active.map((quest) => {
            const isSelected = selectedId === quest.id;
            const completedCount = quest.objectives?.filter((o) => o.completed).length || 0;
            const totalCount = quest.objectives?.length || 0;

            return (
              <button
                key={quest.id}
                type="button"
                onClick={() => setSelectedId(quest.id)}
                className={`w-full text-left px-3 py-2.5 rounded-sm transition-all ${
                  isSelected
                    ? 'bg-primary/10 border border-primary/25'
                    : 'bg-surface-container-highest/50 border border-outline-variant/10 hover:bg-surface-container-highest hover:border-outline-variant/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-sm shrink-0 ${isSelected ? 'text-primary' : 'text-primary-dim'}`}>
                    task_alt
                  </span>
                  <span className={`text-sm font-headline truncate flex-1 ${isSelected ? 'text-tertiary' : 'text-on-surface'}`}>
                    {quest.name}
                  </span>
                  {totalCount > 0 && (
                    <span className="text-[10px] font-label text-on-surface-variant whitespace-nowrap">
                      {completedCount}/{totalCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {completed.length > 0 && active.length > 0 && (
            <div className="border-t border-outline-variant/10 my-1.5" />
          )}

          {completed.map((quest) => {
            const isSelected = selectedId === quest.id;

            return (
              <button
                key={quest.id}
                type="button"
                onClick={() => setSelectedId(quest.id)}
                className={`w-full text-left px-3 py-2.5 rounded-sm transition-all opacity-50 hover:opacity-70 ${
                  isSelected
                    ? 'bg-outline/5 border border-outline-variant/20 !opacity-70'
                    : 'bg-surface-dim/30 border border-outline-variant/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-outline shrink-0">check_circle</span>
                  <span className="text-sm font-headline text-on-surface truncate flex-1 line-through">{quest.name}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quest details */}
        <div className="w-3/5 min-w-0 bg-surface-container-highest/40 border border-outline-variant/10 rounded-sm p-5 overflow-y-auto max-h-[380px] scrollbar-thin">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-6">
              <span className="material-symbols-outlined text-3xl text-outline/15 mb-2">auto_stories</span>
              <p className="text-on-surface-variant/60 text-xs">{t('quests.selectQuest')}</p>
            </div>
          ) : (
            <div className="animate-fade-in space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`material-symbols-outlined text-base ${selected._status === 'active' ? 'text-primary' : 'text-outline'}`}>
                    {selected._status === 'active' ? 'task_alt' : 'check_circle'}
                  </span>
                  <h4 className={`font-headline text-on-surface ${selected._status === 'completed' ? 'line-through opacity-50' : ''}`}>
                    {selected.name}
                  </h4>
                </div>
                <p className="text-on-surface-variant text-xs leading-relaxed ml-6">{selected.description}</p>
              </div>

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

              {selected.objectives?.length > 0 && (
                <div className="space-y-1.5 ml-1">
                  <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
                    {t('quests.objectives')}
                  </p>
                  {selected.objectives.map((obj) => {
                    const isVerifying = verifyingId === obj.id;
                    const result = verifyResult?.objectiveId === obj.id ? verifyResult : null;
                    return (
                      <div key={obj.id} className="group flex items-start gap-2 py-1 px-2 rounded-sm hover:bg-surface-container-highest/60 transition-colors">
                        <span className={`material-symbols-outlined text-sm mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline/30'}`}>
                          {obj.completed ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <p className={`text-xs leading-relaxed flex-1 ${obj.completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                          {obj.description}
                        </p>
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
                                  const res = await verifyQuestObjective(selected.id, obj.id);
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
