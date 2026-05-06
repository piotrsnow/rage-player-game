// ActorsPanel — list of saved MapActors with checkboxes to pin them to
// the current map. Checked actors flow into MapDoc.meta.npcs and spawn in
// the walk-test via npcMatcher.
//
// Wrapped in an emerald SectionCard — actors are "living" entities, the
// green underscores that meaning (and keeps the sidebar colour palette
// distinct from the sky-blue Layers card above).

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActors } from '../services/useActorsStore.js';
import { useEditorStore } from './useEditorStore.js';
import { SkeletonList } from '../ui/Spinner.jsx';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import SectionCard from '../ui/SectionCard.jsx';

export default function ActorsPanel() {
  const nav = useNavigate();
  const mapNpcs = useEditorStore((s) => s.mapNpcs);
  const toggleMapNpc = useEditorStore((s) => s.toggleMapNpc);
  // Shared store handles the fetch, TTL cache, in-flight dedup, focus /
  // visibility / `rpgon:actors-changed` refresh — so returning from
  // /chargen surfaces newly created actors without a remount here.
  const { actors, loading, error } = useActors();
  const [filter, setFilter] = useState('');

  const activeIds = new Set(mapNpcs.map((n) => n.actorId));

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return actors;
    return actors.filter((a) => {
      if (a.name?.toLowerCase().includes(q)) return true;
      if (Array.isArray(a.tags) && a.tags.some((t) => String(t).toLowerCase().includes(q))) return true;
      return false;
    });
  }, [actors, filter]);

  return (
    <SectionCard title="Actors" accent="emerald" count={actors.length} loading={loading}>
      {error && <div className="text-[11px] text-error">{error}</div>}
      {loading && actors.length === 0 && <SkeletonList count={2} />}
      {!loading && actors.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/70">
          None yet.{' '}
          <button
            onClick={() => nav('/chargen')}
            className="bg-transparent border-none p-0 text-emerald-300 hover:text-emerald-200 underline cursor-pointer text-[11px]"
          >
            Open CharGen
          </button>
        </div>
      )}
      {actors.length > 0 && (
        <Input
          size="sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name / tag…"
        />
      )}
      {actors.length > 0 && filtered.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/50">No actors match "{filter}".</div>
      )}
      <div className="flex flex-col gap-1 max-h-[240px] overflow-auto custom-scrollbar">
        {filtered.map((a) => {
          const on = activeIds.has(a.id);
          return (
            <div
              key={a.id}
              className={[
                'flex items-center gap-1.5 px-1.5 py-1 rounded-sm border transition-colors',
                on
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-surface-container/60 border-outline-variant/25',
              ].join(' ')}
            >
              <Checkbox
                accent="emerald"
                checked={on}
                onChange={() => toggleMapNpc(a.id)}
                title="Include on this map"
              />
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${on ? 'text-emerald-300' : 'text-on-surface'}`}>
                  {a.name}
                </div>
                {a.tags?.length > 0 && (
                  <div className="text-[10px] text-on-surface-variant/60 truncate">
                    {a.tags.join(', ')}
                  </div>
                )}
              </div>
              <button
                onClick={() => nav(`/chargen?actorId=${a.id}`)}
                className="bg-transparent border-none p-0 text-emerald-300 hover:text-emerald-200 underline cursor-pointer text-[10px]"
                title="Edit in CharGen"
              >
                Edit
              </button>
            </div>
          );
        })}
      </div>
      <Button block onClick={() => nav('/chargen')}>+ New actor (CharGen)</Button>
    </SectionCard>
  );
}
