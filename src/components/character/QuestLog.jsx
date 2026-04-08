import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';

const TYPE_STYLES = {
  main: 'bg-primary/15 text-primary border-primary/25',
  side: 'bg-tertiary/15 text-tertiary border-tertiary/25',
  personal: 'bg-secondary/15 text-secondary border-secondary/25',
};

const TYPE_ICONS = {
  main: 'local_fire_department',
  side: 'explore',
  personal: 'person',
};

function isReadyToTurnIn(quest) {
  return quest.objectives?.length > 0 && quest.objectives.every((o) => o.completed);
}

/** Show completed objectives + the first uncompleted one. Hide the rest. */
function getVisibleObjectives(objectives) {
  if (!objectives?.length) return { visible: [], hiddenCount: 0 };
  const visible = [];
  let foundFirstIncomplete = false;
  for (const obj of objectives) {
    if (obj.completed) {
      visible.push(obj);
    } else if (!foundFirstIncomplete) {
      visible.push(obj);
      foundFirstIncomplete = true;
    }
  }
  return { visible, hiddenCount: objectives.length - visible.length };
}

function RewardBadge({ reward, compact = false, t }) {
  if (!reward) return null;
  const parts = [];
  if (reward.xp) parts.push(`${reward.xp} ${t('quests.xpShort')}`);
  if (reward.money) {
    const m = reward.money;
    if (m.gold) parts.push(`${m.gold} GC`);
    if (m.silver) parts.push(`${m.silver} SS`);
    if (m.copper) parts.push(`${m.copper} CP`);
  }
  if (reward.items?.length > 0) {
    parts.push(...reward.items.map((i) => i.name || i));
  }
  const text = parts.length > 0 ? parts.join(', ') : reward.description;
  if (!text) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-label text-amber-400/80">
        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>paid</span>
        {text}
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-sm p-3">
      <span className="material-symbols-outlined text-sm text-amber-400 mt-0.5">paid</span>
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-amber-400/80">
          {t('quests.reward')}
        </p>
        <p className="text-xs text-on-surface mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

export default function QuestLog({ active = [], completed = [], npcs = [], onVerifyObjective = null }) {
  const { t } = useTranslation();
  const { verifyQuestObjective: verifyQuestObjectiveSolo } = useAI();
  const [selectedId, setSelectedId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const sortedActive = [...active].sort((a, b) => {
    const aReady = isReadyToTurnIn(a) ? 0 : 1;
    const bReady = isReadyToTurnIn(b) ? 0 : 1;
    return aReady - bReady;
  });

  const allQuests = [
    ...sortedActive.map((q) => ({ ...q, _status: 'active' })),
    ...completed.map((q) => ({ ...q, _status: 'completed' })),
  ];
  const selected = allQuests.find((q) => q.id === selectedId);

  const findNpc = (id) => {
    if (!id) return null;
    return npcs.find((n) => n.id === id || n.name?.toLowerCase() === id?.toLowerCase());
  };

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
          {sortedActive.map((quest) => {
            const isSelected = selectedId === quest.id;
            const { visible: visibleObjs } = getVisibleObjectives(quest.objectives);
            const completedCount = visibleObjs.filter((o) => o.completed).length;
            const totalCount = visibleObjs.length;
            const ready = isReadyToTurnIn(quest);
            const typeKey = quest.type || 'side';

            return (
              <button
                key={quest.id}
                type="button"
                onClick={() => setSelectedId(quest.id)}
                className={`w-full text-left px-3 py-2.5 rounded-sm transition-all ${
                  ready
                    ? isSelected
                      ? 'bg-amber-500/15 border border-amber-500/30'
                      : 'bg-amber-500/8 border border-amber-500/15 hover:bg-amber-500/12 hover:border-amber-500/25'
                    : isSelected
                      ? 'bg-primary/10 border border-primary/25'
                      : 'bg-surface-container-highest/50 border border-outline-variant/10 hover:bg-surface-container-highest hover:border-outline-variant/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-sm shrink-0 ${ready ? 'text-amber-400' : isSelected ? 'text-primary' : 'text-primary-dim'}`}>
                    {ready ? 'assignment_return' : 'task_alt'}
                  </span>
                  <span className={`text-sm font-headline truncate flex-1 ${ready ? 'text-amber-300' : isSelected ? 'text-tertiary' : 'text-on-surface'}`}>
                    {quest.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ready && (
                      <span className="text-[8px] font-label uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded-sm">
                        {t('quests.readyToTurnIn')}
                      </span>
                    )}
                    {!ready && totalCount > 0 && (
                      <span className="text-[10px] font-label text-on-surface-variant whitespace-nowrap">
                        {completedCount}/{totalCount}
                      </span>
                    )}
                    {typeKey !== 'side' && (
                      <span className={`material-symbols-outlined shrink-0 ${typeKey === 'main' ? 'text-primary/60' : 'text-secondary/60'}`} style={{ fontSize: '11px' }}>
                        {TYPE_ICONS[typeKey]}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Completed quests collapsible */}
          {completed.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center gap-2 py-2 mt-1"
              >
                <span
                  className="material-symbols-outlined text-xs text-outline transition-transform"
                  style={{ transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  chevron_right
                </span>
                <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                  {t('quests.completedQuests')}
                </span>
                <span className="text-[10px] text-outline">({completed.length})</span>
              </button>
              {showCompleted && completed.map((quest) => {
                const isSelected = selectedId === quest.id;
                return (
                  <button
                    key={quest.id}
                    type="button"
                    onClick={() => setSelectedId(quest.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-sm transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-surface-dim/30 border border-outline-variant/5 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-sm shrink-0 ${isSelected ? 'text-emerald-400' : 'text-outline'}`}>
                        check_circle
                      </span>
                      <span className={`text-sm font-headline truncate flex-1 ${isSelected ? 'text-emerald-300' : 'text-on-surface line-through'}`}>
                        {quest.name}
                      </span>
                      {quest.reward?.xp > 0 && (
                        <span className="text-[9px] font-label text-amber-400/60 whitespace-nowrap">
                          +{quest.reward.xp} {t('quests.xpShort')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
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
                  <span className={`material-symbols-outlined text-base ${
                    selected._status === 'completed' ? 'text-emerald-400'
                    : isReadyToTurnIn(selected) ? 'text-amber-400'
                    : 'text-primary'
                  }`}>
                    {selected._status === 'completed' ? 'check_circle' : isReadyToTurnIn(selected) ? 'assignment_return' : 'task_alt'}
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

              {/* Reward - prominent display */}
              <RewardBadge reward={selected.reward} t={t} />

              {/* Ready to turn in banner */}
              {selected._status === 'active' && isReadyToTurnIn(selected) && (
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

              {/* Quest giver & turn-in NPC */}
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
                                  const verifier = onVerifyObjective || verifyQuestObjectiveSolo;
                                  const res = await verifier(selected.id, obj.id);
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
          )}
        </div>
      </div>
    </div>
  );
}
