import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import QuestLog from '../character/QuestLog';
import CodexPanel from '../character/CodexPanel';

export default function TasksInfoModal({ world, quests, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  const activeQuests = quests?.active || [];
  const completedQuests = quests?.completed || [];
  const npcs = world?.npcs || [];
  const codex = world?.codex || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.tasksInfo')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-7xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">assignment</span>
            {t('nav.tasksInfo')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 px-4 md:px-10 py-8 space-y-8">
          <QuestLog active={activeQuests} completed={completedQuests} npcs={npcs} />
          {Object.keys(codex).length > 0 && <CodexPanel codex={codex} />}
        </div>
      </div>
    </div>
  );
}
