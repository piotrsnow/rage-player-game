// OntologyIntroCard — first-run onboarding explainer for the Tileset
// Studio. Shows three side-by-side panels describing the core concepts
// the rest of the UI assumes the user already knows:
//
//   1. Kafel         — atoms + traits + free tags
//   2. Autotile group — N×M block with roles (corner / edge / inner)
//   3. Connection rule — left trait → right trait via group
//
// Visibility gate:
//   localStorage["studio.ontologyIntroSeen"] === "1"  ⇒  hidden.
//   Clicking "Zrozumiałem, ukryj" sets the flag. An optional
//   `onStartTutorial` prop lets the parent kick off the basic scenario
//   right after the intro is dismissed.
//
// The card is purely informational — no domain data is mutated.

import React from 'react';

const LS_KEY = 'studio.ontologyIntroSeen';

export function useOntologyIntroVisible() {
  const [visible, setVisible] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage?.getItem(LS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const hide = React.useCallback(() => {
    try {
      window.localStorage?.setItem(LS_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);
  return { visible, hide };
}

function TileIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden="true">
      <rect x="8" y="8" width="32" height="32" rx="3"
        fill="rgba(56,189,248,0.18)" stroke="rgb(56 189 248)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" fill="rgb(134 239 172)" />
      <circle cx="24" cy="16" r="2" fill="rgb(250 204 21)" />
      <circle cx="32" cy="16" r="2" fill="rgb(248 113 113)" />
      <rect x="12" y="24" width="24" height="3" rx="1" fill="rgba(255,255,255,0.35)" />
      <rect x="12" y="30" width="16" height="3" rx="1" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

function GroupIcon() {
  // 2×3 block with corner / edge / inner indicators.
  const cells = [
    { x: 0, y: 0, role: 'corner' },
    { x: 1, y: 0, role: 'edge' },
    { x: 0, y: 1, role: 'edge' },
    { x: 1, y: 1, role: 'inner' },
    { x: 0, y: 2, role: 'edge' },
    { x: 1, y: 2, role: 'corner' },
  ];
  const color = {
    corner: 'rgb(248 113 113)',
    edge: 'rgb(250 204 21)',
    inner: 'rgb(134 239 172)',
  };
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden="true">
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={8 + c.x * 16}
          y={0 + c.y * 16}
          width={14}
          height={14}
          rx="1.5"
          fill={`${color[c.role]}40`}
          stroke={color[c.role]}
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

function RuleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden="true">
      <rect x="4" y="16" width="14" height="14" rx="2"
        fill="rgba(134,239,172,0.3)" stroke="rgb(134 239 172)" strokeWidth="1.5" />
      <rect x="30" y="16" width="14" height="14" rx="2"
        fill="rgba(250,204,21,0.3)" stroke="rgb(250 204 21)" strokeWidth="1.5" />
      <path d="M19 23 L29 23 M25 19 L29 23 L25 27"
        stroke="rgb(56 189 248)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IntroPanel({ index, icon, title, bullets }) {
  return (
    <div
      className={[
        'flex-1 min-w-0 rounded-sm border border-outline-variant/25',
        'bg-surface-container/50 px-3 py-3 flex flex-col gap-2',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0"
          style={{ background: 'rgba(56,189,248,0.25)', color: 'rgb(125 211 252)' }}
        >
          {index}
        </span>
        <span className="text-xs font-semibold text-on-surface uppercase tracking-[0.06em]">
          {title}
        </span>
      </div>
      <div className="flex items-center justify-center py-1">{icon}</div>
      <ul className="text-[11px] leading-snug text-on-surface-variant flex flex-col gap-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-sky-400/80 shrink-0" aria-hidden="true">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OntologyIntroCard({ onDismiss, onStartTutorial }) {
  return (
    <section
      className={[
        'glass-panel-elevated border border-outline-variant/30 rounded-md',
        'px-3 py-3 flex flex-col gap-2 shadow-md',
      ].join(' ')}
      role="region"
      aria-label="Wprowadzenie do ontologii Studio"
    >
      <header className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-sm"
          style={{ background: 'rgba(56,189,248,0.2)', color: 'rgb(125 211 252)' }}
        >
          Pierwsze uruchomienie
        </span>
        <h2 className="text-sm font-semibold text-on-surface">
          Jak działa Studio — trzy pojęcia
        </h2>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ukryj wprowadzenie"
          title="Ukryj — mogę je wrócić przez Tutorial"
          className={[
            'w-6 h-6 rounded-sm text-on-surface-variant/70',
            'hover:text-on-surface hover:bg-surface-container/70 transition-colors',
            'text-sm leading-none',
          ].join(' ')}
        >
          ×
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-2 items-stretch relative">
        <IntroPanel
          index={1}
          icon={<TileIcon />}
          title="Kafel"
          bullets={[
            'Atomy — co kafel "umie" (Ściana, Woda, Drzwi, Od północy…).',
            'Traity — klasyfikacja (Podłoże, Materiał, Klimat…).',
            'Wolne tagi — twoje etykiety, np. "ruined" albo "npc-only".',
          ]}
        />
        <div className="hidden md:flex items-center px-1 text-on-surface-variant/50" aria-hidden="true">
          →
        </div>
        <IntroPanel
          index={2}
          icon={<GroupIcon />}
          title="Grupa kafli"
          bullets={[
            'Blok N×M kafli (np. A2 = 2×3) z rolami Narożnik / Krawędź / Wklęsły narożnik.',
            'Definiuje, które kafle podstawić przy przejściu biomów.',
            'Jedna grupa = jedno "przejście" (np. trawa-piasek A2).',
          ]}
        />
        <div className="hidden md:flex items-center px-1 text-on-surface-variant/50" aria-hidden="true">
          →
        </div>
        <IntroPanel
          index={3}
          icon={<RuleIcon />}
          title="Reguła łączenia"
          bullets={[
            'Lewy trait (np. Podłoże: Trawa) → prawy trait (Podłoże: Piasek).',
            'Przez — którą grupę kafli używamy do przejścia.',
            'To reguły, które edytor map stosuje automatycznie.',
          ]}
        />
      </div>

      <footer className="flex items-center gap-1.5 pt-1">
        <span className="text-[11px] text-on-surface-variant/70">
          Dobrze jest pomyśleć o tych pojęciach jako o łańcuchu: <strong>kafel</strong>
          {' → '}
          <strong>grupa</strong>
          {' → '}
          <strong>reguła</strong>.
        </span>
        <div className="flex-1" />
        {onStartTutorial && (
          <button
            type="button"
            onClick={() => {
              onStartTutorial();
              onDismiss?.();
            }}
            className={[
              'px-2.5 py-1 text-[11px] rounded-sm',
              'text-on-surface-variant hover:text-on-surface',
              'hover:bg-surface-container/60 transition-colors',
            ].join(' ')}
          >
            Pokaż mi w praktyce
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className={[
            'px-3 py-1 text-xs font-semibold rounded-sm',
            'text-white border hover:brightness-110 transition-all',
          ].join(' ')}
          style={{
            background: 'rgb(56 189 248)',
            borderColor: 'rgb(56 189 248)',
            boxShadow: '0 0 10px rgba(56,189,248,0.35)',
          }}
        >
          Zrozumiałem, ukryj
        </button>
      </footer>
    </section>
  );
}

OntologyIntroCard.LS_KEY = LS_KEY;
