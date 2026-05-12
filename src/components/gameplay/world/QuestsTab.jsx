import { useState } from 'react';
import { CrossLinkChip, EmptyState, findNpcByRef } from './shared';
import { getVisibleObjectives } from '../../character/quest/helpers';

const TYPE_COLORS = {
  main: 'bg-tertiary/15 text-tertiary',
  side: 'bg-primary/15 text-primary',
  personal: 'bg-secondary/15 text-secondary',
};

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

export default function QuestsTab({ quests, npcs, navigateTo, t }) {
  // Sort: main first → potem po id (stabilnie). createdAt nie jest
  // surface'owane przez campaignLoader dla questów z DB, więc dla aktywnych
  // używamy id; completed mają completedAt z applyStateChangesHandler.
  const typeRank = (q) => (q.type === 'main' ? 0 : 1);
  const active = [...(quests?.active || [])].sort((a, b) => {
    const t1 = typeRank(a) - typeRank(b);
    if (t1 !== 0) return t1;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  const completed = [...(quests?.completed || [])].sort((a, b) => {
    const t1 = typeRank(a) - typeRank(b);
    if (t1 !== 0) return t1;
    return (b.completedAt || 0) - (a.completedAt || 0);
  });
  const [showCompleted, setShowCompleted] = useState(false);

  if (active.length === 0 && completed.length === 0) {
    return <EmptyState icon="assignment" text={t('worldState.emptyQuests')} />;
  }

  const renderQuest = (quest, isCompleted) => (
    <div
      key={quest.id}
      data-entity-id={quest.id}
      className={`p-3 rounded-sm border transition-all ${isCompleted ? 'bg-surface-container/20 border-outline-variant/10 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-primary">{isCompleted ? 'task_alt' : 'assignment'}</span>
          <span className="text-base font-bold text-on-surface">{quest.name}</span>
        </div>
        {quest.type && (
          <span className={`text-xs font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${TYPE_COLORS[quest.type] || TYPE_COLORS.side}`}>
            {t(`worldState.${quest.type}`)}
          </span>
        )}
      </div>

      {quest.description && (
        <p className="text-sm text-on-surface-variant mb-2">{quest.description}</p>
      )}

      {quest.objectives?.length > 0 && (() => {
        const { done, pending, locked, failed, hiddenCount } = isCompleted
          ? { done: quest.objectives, pending: [], locked: [], failed: [], hiddenCount: 0 }
          : getVisibleObjectives(quest.objectives);
        return (
        <div className="mb-2">
          <div className="text-xs text-outline uppercase tracking-wider mb-1">{t('worldState.objectives')}</div>
          {done.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-1.5 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-sm mt-0.5 text-primary">check_circle</span>
              <span className="line-through text-outline">
                {obj.objectiveType && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded mr-1.5 align-middle no-underline ${OBJECTIVE_TYPE_COLORS[obj.objectiveType] || 'bg-outline/20 text-outline'}`}>
                    {t(`quests.objectiveTypes.${obj.objectiveType}`)}
                  </span>
                )}
                {obj.description}
              </span>
            </div>
          ))}
          {pending.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-1.5 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-sm mt-0.5 text-outline">radio_button_unchecked</span>
              <span>
                {obj.objectiveType && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded mr-1.5 align-middle ${OBJECTIVE_TYPE_COLORS[obj.objectiveType] || 'bg-outline/20 text-outline'}`}>
                    {t(`quests.objectiveTypes.${obj.objectiveType}`)}
                  </span>
                )}
                {obj.description}
              </span>
            </div>
          ))}
          {locked.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-1.5 text-sm text-outline/40 italic">
              <span className="material-symbols-outlined text-sm mt-0.5">lock</span>
              <span>
                {obj.objectiveType && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded mr-1.5 align-middle ${OBJECTIVE_TYPE_COLORS[obj.objectiveType] || 'bg-outline/20 text-outline'}`}>
                    {t(`quests.objectiveTypes.${obj.objectiveType}`)}
                  </span>
                )}
                {obj.description}
              </span>
            </div>
          ))}
          {failed.map((obj) => (
            <div key={obj.id || obj.nodeKey} className="flex items-start gap-1.5 text-sm text-rose-300/80">
              <span className="material-symbols-outlined text-sm mt-0.5 text-rose-400">cancel</span>
              <span className="line-through">
                {obj.objectiveType && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded mr-1.5 align-middle no-underline ${OBJECTIVE_TYPE_COLORS[obj.objectiveType] || 'bg-outline/20 text-outline'}`}>
                    {t(`quests.objectiveTypes.${obj.objectiveType}`)}
                  </span>
                )}
                {obj.description}
              </span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-outline/40 italic mt-0.5">
              <span className="material-symbols-outlined text-sm">lock</span>
              {t('quests.hiddenObjectives', { count: hiddenCount })}
            </div>
          )}
          {pending.length === 0 && hiddenCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-300/70 mt-1">
              <span className="material-symbols-outlined text-sm">tips_and_updates</span>
              <span>{quest.questGiverId
                ? t('quests.stuckHint', { npc: quest.questGiverId })
                : t('quests.stuckHintGeneric')
              }</span>
            </div>
          )}
        </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {quest.questGiverId && (
          <CrossLinkChip
            icon="person"
            label={`${t('worldState.questGiver')}: ${quest.questGiverId}`}
            onClick={() => {
              const npc = findNpcByRef(quest.questGiverId, npcs);
              navigateTo('npcs', npc?.id || quest.questGiverId);
            }}
          />
        )}
        {quest.turnInNpcId && quest.turnInNpcId !== quest.questGiverId && (
          <CrossLinkChip
            icon="person_pin"
            label={`${t('worldState.turnIn')}: ${quest.turnInNpcId}`}
            onClick={() => {
              const npc = findNpcByRef(quest.turnInNpcId, npcs);
              navigateTo('npcs', npc?.id || quest.turnInNpcId);
            }}
          />
        )}
        {quest.locationId && (
          <CrossLinkChip
            icon="location_on"
            label={quest.locationId}
            onClick={() => navigateTo('map', quest.locationId)}
          />
        )}
      </div>

      {quest.reward && (
        <div className="text-xs text-outline mt-2 pt-1.5 border-t border-outline-variant/10">
          <span className="text-outline">{t('worldState.reward')}:</span>{' '}
          {quest.reward.xp > 0 && <span>{quest.reward.xp} XP</span>}
          {quest.reward.money && (quest.reward.money.gold > 0 || quest.reward.money.silver > 0 || quest.reward.money.copper > 0) && (
            <span>
              {quest.reward.xp > 0 && ', '}
              {quest.reward.money.gold > 0 && `${quest.reward.money.gold} ZK `}
              {quest.reward.money.silver > 0 && `${quest.reward.money.silver} SK `}
              {quest.reward.money.copper > 0 && `${quest.reward.money.copper} MK`}
            </span>
          )}
          {quest.reward.description && <span> — {quest.reward.description}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <>
          <div className="text-xs font-label uppercase tracking-widest text-on-surface-variant px-1">
            {t('worldState.activeQuests')} ({active.length})
          </div>
          {active.map((q) => renderQuest(q, false))}
        </>
      )}

      {completed.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-label uppercase tracking-widest text-outline hover:text-on-surface-variant transition-colors px-1"
          >
            <span className="material-symbols-outlined text-sm">{showCompleted ? 'expand_less' : 'expand_more'}</span>
            {t('worldState.completedQuests')} ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-3 mt-2">
              {completed.map((q) => renderQuest(q, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
