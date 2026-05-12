import { useState } from 'react';
import RewardBadge from './RewardBadge';
import QuestProgressDrawer from './QuestProgressDrawer';
import { TYPE_STYLES, TYPE_ICONS, isReadyToTurnIn, getVisibleObjectives, objStatus, resolveObjectiveType } from './helpers';

const OBJECTIVE_TYPE_COLORS = {
  kill: 'bg-red-500/20 text-red-300',
  escort: 'bg-sky-500/20 text-sky-300',
  fetch: 'bg-amber-500/20 text-amber-300',
  deliver: 'bg-teal-500/20 text-teal-300',
  craft: 'bg-orange-500/20 text-orange-300',
  explore: 'bg-emerald-500/20 text-emerald-300',
  interact: 'bg-violet-500/20 text-violet-300',
  survive: 'bg-rose-500/20 text-rose-300',
  gather: 'bg-lime-500/20 text-lime-300',
};

// Ikona statusu dla pojedynczego objective.
function StatusIcon({ status, isNext }) {
  switch (status) {
    case 'done':
      return <span className="material-symbols-outlined text-sm mt-0.5 text-primary">check_box</span>;
    case 'failed':
      return <span className="material-symbols-outlined text-sm mt-0.5 text-rose-400">cancel</span>;
    case 'locked':
      return <span className="material-symbols-outlined text-sm mt-0.5 text-outline/40">lock</span>;
    case 'pending':
    default:
      return (
        <span className={`material-symbols-outlined text-sm mt-0.5 ${isNext ? 'text-amber-300' : 'text-outline/30'}`}>
          {isNext ? 'play_arrow' : 'check_box_outline_blank'}
        </span>
      );
  }
}

function ProgressLogButton({ obj, onClick, t }) {
  const entries = Array.isArray(obj?.progressLog) ? obj.progressLog : [];
  if (entries.length === 0) return null;
  return (
    <button
      type="button"
      title={t('quests.progressLog')}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="relative material-symbols-outlined text-sm text-outline/50 hover:text-primary transition-colors shrink-0 mt-0.5 cursor-pointer"
    >
      history
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-3.5 h-3.5 text-[8px] font-bold rounded-full bg-primary text-on-primary">
        {entries.length}
      </span>
    </button>
  );
}

function ObjectiveTypeBadge({ obj, t, className = '' }) {
  const objectiveType = resolveObjectiveType(obj);
  if (!objectiveType) return null;
  const fallbackMark = obj?.objectiveType ? '' : ' ^';
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded mr-1 align-middle ${className} ${OBJECTIVE_TYPE_COLORS[objectiveType] || ''}`}>
      {t(`quests.objectiveTypes.${objectiveType}`)}{fallbackMark}
    </span>
  );
}

export default function QuestDetailPanel({ selected, findNpc, onVerifyObjective, t }) {
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [logObjective, setLogObjective] = useState(null);

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-6">
        <span className="material-symbols-outlined text-3xl text-outline/15 mb-2">auto_stories</span>
        <p className="text-on-surface-variant/60 text-xs">{t('quests.selectQuest')}</p>
      </div>
    );
  }

  const ready = isReadyToTurnIn(selected);
  // Surface raw quest status (active|stalled|failed|completed). _status is
  // the FE-side derived "current quest is selected" flag injected by parent;
  // selected.status (oś 4) is the BE row status. Fall back to active.
  const questStatus = selected.status || (selected._status === 'completed' ? 'completed' : 'active');
  const isStalled = questStatus === 'stalled';
  const isFailedQuest = questStatus === 'failed';

  const headerIcon = questStatus === 'completed' ? 'check_circle'
    : isFailedQuest ? 'cancel'
    : isStalled ? 'pause_circle'
    : ready ? 'assignment_return'
    : 'task_alt';
  const headerClass = questStatus === 'completed' ? 'text-emerald-400'
    : isFailedQuest ? 'text-rose-400'
    : isStalled ? 'text-amber-400'
    : ready ? 'text-amber-400'
    : 'text-primary';

  const lastMutation = Array.isArray(selected.mutationLog) && selected.mutationLog.length > 0
    ? selected.mutationLog[selected.mutationLog.length - 1]
    : null;

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`material-symbols-outlined text-lg ${headerClass}`}>{headerIcon}</span>
          <h4 className={`font-headline text-base text-on-surface flex-1 ${questStatus === 'completed' ? 'line-through opacity-60' : ''}`}>
            {selected.name}
          </h4>
          {isStalled && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border bg-amber-500/15 text-amber-300 border-amber-500/30">
              {t('quests.statusStalled', { defaultValue: 'wstrzymane' })}
            </span>
          )}
          {isFailedQuest && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border bg-rose-500/15 text-rose-300 border-rose-500/30">
              {t('quests.statusFailed', { defaultValue: 'porażka' })}
            </span>
          )}
          {selected.type && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border ${TYPE_STYLES[selected.type] || TYPE_STYLES.side}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{TYPE_ICONS[selected.type] || TYPE_ICONS.side}</span>
              {t(`gameplay.questType_${selected.type}`)}
            </span>
          )}
        </div>
        <p className="text-on-surface-variant text-sm leading-relaxed ml-7">{selected.description}</p>
      </div>

      {(isStalled || isFailedQuest) && lastMutation && (
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-sm p-3 ml-1">
          <span className={`material-symbols-outlined text-sm mt-0.5 ${isFailedQuest ? 'text-rose-400' : 'text-amber-400'}`}>
            {isFailedQuest ? 'block' : 'warning'}
          </span>
          <div>
            <p className={`text-[10px] font-label uppercase tracking-widest ${isFailedQuest ? 'text-rose-400' : 'text-amber-400'}`}>
              {isFailedQuest ? t('quests.mutationFailReason', { defaultValue: 'Powód porażki' }) : t('quests.mutationStallReason', { defaultValue: 'Powód zatrzymania' })}
            </p>
            <p className="text-sm text-on-surface mt-0.5 leading-relaxed">{lastMutation.reason}</p>
          </div>
        </div>
      )}

      <RewardBadge reward={selected.reward} t={t} />

      {questStatus === 'active' && ready && (
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
              <span className="text-sm text-on-surface">{findNpc(selected.questGiverId)?.name || selected.questGiverId}</span>
            </div>
          )}
          {selected.turnInNpcId && selected.turnInNpcId !== selected.questGiverId && (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-on-surface-variant">assignment_return</span>
              <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">{t('quests.turnInNpc')}:</span>
              <span className="text-sm text-on-surface">{findNpc(selected.turnInNpcId)?.name || selected.turnInNpcId}</span>
            </div>
          )}
        </div>
      )}

      {selected.completionCondition && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-sm p-3 ml-1">
          <span className={`material-symbols-outlined text-sm mt-0.5 ${questStatus === 'active' ? 'text-primary-dim' : 'text-outline'}`}>
            emoji_events
          </span>
          <div>
            <p className={`text-[10px] font-label uppercase tracking-widest ${questStatus === 'active' ? 'text-primary-dim' : 'text-outline'}`}>
              {t('quests.completionCondition')}
            </p>
            <p className="text-sm text-on-surface mt-0.5 leading-relaxed">{selected.completionCondition}</p>
          </div>
        </div>
      )}

      {selected.objectives?.length > 0 && (() => {
        const sections = questStatus === 'completed'
          ? { done: selected.objectives, pending: [], locked: [], failed: [], hiddenCount: 0, branchGroups: [] }
          : getVisibleObjectives(selected.objectives);
        const { done, pending, locked, failed, hiddenCount, branchGroups } = sections;
        const rewardXp = selected.reward?.xp || 0;
        const objCount = selected.objectives.length;
        const xpPerObj = rewardXp > 0 && objCount > 0 ? Math.floor(rewardXp / (2 * objCount)) : 0;
        return (
        <div className="space-y-1.5 ml-1">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
            {t('quests.objectives')}
          </p>
          {branchGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 ml-1">
              {branchGroups.map((bg) => (
                <span key={bg.group} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border bg-primary/10 text-primary border-primary/25">
                  <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>alt_route</span>
                  {t('quests.branchGroup', { defaultValue: 'wybór' })}: {bg.options.map((o) => o.label).join(' | ')}
                </span>
              ))}
            </div>
          )}
          {/* DONE — first */}
          {done.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="group flex items-start gap-2 py-1 px-2 rounded-sm hover:bg-surface-container-highest/60 transition-colors">
              <StatusIcon status="done" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-on-surface-variant line-through">
                  <ObjectiveTypeBadge obj={obj} t={t} className="no-underline" />
                  {obj.description}
                </p>
              </div>
              {xpPerObj > 0 && (
                <span className={`shrink-0 text-[9px] font-label px-1 py-px rounded-sm ${obj.xpAwarded ? 'bg-primary/15 text-primary' : 'bg-surface-container/60 text-on-surface-variant/50'}`}>
                  {obj.xpAwarded || xpPerObj} xp
                </span>
              )}
              <ProgressLogButton obj={obj} onClick={() => setLogObjective(obj)} t={t} />
            </div>
          ))}
          {/* PENDING DISCOVERED — first one is ▶ NEXT */}
          {pending.map((obj, idx) => {
            const isVerifying = verifyingId === obj.id;
            const isNext = idx === 0;
            return (
              <div key={obj.id || obj.nodeKey} className="group flex items-start gap-2 py-1 px-2 rounded-sm hover:bg-surface-container-highest/60 transition-colors">
                <StatusIcon status="pending" isNext={isNext} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed text-on-surface">
                    <ObjectiveTypeBadge obj={obj} t={t} />
                    {obj.description}
                    {obj.choiceLabel && (
                      <span className="ml-2 text-[10px] font-label uppercase tracking-widest text-primary/70">
                        ({obj.choiceLabel})
                      </span>
                    )}
                  </p>
                  {typeof obj.progress === 'string' && obj.progress.trim() && (
                    <p className="text-[10px] text-primary-dim/70 italic mt-0.5">{obj.progress}</p>
                  )}
                </div>
                {xpPerObj > 0 && (
                  <span className="shrink-0 text-[9px] font-label px-1 py-px rounded-sm bg-surface-container/60 text-on-surface-variant/50">
                    {xpPerObj} xp
                  </span>
                )}
                <ProgressLogButton obj={obj} onClick={() => setLogObjective(obj)} t={t} />
                {questStatus === 'active' && (
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
          {/* LOCKED + DISCOVERED — visible-locked: gracz wie że istnieje, ale parents niespełnione */}
          {locked.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-2 py-1 px-2 rounded-sm opacity-60">
              <StatusIcon status="locked" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-on-surface-variant italic">
                  <ObjectiveTypeBadge obj={obj} t={t} />
                  {obj.description}
                </p>
                {Array.isArray(obj.parents) && obj.parents.length > 0 && (
                  <p className="text-[10px] text-outline/60 mt-0.5">
                    {t('quests.requiresPrior', { defaultValue: 'Wymaga wcześniejszego kroku' })}
                  </p>
                )}
              </div>
            </div>
          ))}
          {/* FAILED — terminal, ale widoczne (gracz musi wiedzieć że odpadło) */}
          {failed.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-2 py-1 px-2 rounded-sm">
              <StatusIcon status="failed" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-rose-300/80 line-through">
                  <ObjectiveTypeBadge obj={obj} t={t} className="no-underline" />
                  {obj.description}
                </p>
              </div>
            </div>
          ))}
          {/* HIDDEN COUNT — undiscovered reachable, "??? Nieznany krok" */}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-2 py-1 px-2 text-outline/40 italic">
              <span className="material-symbols-outlined text-sm mt-0.5">help</span>
              <p className="text-xs">
                {t('quests.unknownObjectives', {
                  count: hiddenCount,
                  defaultValue: hiddenCount === 1 ? '1 nieznany krok przed Tobą' : `${hiddenCount} nieznanych kroków przed Tobą`,
                })}
              </p>
            </div>
          )}
          {/* STUCK hint — no pending objectives visible, but hidden steps remain */}
          {pending.length === 0 && hiddenCount > 0 && questStatus === 'active' && (
            <div className="flex items-center gap-2 py-1.5 px-2 mt-1 bg-amber-500/5 border border-amber-500/15 rounded-sm">
              <span className="material-symbols-outlined text-sm text-amber-400">tips_and_updates</span>
              <p className="text-xs text-amber-300/80">
                {selected.questGiverId
                  ? t('quests.stuckHint', { npc: findNpc(selected.questGiverId)?.name || selected.questGiverId })
                  : t('quests.stuckHintGeneric')
                }
              </p>
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

      {/* Aggregated quest timeline — progress log entries from all objectives + mutation events */}
      {(() => {
        const timeline = [];
        for (const obj of selected.objectives || []) {
          for (const entry of Array.isArray(obj.progressLog) ? obj.progressLog : []) {
            timeline.push({ kind: 'progress', sceneIndex: entry.sceneIndex ?? 0, text: entry.text, objective: obj.description });
          }
        }
        for (const mut of Array.isArray(selected.mutationLog) ? selected.mutationLog : []) {
          timeline.push({ kind: 'mutation', sceneIndex: mut.sceneIndex ?? 0, text: mut.reason, mutation: mut.mutation });
        }
        timeline.sort((a, b) => a.sceneIndex - b.sceneIndex);
        if (timeline.length === 0) return null;
        return (
          <div className="mt-2 ml-1">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>history</span>
              {t('quests.questTimeline')}
            </p>
            <div className="space-y-2 border-l border-outline-variant/15 pl-3 ml-1">
              {timeline.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm bg-primary/10 text-primary border border-primary/20 mt-0.5">
                    {t('quests.sceneLabel', { index: entry.sceneIndex })}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface leading-relaxed">{entry.text}</p>
                    {entry.kind === 'progress' && entry.objective && (
                      <p className="text-[10px] text-outline/60 mt-0.5 truncate">{entry.objective}</p>
                    )}
                    {entry.kind === 'mutation' && (
                      <p className="text-[10px] text-amber-400/70 mt-0.5">{entry.mutation}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {logObjective && (
        <QuestProgressDrawer
          objective={logObjective}
          onClose={() => setLogObjective(null)}
          t={t}
        />
      )}
    </div>
  );
}
