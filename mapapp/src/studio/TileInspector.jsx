// TileInspector — edit atoms/traits/tags for the currently selected tile(s).
//
// Atoms are grouped into 5 visual sub-sections matching ATOM_GROUPS from
// atomDocs.js, each with a widget suited to its semantics:
//   1. Passability — colored toggle chips (solid/walkable/water/hazard)
//   2. Structure   — colored toggle chips (wall/floor/door/window/stairs)
//   3. Edges       — interactive 3x3 compass (Diagram3x3 with onToggle)
//   4. Role        — toggle chips with inline mini-diagram icons
//   5. Layer hint  — segmented radio bar (mutual exclusion)
//
// Traits and free tags follow unchanged.
//
// Any edit calls `queuePatch()` on the Zustand store; `useBulkSave` handles
// the debounced flush to `PATCH /v1/map-studio/tiles/bulk`.
//
// Multi-select semantics:
//   - Atoms show a 3-state checkbox (on / off / mixed) across the selection.
//   - Editing forces the attribute to one value for all selected tiles.

import React, { useMemo, useState } from 'react';
import { LAYER_HINT_ATOMS } from '../../../shared/mapSchemas/atoms.js';
import { TRAIT_KEYS } from '../../../shared/mapSchemas/traitVocab.js';
import { ATOM_DOCS, ATOM_GROUPS } from './atomDocs.js';
import { useStudioStore } from './useStudioStore.js';
import { Input, Select } from '../ui/Input.jsx';
import Chip from '../ui/Chip.jsx';
import TagInput from '../ui/TagInput.jsx';
import Diagram3x3 from '../ui/Diagram3x3.jsx';

const SECTION_TITLE_CLS = 'text-[11px] font-bold tracking-[0.08em] text-on-surface-variant/80 uppercase mt-1';

const PASSABILITY_ATOMS = ['solid', 'walkable', 'water', 'hazard'];
const STRUCTURE_ATOMS = ['wall', 'floor', 'door', 'window', 'stairs'];

const PASSABILITY_COLORS = {
  solid:    { border: 'border-red-500/30',    text: 'text-red-300',    activeBg: 'bg-red-600/60',    activeBorder: 'border-red-400',    activeText: 'text-red-100' },
  walkable: { border: 'border-green-500/30',  text: 'text-green-300',  activeBg: 'bg-green-600/60',  activeBorder: 'border-green-400',  activeText: 'text-green-100' },
  water:    { border: 'border-blue-500/30',   text: 'text-blue-300',   activeBg: 'bg-blue-600/60',   activeBorder: 'border-blue-400',   activeText: 'text-blue-100' },
  hazard:   { border: 'border-orange-500/30', text: 'text-orange-300', activeBg: 'bg-orange-600/60', activeBorder: 'border-orange-400', activeText: 'text-orange-100' },
};

const STRUCTURE_COLORS = {
  wall:    { border: 'border-indigo-500/30',  text: 'text-indigo-300',  activeBg: 'bg-indigo-600/60',  activeBorder: 'border-indigo-400',  activeText: 'text-indigo-100' },
  floor:   { border: 'border-teal-500/30',    text: 'text-teal-300',    activeBg: 'bg-teal-600/60',    activeBorder: 'border-teal-400',    activeText: 'text-teal-100' },
  door:    { border: 'border-purple-500/30',  text: 'text-purple-300',  activeBg: 'bg-purple-600/60',  activeBorder: 'border-purple-400',  activeText: 'text-purple-100' },
  window:  { border: 'border-sky-500/30',     text: 'text-sky-300',     activeBg: 'bg-sky-600/60',     activeBorder: 'border-sky-400',     activeText: 'text-sky-100' },
  stairs:  { border: 'border-amber-500/30',   text: 'text-amber-300',   activeBg: 'bg-amber-600/60',   activeBorder: 'border-amber-400',   activeText: 'text-amber-100' },
};

function summariseAtoms(selectedIds, tilesByLocalId) {
  const counts = new Map();
  for (const id of selectedIds) {
    const atoms = tilesByLocalId.get(id)?.atoms || [];
    for (const a of atoms) counts.set(a, (counts.get(a) || 0) + 1);
  }
  // Map of atom → 'all' | 'some'
  const out = new Map();
  for (const [atom, count] of counts) {
    out.set(atom, count === selectedIds.length ? 'all' : 'some');
  }
  return out;
}

function summariseTraits(selectedIds, tilesByLocalId) {
  const firstByKey = new Map();
  const mixed = new Set();
  let first = true;
  for (const id of selectedIds) {
    const traits = tilesByLocalId.get(id)?.traits || {};
    if (first) {
      for (const k of Object.keys(traits)) firstByKey.set(k, traits[k]);
      first = false;
    } else {
      for (const k of new Set([...Object.keys(traits), ...firstByKey.keys()])) {
        if (traits[k] !== firstByKey.get(k)) mixed.add(k);
      }
    }
  }
  return { byKey: firstByKey, mixed };
}

function summariseTags(selectedIds, tilesByLocalId) {
  const counts = new Map();
  for (const id of selectedIds) {
    const tags = tilesByLocalId.get(id)?.tags || [];
    for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const all = [];
  const some = [];
  for (const [tag, count] of counts) {
    (count === selectedIds.length ? all : some).push(tag);
  }
  return { all, some };
}

export default function TileInspector({ traitVocab }) {
  const selection = useStudioStore((s) => s.selection);
  const tilesByLocalId = useStudioStore((s) => s.tilesByLocalId);
  const queuePerTilePatch = useStudioStore((s) => s.queuePerTilePatch);
  const clearSelection = useStudioStore((s) => s.clearSelection);
  const isSaving = useStudioStore((s) => s.isSaving);
  const lastSavedAt = useStudioStore((s) => s.lastSavedAt);
  const error = useStudioStore((s) => s.error);

  const [traitDraft, setTraitDraft] = useState({ key: TRAIT_KEYS[0], value: '' });

  const ids = useMemo(() => Array.from(selection), [selection]);
  const atomSummary = useMemo(() => summariseAtoms(ids, tilesByLocalId), [ids, tilesByLocalId]);
  const traitSummary = useMemo(() => summariseTraits(ids, tilesByLocalId), [ids, tilesByLocalId]);
  const tagSummary = useMemo(() => summariseTags(ids, tilesByLocalId), [ids, tilesByLocalId]);

  if (!selection.size) {
    return (
      <div className="p-4 text-on-surface-variant/70 text-[13px]">
        Wybierz kafel (klik) lub zaznacz prostokąt na gridzie.
      </div>
    );
  }

  function toggleAtom(atom) {
    const state = atomSummary.get(atom);
    const shouldAdd = state !== 'all';
    queuePerTilePatch((prev) => {
      const current = new Set(prev.atoms || []);
      if (shouldAdd) current.add(atom);
      else current.delete(atom);
      return { atoms: Array.from(current) };
    });
  }

  function toggleLayerHint(atom) {
    const state = atomSummary.get(atom);
    const shouldAdd = state !== 'all';
    queuePerTilePatch((prev) => {
      const current = new Set(prev.atoms || []);
      for (const lh of LAYER_HINT_ATOMS) current.delete(lh);
      if (shouldAdd) current.add(atom);
      return { atoms: Array.from(current) };
    });
  }

  function setTraitValue(key, value) {
    queuePerTilePatch((prev) => {
      const next = { ...(prev.traits || {}) };
      if (value) next[key] = value;
      else delete next[key];
      return { traits: next };
    });
  }

  // The shared TagInput treats its `tags` as the canonical set. For a
  // *single* tile selection that's straight-forward, but in multi-select
  // TagInput only shows tags that are "present on everything" (the
  // `all` summary). We diff prev-vs-next in `onTagsChange` and translate
  // the delta into add/remove patches applied to *every* selected tile.
  function onTagsChange(next) {
    const prevAll = new Set(tagSummary.all);
    const nextSet = new Set(next);
    const added = next.filter((t) => !prevAll.has(t));
    const removed = [...prevAll].filter((t) => !nextSet.has(t));
    if (!added.length && !removed.length) return;
    queuePerTilePatch((prev) => {
      const cur = new Set(prev.tags || []);
      for (const t of added) cur.add(t);
      for (const t of removed) cur.delete(t);
      return { tags: Array.from(cur) };
    });
  }

  const vocabFor = (key) => (traitVocab?.[key] || []).filter(Boolean);

  return (
    <div className="p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 pb-1.5 border-b border-outline-variant/15">
        <span className="text-primary text-base leading-none" aria-hidden="true">◈</span>
        <div className="font-bold text-on-surface tabular-nums min-w-[3ch]">
          {ids.length}
        </div>
        <div className="text-xs text-on-surface-variant/80">
          kafl{ids.length === 1 ? '' : 'i'}
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="ml-auto text-[11px] text-on-surface-variant/70 hover:text-error transition-colors px-1.5 py-0.5 rounded-sm hover:bg-error/10"
          title="Wyczyść zaznaczenie"
        >
          ✕ wyczyść
        </button>
      </div>
      {(isSaving || lastSavedAt) && (
        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/50 -mt-1">
          <span className="leading-none">{isSaving ? '↻' : '✓'}</span>
          {isSaving ? 'zapisuje…' : `zapisane ${relTime(lastSavedAt)}`}
        </div>
      )}
      {error && <div className="text-xs text-error">{error}</div>}

      <div className={SECTION_TITLE_CLS}>{ATOM_GROUPS.passability.labelPl}</div>
      <ColoredChipRow atoms={PASSABILITY_ATOMS} colors={PASSABILITY_COLORS} summary={atomSummary} onToggle={toggleAtom} />

      <div className={SECTION_TITLE_CLS}>{ATOM_GROUPS.structure.labelPl}</div>
      <ColoredChipRow atoms={STRUCTURE_ATOMS} colors={STRUCTURE_COLORS} summary={atomSummary} onToggle={toggleAtom} />

      <div className={SECTION_TITLE_CLS}>{ATOM_GROUPS.edge.labelPl}</div>
      <EdgeCompass summary={atomSummary} onToggle={toggleAtom} />

      <div className={SECTION_TITLE_CLS}>{ATOM_GROUPS.role.labelPl}</div>
      <RoleSelector summary={atomSummary} onToggle={toggleAtom} />

      <div className={SECTION_TITLE_CLS}>{ATOM_GROUPS.layer.labelPl}</div>
      <LayerHintBar summary={atomSummary} onToggle={toggleLayerHint} />

      <div className={SECTION_TITLE_CLS}>Traity</div>
      <div className="flex flex-col gap-1.5">
        {TRAIT_KEYS.map((key) => {
          const value = traitSummary.byKey.get(key) || '';
          const isMixed = traitSummary.mixed.has(key);
          const options = vocabFor(key);
          return (
            <div key={key} className="flex gap-1.5 items-center">
              <div className="w-[72px] shrink-0 text-xs text-on-surface-variant/80">{key}</div>
              <Input
                size="sm"
                list={`vocab-${key}`}
                className={`flex-1 min-w-0 ${isMixed ? 'italic' : ''}`}
                value={value}
                placeholder={isMixed ? '— mixed —' : 'brak'}
                onChange={(e) => setTraitValue(key, e.target.value)}
              />
              <datalist id={`vocab-${key}`}>
                {options.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
          );
        })}
        <div className="flex gap-1.5">
          <Select
            size="sm"
            value={traitDraft.key}
            onChange={(e) => setTraitDraft((d) => ({ ...d, key: e.target.value }))}
            className="w-[104px] shrink-0"
          >
            {TRAIT_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
          <Input
            size="sm"
            className="flex-1 min-w-0"
            placeholder="nowa wartość → zastąp"
            value={traitDraft.value}
            onChange={(e) => setTraitDraft((d) => ({ ...d, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && traitDraft.value.trim()) {
                setTraitValue(traitDraft.key, traitDraft.value.trim());
                setTraitDraft({ key: traitDraft.key, value: '' });
              }
            }}
          />
        </div>
      </div>

      <div className={SECTION_TITLE_CLS}>Free tagi</div>
      <TagInput
        tags={tagSummary.all}
        onChange={onTagsChange}
        placeholder="nowy tag, Enter/, aby dodać"
        lowercase={false}
        accent="sky"
      />
      {tagSummary.some.length > 0 && (
        <div
          className="flex flex-wrap gap-1 -mt-1"
          title="tylko niektóre z zaznaczenia mają te tagi"
        >
          {tagSummary.some.map((tag) => (
            <Chip key={tag} className="border-dashed opacity-70">
              {tag}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'przed chwilą';
  if (s < 60) return `${s}s temu`;
  const m = Math.floor(s / 60);
  return `${m}m temu`;
}

/* ── ColoredChipRow — passability / structure toggle chips ─────────── */

function ColoredChipRow({ atoms, colors, summary, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {atoms.map((atom) => {
        const state = summary.get(atom);
        const active = state === 'all';
        const mixed = state === 'some';
        const c = colors[atom];
        const label = ATOM_DOCS[atom]?.labelPl || atom;
        return (
          <button
            key={atom}
            type="button"
            onClick={() => onToggle(atom)}
            title={ATOM_DOCS[atom]?.descPl || atom}
            className={[
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 cursor-pointer select-none',
              active
                ? `${c.activeBg} ${c.activeBorder} ${c.activeText} font-semibold shadow-sm`
                : `bg-transparent ${c.border} ${c.text} opacity-50 hover:opacity-80`,
              mixed ? 'border-dashed opacity-70' : '',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── EdgeCompass — interactive 3x3 grid for edge_* atoms ──────────── */

const EDGE_KEYS = ['N', 'E', 'S', 'W', 'NE', 'NW', 'SE', 'SW'];

function EdgeCompass({ summary, onToggle }) {
  const highlight = {};
  const mixedKeys = {};
  for (const k of EDGE_KEYS) {
    const state = summary.get(`edge_${k}`);
    if (state === 'all') highlight[k] = true;
    else if (state === 'some') mixedKeys[k] = true;
  }
  function handleToggle(cellKey) {
    if (cellKey === 'center') return;
    onToggle(`edge_${cellKey}`);
  }
  return (
    <div className="flex items-center gap-3">
      <Diagram3x3
        highlight={highlight}
        mixedKeys={mixedKeys}
        disabledKeys={{ center: true }}
        size={84}
        onToggle={handleToggle}
      />
      <div className="flex flex-col gap-0.5 text-[10px] text-on-surface-variant/70">
        <span>Kliknij komórkę,</span>
        <span>żeby przełączyć krawędź.</span>
        {Object.keys(mixedKeys).length > 0 && (
          <span className="text-yellow-400/80 mt-1">◐ = mixed w zaznaczeniu</span>
        )}
      </div>
    </div>
  );
}

/* ── RoleSelector — autotile role toggle chips with mini diagrams ─── */

const ROLE_META = [
  { atom: 'autotile_role_corner', preset: 'corner', color: 'orange' },
  { atom: 'autotile_role_edge',   preset: 'edge',   color: 'sky' },
  { atom: 'autotile_role_inner',  preset: 'inner',  color: 'yellow' },
  { atom: 'autotile_role_fill',   preset: 'fill',   color: 'green' },
];

function RoleSelector({ summary, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLE_META.map(({ atom, preset, color }) => {
        const state = summary.get(atom);
        const active = state === 'all';
        const mixed = state === 'some';
        const label = ATOM_DOCS[atom]?.labelPl || atom;
        return (
          <button
            key={atom}
            type="button"
            onClick={() => onToggle(atom)}
            title={ATOM_DOCS[atom]?.descPl || atom}
            className={[
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors duration-150 cursor-pointer select-none',
              active
                ? 'bg-primary/20 border-primary/50 text-primary font-semibold'
                : 'bg-surface-container/60 border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface',
              mixed ? 'border-dashed opacity-80' : '',
            ].join(' ')}
          >
            <Diagram3x3 preset={preset} size={18} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── LayerHintBar — segmented radio control for layer_hint_* ──────── */

const LAYER_META = [
  { atom: 'layer_hint_ground',  icon: '⬇' },
  { atom: 'layer_hint_overlay', icon: '◇' },
  { atom: 'layer_hint_object',  icon: '⬆' },
];

function LayerHintBar({ summary, onToggle }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-outline-variant/30">
      {LAYER_META.map(({ atom, icon }, i) => {
        const state = summary.get(atom);
        const active = state === 'all';
        const mixed = state === 'some';
        const label = ATOM_DOCS[atom]?.labelPl || atom;
        return (
          <button
            key={atom}
            type="button"
            onClick={() => onToggle(atom)}
            title={ATOM_DOCS[atom]?.descPl || atom}
            className={[
              'flex items-center gap-1 px-3 py-1.5 text-xs transition-colors duration-150 cursor-pointer select-none',
              i > 0 ? 'border-l border-outline-variant/30' : '',
              active
                ? 'bg-primary/25 text-primary font-semibold'
                : 'bg-surface-container/40 text-on-surface-variant hover:bg-surface-container-high/40',
              mixed ? 'bg-yellow-500/10 text-yellow-400' : '',
            ].join(' ')}
          >
            <span className="text-sm leading-none">{icon}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
