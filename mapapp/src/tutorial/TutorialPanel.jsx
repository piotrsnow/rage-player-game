// TutorialPanel — floating bottom-right card with the step checklist,
// copy for the active step, and navigation controls. Reads `steps` from
// the tutorial store (populated by whichever page owns the active run).
//
// Scoping via `tutorialId` prop: only renders if the active run matches,
// so providers on different routes never double-render the panel.

import React from 'react';
import { useTutorialStore } from './useTutorialStore.js';

export default function TutorialPanel({ tutorialId }) {
  const active = useTutorialStore((s) => s.active);
  const activeId = useTutorialStore((s) => s.tutorialId);
  const stepIdx = useTutorialStore((s) => s.stepIdx);
  const completed = useTutorialStore((s) => s.completed);
  const steps = useTutorialStore((s) => s.steps);

  if (!active) return null;
  if (tutorialId && activeId && activeId !== tutorialId) return null;

  const step = steps[stepIdx];
  if (!step) return null;
  const total = steps.length;
  const done = completed.size;
  const pct = Math.round((done / Math.max(1, total - 1)) * 100);

  return (
    <div
      className={[
        'fixed right-4 bottom-14 z-[900]',
        'w-[340px] max-w-[calc(100vw-2rem)]',
        'glass-panel-elevated border border-outline-variant/30 rounded-md',
        'flex flex-col overflow-hidden shadow-lg',
      ].join(' ')}
      role="dialog"
      aria-label="Samouczek"
    >
      <header className="px-3 py-2 border-b border-outline-variant/20 flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant/70">
          Samouczek
        </span>
        <span className="text-[11px] text-on-surface-variant/60">
          {Math.min(stepIdx + 1, total)}/{total}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => useTutorialStore.getState().dismiss()}
          aria-label="Zamknij samouczek"
          title="Zamknij samouczek"
          className={[
            'w-6 h-6 rounded-sm text-on-surface-variant/70',
            'hover:text-on-surface hover:bg-surface-container/70 transition-colors',
            'text-sm leading-none',
          ].join(' ')}
        >
          ×
        </button>
      </header>

      <div className="h-1 bg-outline-variant/20">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: 'rgb(56 189 248)' }}
        />
      </div>

      <ul className="px-3 py-2 flex flex-col gap-1 border-b border-outline-variant/20 max-h-[180px] overflow-auto custom-scrollbar">
        {steps.map((s, i) => {
          const isActive = i === stepIdx;
          const isDone = completed.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => useTutorialStore.getState().goTo(i)}
                className={[
                  'w-full text-left flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs',
                  'transition-colors',
                  isActive
                    ? 'text-white font-semibold'
                    : isDone
                      ? 'text-on-surface hover:bg-surface-container/50'
                      : 'text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface',
                ].join(' ')}
                style={isActive ? { background: 'rgba(56,189,248,0.35)' } : undefined}
              >
                <span
                  className={[
                    'inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] font-bold shrink-0',
                  ].join(' ')}
                  style={
                    isDone
                      ? { background: 'rgba(56,189,248,0.2)', borderColor: 'rgba(56,189,248,0.6)', color: 'rgb(56 189 248)' }
                      : isActive
                        ? { borderColor: 'rgb(56 189 248)', color: 'rgb(56 189 248)' }
                        : undefined
                  }
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span className={isActive ? 'font-semibold' : ''}>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="text-xs font-semibold text-on-surface">{step.title}</div>
        <p className="text-xs leading-relaxed text-on-surface-variant">{step.body}</p>
      </div>

      <footer className="px-3 py-2 border-t border-outline-variant/20 flex items-center gap-1.5">
        {step.isFinal ? (
          <button
            type="button"
            onClick={() => useTutorialStore.getState().finish()}
            className={[
              'px-3 py-1.5 text-xs font-semibold rounded-sm',
              'text-white border',
              'hover:brightness-110 transition-all ml-auto',
            ].join(' ')}
            style={{
              background: 'rgb(56 189 248)',
              borderColor: 'rgb(56 189 248)',
              boxShadow: '0 0 10px rgba(56,189,248,0.4)',
            }}
          >
            Zakończ
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => useTutorialStore.getState().dismiss()}
              className={[
                'px-2 py-1 text-[11px] rounded-sm',
                'text-on-surface-variant/70 hover:text-on-surface',
                'hover:bg-surface-container/60 transition-colors',
              ].join(' ')}
            >
              Zakończ samouczek
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => useTutorialStore.getState().skipStep()}
              className={[
                'px-2 py-1 text-[11px] rounded-sm',
                'text-on-surface-variant/70 hover:text-on-surface',
                'hover:bg-surface-container/60 transition-colors',
              ].join(' ')}
            >
              Pomiń krok
            </button>
            {step.manual && (
              <button
                type="button"
                onClick={() => useTutorialStore.getState().advance(step.id)}
                className={[
                  'px-3 py-1 text-xs font-semibold rounded-sm',
                  'text-white border',
                  'hover:brightness-110 transition-all',
                ].join(' ')}
                style={{
                  background: 'rgb(56 189 248)',
                  borderColor: 'rgb(56 189 248)',
                  boxShadow: '0 0 10px rgba(56,189,248,0.4)',
                }}
              >
                Dalej
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
