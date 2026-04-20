import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';
import QuestListItem, { CompletedQuestItem } from './quest/QuestListItem';
import QuestDetailPanel from './quest/QuestDetailPanel';

export default function QuestLog({ active = [], completed = [], npcs = [], onVerifyObjective = null }) {
  const { t } = useTranslation();
  const { verifyQuestObjective: verifyQuestObjectiveSolo } = useAI();
  const [selectedId, setSelectedId] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Newest first within each section. Legacy quests without createdAt/completedAt
  // sort to the bottom (fallback 0) so they stay predictable after migration.
  const sortedActive = [...active].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const sortedCompleted = [...completed].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const allQuests = [
    ...sortedActive.map((q) => ({ ...q, _status: 'active' })),
    ...sortedCompleted.map((q) => ({ ...q, _status: 'completed' })),
  ];
  // Fallback when the user hasn't clicked anything yet (or the previously
  // selected quest vanished from the list) — show the first active quest so
  // the detail panel is never blank on open.
  const selected = allQuests.find((q) => q.id === selectedId)
    || sortedActive[0]
    || sortedCompleted[0]
    || null;

  const findNpc = (id) => {
    if (!id) return null;
    return npcs.find((n) => n.id === id || n.name?.toLowerCase() === id?.toLowerCase());
  };

  const verifier = onVerifyObjective || verifyQuestObjectiveSolo;

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
        <div className="w-2/5 min-w-0 space-y-1 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin">
          {sortedActive.map((quest) => (
            <QuestListItem
              key={quest.id}
              quest={quest}
              isSelected={selectedId === quest.id}
              onSelect={setSelectedId}
              t={t}
            />
          ))}

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
              {showCompleted && sortedCompleted.map((quest) => (
                <CompletedQuestItem
                  key={quest.id}
                  quest={quest}
                  isSelected={selectedId === quest.id}
                  onSelect={setSelectedId}
                  t={t}
                />
              ))}
            </>
          )}
        </div>

        <div className="w-3/5 min-w-0 bg-surface-container-highest/40 border border-outline-variant/10 rounded-sm p-5 overflow-y-auto max-h-[380px] scrollbar-thin">
          <QuestDetailPanel
            selected={selected}
            findNpc={findNpc}
            onVerifyObjective={verifier}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
