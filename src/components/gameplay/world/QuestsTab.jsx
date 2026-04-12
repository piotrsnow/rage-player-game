import { useState } from 'react';
import { CrossLinkChip, EmptyState, findNpcByRef } from './shared';

const TYPE_COLORS = {
  main: 'bg-tertiary/15 text-tertiary',
  side: 'bg-primary/15 text-primary',
  personal: 'bg-secondary/15 text-secondary',
};

export default function QuestsTab({ quests, npcs, navigateTo, t }) {
  const active = quests?.active || [];
  const completed = quests?.completed || [];
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
          <span className="material-symbols-outlined text-sm text-primary">{isCompleted ? 'task_alt' : 'assignment'}</span>
          <span className="text-sm font-bold text-on-surface">{quest.name}</span>
        </div>
        {quest.type && (
          <span className={`text-[10px] font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${TYPE_COLORS[quest.type] || TYPE_COLORS.side}`}>
            {t(`worldState.${quest.type}`)}
          </span>
        )}
      </div>

      {quest.description && (
        <p className="text-[11px] text-on-surface-variant mb-2">{quest.description}</p>
      )}

      {quest.objectives?.length > 0 && (() => {
        const visible = [];
        let foundFirst = false;
        for (const obj of quest.objectives) {
          if (obj.completed) visible.push(obj);
          else if (!foundFirst) { visible.push(obj); foundFirst = true; }
        }
        const hiddenCount = quest.objectives.length - visible.length;
        return (
        <div className="mb-2">
          <div className="text-[10px] text-outline uppercase tracking-wider mb-1">{t('worldState.objectives')}</div>
          {visible.map((obj) => (
            <div key={obj.id} className="flex items-start gap-1.5 text-[11px] text-on-surface-variant">
              <span className={`material-symbols-outlined text-[12px] mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline'}`}>
                {obj.completed ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={obj.completed ? 'line-through text-outline' : ''}>{obj.description}</span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-outline/40 italic mt-0.5">
              <span className="material-symbols-outlined text-[12px]">lock</span>
              {t('quests.hiddenObjectives', { count: hiddenCount })}
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
        <div className="text-[10px] text-outline mt-2 pt-1.5 border-t border-outline-variant/10">
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
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">
            {t('worldState.activeQuests')} ({active.length})
          </div>
          {active.map((q) => renderQuest(q, false))}
        </>
      )}

      {completed.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-label uppercase tracking-widest text-outline hover:text-on-surface-variant transition-colors px-1"
          >
            <span className="material-symbols-outlined text-xs">{showCompleted ? 'expand_less' : 'expand_more'}</span>
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
