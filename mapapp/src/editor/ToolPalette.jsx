// ToolPalette — row of tool buttons that drive the editor's active tool.
// Keyboard shortcuts (B/R/F/E/A/W, C toggles collision, G grid) are wired
// by the Editor page; this component just renders.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TOOLS, useEditorStore } from './useEditorStore.js';
import Button from '../ui/Button.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import ZoomControl from '../ui/ZoomControl.jsx';

const BUTTONS = [
  { id: TOOLS.brush,       label: 'Brush',    key: 'B' },
  { id: TOOLS.rect,        label: 'Rect',     key: 'R' },
  { id: TOOLS.fill,        label: 'Fill',     key: 'F' },
  { id: TOOLS.eraser,      label: 'Eraser',   key: 'E' },
  { id: TOOLS.autotile,    label: 'Autotile', key: 'A' },
  { id: TOOLS.wall,        label: 'Wall',     key: 'W' },
  { id: TOOLS.select,      label: 'Select',   key: 'S' },
  { id: TOOLS.npcPlace,    label: 'NPC place',key: 'N' },
  { id: TOOLS.playerStart, label: 'Start',    key: 'P' },
];

export default function ToolPalette() {
  const nav = useNavigate();
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const showCollision = useEditorStore((s) => s.showCollision);
  const setShowCollision = useEditorStore((s) => s.setShowCollision);
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const mapId = useEditorStore((s) => s.mapId);

  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      {BUTTONS.map((b) => (
        <Button
          key={b.id}
          onClick={() => setTool(b.id)}
          title={`${b.label} (${b.key})`}
          active={tool === b.id}
          className="font-semibold"
          data-tutorial-id={`tool-${b.id}`}
        >
          {b.label}
          <span className="opacity-50 ml-1 text-[10px]">{b.key}</span>
        </Button>
      ))}

      <div className="w-px h-6 bg-outline-variant/30 mx-1" />

      <Button onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</Button>
      <Button onClick={redo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo">↷</Button>

      <div className="w-px h-6 bg-outline-variant/30 mx-1" />

      <Checkbox
        checked={showGrid}
        onChange={setShowGrid}
        label="Grid"
        hint="(G)"
        accent="primary"
      />
      <Checkbox
        checked={showCollision}
        onChange={setShowCollision}
        label="Collision"
        hint="(C)"
        accent="error"
      />

      <Button
        onClick={() => mapId && nav(`/play/${mapId}`)}
        disabled={!mapId}
        title={mapId ? 'Walk-test this map' : 'Save the map first'}
        className={mapId ? 'text-tertiary border-tertiary/40 hover:border-tertiary hover:bg-tertiary/10' : ''}
      >
        ▶ Play
      </Button>

      <ZoomControl
        className="ml-auto"
        value={zoom}
        onChange={setZoom}
        min={0.25}
        max={4}
        step={0.25}
      />
    </div>
  );
}
