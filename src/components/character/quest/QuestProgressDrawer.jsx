import { useEffect, useRef } from 'react';

export default function QuestProgressDrawer({ objective, onClose, t }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const entries = Array.isArray(objective?.progressLog) ? objective.progressLog : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm animate-fade-in">
      <div
        ref={panelRef}
        className="w-80 max-w-full h-full bg-surface-container border-l border-outline-variant/20 shadow-xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant/15">
          <span className="material-symbols-outlined text-base text-primary">history</span>
          <h3 className="font-headline text-sm text-on-surface flex-1 truncate">
            {t('quests.progressLog')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-base text-outline hover:text-on-surface transition-colors cursor-pointer"
          >
            close
          </button>
        </div>

        {/* Objective description */}
        <div className="px-4 py-2 border-b border-outline-variant/10">
          <p className="text-sm text-on-surface-variant leading-relaxed">{objective?.description}</p>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <span className="material-symbols-outlined text-2xl text-outline/20 mb-2">auto_stories</span>
              <p className="text-xs text-on-surface-variant/60 leading-relaxed max-w-[14rem]">
                {t('quests.progressLogEmpty')}
              </p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm bg-primary/10 text-primary border border-primary/20 mt-0.5">
                  {t('quests.sceneLabel', { index: entry.sceneIndex })}
                </span>
                <p className="text-sm text-on-surface leading-relaxed">{entry.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
