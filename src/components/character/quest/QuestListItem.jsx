import { TYPE_ICONS, isReadyToTurnIn, getVisibleObjectives } from './helpers';

export default function QuestListItem({ quest, isSelected, onSelect, t }) {
  // Graph-aware shape: { done, pending, locked, failed, hiddenCount, branchGroups }
  const sections = getVisibleObjectives(quest.objectives);
  const completedCount = sections.done.length;
  const totalVisible = sections.done.length + sections.pending.length + sections.locked.length + sections.failed.length;
  // Total count includes "???" placeholders so player vidocznie wie ile
  // jeszcze przed nim — mechanika graf-a jest schowana, ale liczba kroków
  // pozostaje pomocna dla pacing-u.
  const totalCount = totalVisible + sections.hiddenCount;
  const ready = isReadyToTurnIn(quest);
  const isStalled = quest.status === 'stalled';
  const isFailedQuest = quest.status === 'failed';
  const typeKey = quest.type || 'side';

  return (
    <button
      type="button"
      onClick={() => onSelect(quest.id)}
      className={`w-full text-left px-5 py-5 rounded-sm transition-all ${
        ready
          ? isSelected
            ? 'bg-amber-500/15 border border-amber-500/30'
            : 'bg-amber-500/8 border border-amber-500/15 hover:bg-amber-500/12 hover:border-amber-500/25'
          : isSelected
            ? 'bg-primary/10 border border-primary/25'
            : 'bg-surface-container-highest/50 border border-outline-variant/10 hover:bg-surface-container-highest hover:border-outline-variant/20'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined text-lg shrink-0 ${
          isFailedQuest ? 'text-rose-400'
          : isStalled ? 'text-amber-400'
          : ready ? 'text-amber-400'
          : isSelected ? 'text-primary'
          : 'text-primary-dim'
        }`}>
          {isFailedQuest ? 'cancel' : isStalled ? 'pause_circle' : ready ? 'assignment_return' : 'task_alt'}
        </span>
        <span className={`text-lg font-headline truncate flex-1 ${
          isFailedQuest ? 'text-rose-300/80 line-through'
          : isStalled ? 'text-amber-300'
          : ready ? 'text-amber-300'
          : isSelected ? 'text-tertiary'
          : 'text-on-surface'
        }`}>
          {quest.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isStalled && (
            <span className="text-[8px] font-label uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded-sm">
              {t('quests.statusStalled', { defaultValue: 'pauza' })}
            </span>
          )}
          {ready && !isStalled && !isFailedQuest && (
            <span className="text-[8px] font-label uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded-sm">
              {t('quests.readyToTurnIn')}
            </span>
          )}
          {!ready && totalCount > 0 && !isFailedQuest && (
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
}

export function CompletedQuestItem({ quest, isSelected, onSelect, t }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(quest.id)}
      className={`w-full text-left px-5 py-5 rounded-sm transition-all ${
        isSelected
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'bg-surface-dim/30 border border-outline-variant/5 opacity-60 hover:opacity-80'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined text-lg shrink-0 ${isSelected ? 'text-emerald-400' : 'text-outline'}`}>
          check_circle
        </span>
        <span className={`text-lg font-headline truncate flex-1 ${isSelected ? 'text-emerald-300' : 'text-on-surface line-through'}`}>
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
}
