// ActorsLibrary — the left sidebar card listing the user's saved actors.
//
// Replaces the inline section of CharGenPage that rendered:
//   - "+ New random actor" button
//   - name/tag filter input
//   - skeleton / empty-state / filtered-empty-state
//   - list of Button rows (active when currently loaded)
// All in a flat stream of JSX without any card boundary.
//
// Wrapped in SectionCard with the `primary` accent because the user
// identifies this region as "my library of things" — same convention
// the Editor uses for "Saved maps".

import React from 'react';
import Button from '../../ui/Button.jsx';
import { Input } from '../../ui/Input.jsx';
import SectionCard from '../../ui/SectionCard.jsx';
import Spinner, { SkeletonList } from '../../ui/Spinner.jsx';

export default function ActorsLibrary({
  actors,
  actorId,
  filter,
  onFilterChange,
  loading,
  deepLinkLoading,
  onNew,
  onLoad,
}) {
  const q = filter.trim().toLowerCase();
  const filtered = !q
    ? actors
    : actors.filter((a) => (
      a.name?.toLowerCase().includes(q)
      || (Array.isArray(a.tags) && a.tags.some((t) => String(t).toLowerCase().includes(q)))
    ));

  return (
    <SectionCard
      title="Your actors"
      accent="primary"
      count={actors.length}
      loading={loading || deepLinkLoading}
    >
      <Button block onClick={onNew}>+ New random actor</Button>
      {actors.length > 0 && (
        <Input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter by name / tag…"
        />
      )}
      <div className="flex flex-col gap-1 max-h-[240px] overflow-auto custom-scrollbar">
        {loading && actors.length === 0 && <SkeletonList count={3} rowHeight={36} />}
        {!loading && actors.length === 0 && (
          <div className="text-xs text-on-surface-variant/50">No saved actors yet.</div>
        )}
        {actors.length > 0 && filtered.length === 0 && (
          <div className="text-xs text-on-surface-variant/50">No actors match "{filter}".</div>
        )}
        {filtered.map((a) => (
          <Button
            key={a.id}
            block
            active={a.id === actorId}
            onClick={() => onLoad(a)}
            className="justify-start text-left flex-col items-start gap-0.5"
          >
            <span>{a.name}</span>
            <span className="text-[10px] opacity-60">
              {(a.tags || []).slice(0, 4).join(', ') || 'no tags'}
            </span>
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}
