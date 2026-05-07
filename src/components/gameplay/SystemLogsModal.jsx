import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import { groupSystemLogsByScene } from '../../services/systemLogGrouping';
import { SystemMessage } from './chat/ChatMessages';

function shortenNarrative(narrative, max = 120) {
  if (typeof narrative !== 'string') return '';
  const trimmed = narrative.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export default function SystemLogsModal({ chatHistory = [], scenes = [], onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  const groups = useMemo(
    () => groupSystemLogsByScene({ chatHistory, scenes }),
    [chatHistory, scenes],
  );

  const totalEvents = groups.reduce((sum, g) => sum + g.messages.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('gameplay.systemLogsTitle')}
    >
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">receipt_long</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">
              {t('gameplay.systemLogsTitle')}
            </h2>
            <span className="text-[10px] text-on-surface-variant tabular-nums">
              ({totalEvents})
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto custom-scrollbar bg-surface-container-low/60">
          {totalEvents === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              {t('gameplay.systemLogsEmpty')}
            </p>
          )}
          {groups.map((group) => (
            <section key={group.sceneIndex} className="mb-5 last:mb-0">
              <div className="flex items-baseline gap-2 mb-2 pb-1 border-b border-outline-variant/15">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                  {group.sceneIndex < 0
                    ? t('gameplay.systemLogsBeforeFirstScene')
                    : t('gameplay.systemLogsScene', { n: group.sceneIndex + 1 })}
                </span>
                {group.scene?.scenePacing && (
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-wider">
                    · {group.scene.scenePacing}
                  </span>
                )}
                {group.scene?.narrative && (
                  <span className="text-[10px] text-on-surface-variant/80 italic truncate flex-1 min-w-0">
                    {shortenNarrative(group.scene.narrative)}
                  </span>
                )}
              </div>
              {group.messages.length === 0 ? (
                <p className="text-[10px] text-on-surface-variant/60 italic px-2 py-1">
                  {t('gameplay.systemLogsNoEventsInScene')}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {group.messages.map((msg) => (
                    <SystemMessage key={msg.id} message={msg} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
