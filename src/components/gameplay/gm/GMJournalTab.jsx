import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const JOURNAL_SECTIONS = ['timeline', 'decisions', 'facts', 'codex'];

export default function GMJournalTab({ gameState }) {
  const { t } = useTranslation();
  const [section, setSection] = useState('timeline');

  const world = gameState?.world || {};
  const eventHistory = world.eventHistory || [];
  const compressedHistory = world.compressedHistory || '';
  const facts = world.facts || [];
  const knowledgeBase = world.knowledgeBase || {};
  const decisions = knowledgeBase.decisions || [];
  const events = knowledgeBase.events || [];
  const plotThreads = knowledgeBase.plotThreads || [];
  const codex = world.codex || {};
  const codexEntries = Object.values(codex);

  const hasContent = eventHistory.length > 0 || compressedHistory || facts.length > 0 || decisions.length > 0 || codexEntries.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">menu_book</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.emptyJournal')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-navigation */}
      <div className="flex gap-1 px-4 py-2 border-b border-outline-variant/10 shrink-0 overflow-x-auto">
        {JOURNAL_SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-2 py-1 text-[10px] font-label uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
              section === s
                ? 'bg-primary/15 text-primary border border-primary/20'
                : 'text-outline hover:text-on-surface-variant border border-transparent'
            }`}
          >
            {t(`gmModal.journalSections.${s}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {section === 'timeline' && (
          <TimelineSection
            eventHistory={eventHistory}
            compressedHistory={compressedHistory}
            events={events}
            plotThreads={plotThreads}
            t={t}
          />
        )}
        {section === 'decisions' && <DecisionsSection decisions={decisions} t={t} />}
        {section === 'facts' && <FactsSection facts={facts} t={t} />}
        {section === 'codex' && <CodexSection entries={codexEntries} t={t} />}
      </div>
    </div>
  );
}

function TimelineSection({ eventHistory, compressedHistory, events, plotThreads, t }) {
  return (
    <div className="space-y-6">
      {/* Compressed history */}
      {compressedHistory && (
        <div className="p-3 rounded-sm bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-sm text-primary">summarize</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-primary">{t('gmModal.archivedHistory')}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">{compressedHistory}</p>
        </div>
      )}

      {/* Plot threads */}
      {plotThreads.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-tertiary">timeline</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.plotThreads')}</span>
          </div>
          <div className="space-y-2">
            {plotThreads.map((thread) => (
              <div key={thread.id} className="p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${thread.status === 'active' ? 'bg-primary' : thread.status === 'resolved' ? 'bg-outline' : 'bg-tertiary'}`} />
                  <span className="text-[11px] font-bold text-on-surface">{thread.name}</span>
                  <span className="text-[9px] text-outline uppercase">{thread.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event history (vertical timeline) */}
      {eventHistory.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-primary">history</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.eventLog')}</span>
            <span className="text-[10px] text-outline">({eventHistory.length})</span>
          </div>
          <div className="relative pl-4 border-l border-outline-variant/20 space-y-3">
            {eventHistory.map((entry, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[calc(1rem+3.5px)] top-1.5 w-2 h-2 rounded-full bg-primary/60 border border-surface-container" />
                <p className="text-[11px] text-on-surface-variant leading-relaxed">{entry}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-outline">event_note</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.knowledgeEvents')}</span>
          </div>
          <div className="space-y-2">
            {events.slice(-20).reverse().map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <span className={`material-symbols-outlined text-[10px] mt-0.5 shrink-0 ${
                  ev.importance === 'critical' ? 'text-error' :
                  ev.importance === 'major' ? 'text-primary' : 'text-outline'
                }`}>
                  {ev.importance === 'critical' ? 'priority_high' : ev.importance === 'major' ? 'label_important' : 'label'}
                </span>
                <span className="text-on-surface-variant">{ev.summary}</span>
                {ev.tags?.length > 0 && (
                  <span className="text-outline shrink-0">[{ev.tags.join(', ')}]</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionsSection({ decisions, t }) {
  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">fork_right</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.noDecisions')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.slice().reverse().map((dec, i) => (
        <div key={i} className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-sm text-tertiary mt-0.5">fork_right</span>
            <div className="flex-1">
              <p className="text-[11px] text-on-surface font-medium">{dec.choice}</p>
              {dec.consequence && (
                <p className="text-[10px] text-on-surface-variant mt-1">{dec.consequence}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {dec.tags?.length > 0 && dec.tags.map((tag, j) => (
                  <span key={j} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-outline/10 text-outline">{tag}</span>
                ))}
                {dec.sceneIndex != null && (
                  <span className="text-[9px] text-outline">#{dec.sceneIndex + 1}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FactsSection({ facts, t }) {
  if (facts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">lightbulb</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.noFacts')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {facts.map((fact, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-xs text-primary/60 mt-0.5 shrink-0">lightbulb</span>
          <span>{fact}</span>
        </div>
      ))}
    </div>
  );
}

function CodexSection({ entries, t }) {
  const [expanded, setExpanded] = useState(null);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">auto_stories</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.noCodex')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-sm border border-outline-variant/10 bg-surface-container/40 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container/60 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-primary">
              {expanded === entry.id ? 'expand_more' : 'chevron_right'}
            </span>
            <span className="text-[11px] font-bold text-on-surface flex-1 truncate">{entry.name}</span>
            {entry.category && (
              <span className="text-[9px] text-outline uppercase shrink-0">{entry.category}</span>
            )}
          </button>
          {expanded === entry.id && (
            <div className="px-3 pb-3 space-y-2 border-t border-outline-variant/10">
              {entry.fragments?.map((frag) => (
                <div key={frag.id} className="pt-2">
                  {frag.aspect && (
                    <div className="text-[9px] font-bold uppercase text-outline mb-0.5">{frag.aspect}</div>
                  )}
                  <p className="text-[10px] text-on-surface-variant">{frag.content}</p>
                  {frag.source && (
                    <span className="text-[9px] text-outline italic">{frag.source}</span>
                  )}
                </div>
              ))}
              {entry.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {entry.tags.map((tag, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary/80">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
