// NpcPlaceInspector — right-sidebar panel that edits the currently selected
// NPC place object. Shows tag filters, spawn chance and min/max counts.

import React from 'react';
import { useEditorStore } from './useEditorStore.js';
import { Input } from '../ui/Input.jsx';
import Button from '../ui/Button.jsx';
import TagInput from '../ui/TagInput.jsx';

export default function NpcPlaceInspector() {
  const object = useEditorStore((s) => s.objects.find((o) => o.id === s.selectedObjectId) || null);
  const updateObject = useEditorStore((s) => s.updateObject);
  const removeObject = useEditorStore((s) => s.removeObject);
  const setSelectedObject = useEditorStore((s) => s.setSelectedObject);

  if (!object) {
    return (
      <div className="text-[11px] text-on-surface-variant/60">
        Click an NPC place marker to edit its filter tags.
      </div>
    );
  }

  const data = object.data || {};
  const tags = Array.isArray(data.tags) ? data.tags : [];

  function patchData(patch) {
    updateObject(object.id, { data: { ...data, ...patch } });
  }

  const kindLabel = object.kind === 'npc_place' ? 'NPC Place' : object.kind;
  const lbl = 'text-[11px] text-on-surface-variant/70';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <strong className="text-sm text-on-surface">{kindLabel}</strong>
        <span className="text-[11px] text-on-surface-variant/60">({object.x}, {object.y})</span>
      </div>

      {object.kind === 'npc_place' && (
        <>
          <label className={lbl}>Required tags (any-match)</label>
          <TagInput
            tags={tags}
            onChange={(next) => patchData({ tags: next })}
            placeholder="add tag"
            accent="rose"
          />
          <div className="text-[10px] text-on-surface-variant/50">
            An actor spawns here if any of its tags match (or if both lists are empty).
          </div>

          <label className={lbl}>Spawn chance (0–1)</label>
          <Input
            type="number" min={0} max={1} step={0.05}
            value={data.spawnChance ?? 1}
            onChange={(e) => patchData({ spawnChance: clamp01(e.target.value) })}
          />

          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className={lbl}>Min</label>
              <Input
                type="number" min={0}
                value={data.minCount ?? 0}
                onChange={(e) => patchData({ minCount: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <div className="flex-1">
              <label className={lbl}>Max</label>
              <Input
                type="number" min={0}
                value={data.maxCount ?? 1}
                onChange={(e) => patchData({ maxCount: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex gap-1.5 mt-2">
        <Button block onClick={() => setSelectedObject(null)}>Deselect</Button>
        <Button block variant="danger" onClick={() => { removeObject(object.id); }}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
