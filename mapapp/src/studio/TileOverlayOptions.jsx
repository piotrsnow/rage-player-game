// TileOverlayOptions — global toggles for the info-overlays painted on
// top of tiles in the TileGrid. Lives in the left Studio sidebar so the
// user can flip them once and see the effect across every tileset/pack
// (flags are stored on `useStudioStore.tileOverlayFlags` and persisted
// to localStorage by the store).
//
// Four independent layers — each preserves pixel real estate for the
// others so enabling all four on a 16px tile still reads cleanly:
//
//   ┌──────────────────┐
//   │ W       [role]  │  ← structure letter (TL) + role badge (TR)
//   │                 │
//   │ ● [pass]    │  ← passability dot (BL)
//   │                 │
//   │ N/E/S/W ticks   │  ← edge ticks along the matching border
//   └──────────────────┘
//
// The little preview mini-tile next to each checkbox shows what that
// overlay looks like on a kafel — cheaper than a tutorial tour and
// answers "what does this toggle even draw?" immediately.

import React from 'react';
import Checkbox from '../ui/Checkbox.jsx';
import SectionCard from '../ui/SectionCard.jsx';
import { useStudioStore } from './useStudioStore.js';

// Colors mirror the ones TileGrid uses for the actual overlay — keep
// the two in sync if you tweak either palette.
const ROLE_COLORS = {
  corner: '#fb923c',
  edge: '#38bdf8',
  inner: '#eab308',
  fill: '#22c55e',
};

const PASSABILITY_COLORS = {
  solid: '#ef4444',
  walkable: '#22c55e',
  water: '#3b82f6',
  hazard: '#f97316',
};

function RolePreview() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" />
      <rect x="15" y="2" width="7" height="7" fill={ROLE_COLORS.corner} stroke="black" strokeOpacity="0.5" strokeWidth="0.5" />
    </svg>
  );
}

function EdgesPreview() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" />
      {/* N edge */}
      <rect x="2" y="2" width="20" height="2" fill="#e879f9" />
      {/* E edge */}
      <rect x="20" y="2" width="2" height="20" fill="#e879f9" />
      {/* SW corner dot */}
      <circle cx="4" cy="20" r="1.6" fill="#e879f9" />
    </svg>
  );
}

function StructurePreview() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" />
      <rect x="2" y="2" width="9" height="9" fill="rgba(99,102,241,0.85)" />
      <text
        x="6.5" y="9"
        fontSize="8" fontWeight="700"
        fill="white" textAnchor="middle"
        fontFamily="system-ui, sans-serif"
      >
        W
      </text>
    </svg>
  );
}

function PassabilityPreview() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" />
      <circle cx="6" cy="18" r="3.2" fill={PASSABILITY_COLORS.solid} stroke="black" strokeOpacity="0.45" strokeWidth="0.5" />
    </svg>
  );
}

const OPTIONS = [
  {
    key: 'role',
    label: 'Rola autotile',
    hint: 'róg / krawędź / wnętrze / fill',
    title: 'Rola kafla w grupie autotile — kolorowy kwadrat w prawym górnym rogu kafla.',
    accent: 'orange',
    Preview: RolePreview,
  },
  {
    key: 'edges',
    label: 'Kierunek (krawędzie)',
    hint: 'N / E / S / W + skosy',
    title: 'Krawędzie biomu — cienkie paski wzdłuż krawędzi kafla (edge_N/E/S/W) i kropki w rogach (edge_NE/NW/SE/SW).',
    accent: 'fuchsia',
    Preview: EdgesPreview,
  },
  {
    key: 'structure',
    label: 'Typ struktury',
    hint: 'Wall / Floor / Door / Okno / Stairs',
    title: 'Typ obiektu — litera w lewym górnym rogu kafla (W=wall, F=floor, D=door, O=okno, S=stairs).',
    accent: 'indigo',
    Preview: StructurePreview,
  },
  {
    key: 'passability',
    label: 'Przejezdność',
    hint: 'solid / walkable / water / hazard',
    title: 'Czy kafel jest przechodni — kolorowa kropka w lewym dolnym rogu kafla.',
    accent: 'rose',
    Preview: PassabilityPreview,
  },
];

const FOCUS_OPTIONS = [
  { value: '', label: '— brak —' },
  { value: 'pass:walkable', label: 'Przejezdne (walkable)' },
  { value: 'pass:solid', label: 'Nieprzejezdne (solid)' },
  { value: 'pass:water', label: 'Woda' },
  { value: 'pass:hazard', label: 'Zagrożenie (hazard)' },
  { value: 'struct:wall', label: 'Ściany' },
  { value: 'struct:floor', label: 'Podłogi' },
  { value: 'struct:door', label: 'Drzwi' },
  { value: 'struct:window', label: 'Okna' },
  { value: 'struct:stairs', label: 'Schody' },
  { value: 'role:corner', label: 'Rola: corner' },
  { value: 'role:edge', label: 'Rola: edge' },
  { value: 'role:inner', label: 'Rola: inner' },
  { value: 'role:fill', label: 'Rola: fill' },
  { value: 'edges:any', label: 'Dowolna krawędź' },
  { value: 'untagged', label: 'Nieotagowane' },
];

export default function TileOverlayOptions() {
  const flags = useStudioStore((s) => s.tileOverlayFlags);
  const setFlag = useStudioStore((s) => s.setTileOverlayFlag);
  const resetFlags = useStudioStore((s) => s.resetTileOverlayFlags);
  const focusMode = useStudioStore((s) => s.tileFocusMode);
  const setFocusMode = useStudioStore((s) => s.setTileFocusMode);
  const highlightUntagged = useStudioStore((s) => s.highlightUntagged);
  const setHighlightUntagged = useStudioStore((s) => s.setHighlightUntagged);
  const hoverTooltipEnabled = useStudioStore((s) => s.hoverTooltipEnabled);
  const setHoverTooltipEnabled = useStudioStore((s) => s.setHoverTooltipEnabled);

  const allOn = OPTIONS.every((o) => !!flags[o.key]);
  const anyOn = OPTIONS.some((o) => !!flags[o.key]);

  return (
    <SectionCard
      title="Info na kaflach"
      accent="sky"
      collapsible
      defaultCollapsed={false}
      bodyClassName="!gap-1.5"
      headerRight={
        anyOn && !allOn ? (
          <button
            type="button"
            onClick={resetFlags}
            title="Włącz wszystkie warstwy info"
            className="text-[10px] px-1.5 py-0.5 rounded-sm text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/60"
          >
            reset
          </button>
        ) : null
      }
    >
      <div className="text-[11px] text-on-surface-variant/70 leading-snug -mt-0.5 mb-0.5">
        Globalne — dotyczą każdego tilesetu.
      </div>
      {OPTIONS.map(({ key, label, hint, title, accent, Preview }) => (
        <div key={key} className="flex items-center gap-1.5">
          <Preview />
          <Checkbox
            checked={!!flags[key]}
            onChange={(next) => setFlag(key, next)}
            label={label}
            hint={hint}
            accent={accent}
            title={title}
            className="flex-1 min-w-0"
          />
        </div>
      ))}

      <div className="h-px bg-outline-variant/20 my-1" />

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-on-surface-variant/80 leading-tight">
          Focus / filtruj
        </label>
        <select
          value={focusMode || ''}
          onChange={(e) => setFocusMode(e.target.value || null)}
          title="Dim wszystkich kafli poza wybraną kategorią. Pasujące kafle dostają jasną obwódkę."
          className="text-[11px] px-1.5 py-1 rounded-sm bg-surface-container-highest border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary/60"
        >
          {FOCUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {focusMode && (
          <button
            type="button"
            onClick={() => setFocusMode(null)}
            className="self-start text-[10px] px-1.5 py-0.5 rounded-sm text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/60"
          >
            wyłącz focus
          </button>
        )}
      </div>

      <Checkbox
        checked={!!highlightUntagged}
        onChange={(next) => setHighlightUntagged(next)}
        label="Podświetl nieotagowane"
        hint="ukośne kreski na kaflach bez atomów/traitów/tagów"
        accent="rose"
        title="Opt-in: rysuje lekkie czerwone kreski na każdym kaflu, który nie ma żadnych atomów, traitów ani tagów."
      />

      <Checkbox
        checked={!!hoverTooltipEnabled}
        onChange={(next) => setHoverTooltipEnabled(next)}
        label="Tooltip pod kursorem"
        hint="pokazuj kartę kafla przy najechaniu myszą"
        accent="sky"
        title="Opt-in: przy najechaniu na kafel w siatce pokazuje obok pływającą kartę z podglądem, atomami i traitami."
      />
    </SectionCard>
  );
}
