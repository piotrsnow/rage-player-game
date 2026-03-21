import { useTranslation } from 'react-i18next';

export default function QuestLog({ active = [], completed = [] }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <h3 className="text-2xl font-headline text-tertiary px-2">{t('quests.activeChronicles')}</h3>

      {active.length === 0 && completed.length === 0 && (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-4xl text-outline/20 block mb-2">
            explore
          </span>
          <p className="text-on-surface-variant text-xs">{t('quests.noQuests')}</p>
        </div>
      )}

      <div className="space-y-3">
        {active.map((quest) => (
          <div
            key={quest.id}
            className="bg-surface-container-high border-l-4 border-primary p-5 flex items-start gap-4 hover:bg-surface-container-highest transition-colors cursor-pointer group"
          >
            <span className="material-symbols-outlined text-primary mt-1">task_alt</span>
            <div>
              <p className="text-on-surface font-headline group-hover:text-tertiary transition-colors">
                {quest.name}
              </p>
              <p className="text-on-surface-variant text-xs mt-1">{quest.description}</p>
            </div>
          </div>
        ))}

        {completed.map((quest) => (
          <div
            key={quest.id}
            className="bg-surface-container-low border-l-4 border-outline-variant p-5 flex items-start gap-4 opacity-60"
          >
            <span className="material-symbols-outlined text-outline mt-1">check_circle</span>
            <div>
              <p className="text-on-surface font-headline line-through">{quest.name}</p>
              <p className="text-on-surface-variant text-xs mt-1">{quest.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
