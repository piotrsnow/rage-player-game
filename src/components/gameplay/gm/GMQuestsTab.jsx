import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function GMQuestsTab({ gameState }) {
  const { t } = useTranslation();
  const [showCompleted, setShowCompleted] = useState(false);

  const quests = gameState?.quests || { active: [], completed: [] };
  const active = quests.active || [];
  const completed = quests.completed || [];
  const npcs = gameState?.world?.npcs || [];

  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">assignment</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.emptyQuests')}</p>
      </div>
    );
  }

  const findNpc = (id) => {
    if (!id) return null;
    return npcs.find((n) => n.id === id || n.name?.toLowerCase() === id?.toLowerCase());
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
      {/* Active quests */}
      {active.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-primary">assignment</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              {t('gmModal.activeQuests')}
            </span>
            <span className="text-[10px] text-outline">({active.length})</span>
          </div>
          <div className="space-y-3">
            {active.map((quest) => (
              <QuestCard key={quest.id || quest.name} quest={quest} findNpc={findNpc} t={t} isActive />
            ))}
          </div>
        </div>
      )}

      {/* Completed quests */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 mb-3 group"
          >
            <span className="material-symbols-outlined text-sm text-outline transition-transform group-hover:text-on-surface-variant"
              style={{ transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              chevron_right
            </span>
            <span className="text-[10px] font-label uppercase tracking-widest text-outline group-hover:text-on-surface-variant transition-colors">
              {t('gmModal.completedQuests')}
            </span>
            <span className="text-[10px] text-outline">({completed.length})</span>
          </button>
          {showCompleted && (
            <div className="space-y-3">
              {completed.map((quest) => (
                <QuestCard key={quest.id || quest.name} quest={quest} findNpc={findNpc} t={t} isActive={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatReward(reward) {
  if (!reward) return null;
  if (typeof reward === 'string') return reward;
  const parts = [];
  if (reward.xp) parts.push(`${reward.xp} XP`);
  if (reward.money) {
    const m = reward.money;
    if (m.gold) parts.push(`${m.gold} ZK`);
    if (m.silver) parts.push(`${m.silver} SK`);
    if (m.copper) parts.push(`${m.copper} MK`);
  }
  if (reward.items?.length > 0) parts.push(reward.items.map((i) => i.name || i).join(', '));
  return parts.length > 0 ? parts.join(', ') : reward.description || null;
}

function QuestCard({ quest, findNpc, t, isActive }) {
  const giver = findNpc(quest.questGiverId);
  const turnInNpc = quest.turnInNpcId && quest.turnInNpcId !== quest.questGiverId ? findNpc(quest.turnInNpcId) : null;
  const completedObjectives = quest.objectives?.filter((o) => o.completed).length || 0;
  const totalObjectives = quest.objectives?.length || 0;
  const readyToTurnIn = isActive && totalObjectives > 0 && completedObjectives === totalObjectives;
  const rewardText = formatReward(quest.reward);

  return (
    <div className={`p-3 rounded-sm border ${
      readyToTurnIn ? 'bg-amber-500/8 border-amber-500/15'
      : isActive ? 'bg-surface-container/40 border-outline-variant/10'
      : 'bg-surface-container/20 border-outline-variant/5 opacity-70'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-sm ${readyToTurnIn ? 'text-amber-400' : isActive ? 'text-primary' : 'text-outline'}`}>
            {readyToTurnIn ? 'assignment_return' : isActive ? 'assignment' : 'assignment_turned_in'}
          </span>
          <span className="text-[11px] font-bold text-on-surface truncate">{quest.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {readyToTurnIn && (
            <span className="text-[8px] font-label uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded-sm">
              {t('quests.readyToTurnIn')}
            </span>
          )}
          {quest.type && (
            <span className={`text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
              quest.type === 'main' ? 'bg-primary/15 text-primary' :
              quest.type === 'personal' ? 'bg-tertiary/15 text-tertiary' :
              'bg-outline/10 text-outline'
            }`}>{quest.type}</span>
          )}
          {totalObjectives > 0 && (
            <span className="text-[9px] text-outline tabular-nums">
              {completedObjectives}/{totalObjectives}
            </span>
          )}
        </div>
      </div>

      {quest.description && (
        <p className="text-[10px] text-on-surface-variant mb-2">{quest.description}</p>
      )}

      {/* Objectives */}
      {quest.objectives?.length > 0 && (
        <div className="space-y-1 mb-2">
          {quest.objectives.map((obj) => (
            <div key={obj.id} className="flex items-start gap-2 text-[10px]">
              <span className={`material-symbols-outlined text-xs mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline'}`}>
                {obj.completed ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={`${obj.completed ? 'line-through text-outline' : 'text-on-surface-variant'}`}>
                {obj.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Reward */}
      {rewardText && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px]">
          <span className="material-symbols-outlined text-xs text-amber-400">paid</span>
          <span className="text-amber-400/70 font-label uppercase tracking-wider">{t('quests.reward')}:</span>
          <span className="text-on-surface-variant">{rewardText}</span>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap text-[9px] text-outline">
        {giver && (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]">person</span>
            {giver.name}
          </span>
        )}
        {turnInNpc && (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]">assignment_return</span>
            {turnInNpc.name}
          </span>
        )}
        {quest.locationId && (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]">place</span>
            {quest.locationId}
          </span>
        )}
      </div>
    </div>
  );
}
