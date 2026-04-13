import { EmptyState } from './shared';

export default function JournalTab({ eventHistory, compressedHistory, t }) {
  if (eventHistory.length === 0 && !compressedHistory) {
    return <EmptyState icon="menu_book" text={t('worldState.emptyJournal')} />;
  }
  return (
    <div className="space-y-4">
      {compressedHistory && (
        <div className="p-3 rounded-sm bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-sm text-primary">summarize</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-primary">{t('worldState.archivedHistory')}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">{compressedHistory}</p>
        </div>
      )}
      {eventHistory.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">{t('worldState.eventLog')}</div>
          {eventHistory.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-on-surface-variant">
              <span className="text-outline shrink-0 w-5 text-right">{i + 1}.</span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
