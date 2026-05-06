// useEditorShortcuts — installs the editor keyboard shortcuts.
//
// Moved verbatim from EditorPage's 70-line useEffect. The hook's only
// external dependencies are `saveMap` (to wire Ctrl+S) and a `toasts`
// instance (for Copy/Paste feedback). Everything else pulls directly
// from useEditorStore.getState() so we avoid re-subscribing on every
// store tick — the listener itself reads the freshest state on
// keypress.
//
// Also surfaces `hoverCellRef` so MapCanvas can write the currently
// hovered cell into it for Ctrl+V paste targeting.

import { useEffect, useRef } from 'react';
import { TOOLS, useEditorStore } from './useEditorStore.js';

export function useEditorShortcuts({ saveMap, toasts, onToggleShortcuts }) {
  const hoverCellRef = useRef(null);

  useEffect(() => {
    function onKey(ev) {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) {
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        if (ev.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault();
        useEditorStore.getState().redo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')) {
        ev.preventDefault();
        saveMap?.();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C')) {
        const s = useEditorStore.getState();
        if (!s.selection) return;
        ev.preventDefault();
        if (s.copySelection()) {
          const cb = useEditorStore.getState().clipboard;
          toasts?.show(`Copied ${cb.cols}×${cb.rows}`, { level: 'info', ttl: 2000 });
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'v' || ev.key === 'V')) {
        const s = useEditorStore.getState();
        if (!s.clipboard) return;
        ev.preventDefault();
        const target = hoverCellRef.current
          || (s.selection ? { x: s.selection.x0, y: s.selection.y0 } : null);
        if (!target) return;
        s.beginStroke();
        s.pasteAt(target.x, target.y);
        s.endStroke();
        toasts?.show(`Pasted at ${target.x},${target.y}`, { level: 'info', ttl: 2000 });
        return;
      }
      if (ev.key === 'Escape') {
        const s = useEditorStore.getState();
        if (s.selection) { ev.preventDefault(); s.clearSelection(); }
        return;
      }
      if (ev.key === '?' || (ev.shiftKey && ev.key === '/')) {
        ev.preventDefault();
        onToggleShortcuts?.();
        return;
      }
      const k = ev.key.toLowerCase();
      const s = useEditorStore.getState();
      if (k === 'b') s.setTool(TOOLS.brush);
      else if (k === 'r') s.setTool(TOOLS.rect);
      else if (k === 'f') s.setTool(TOOLS.fill);
      else if (k === 'e') s.setTool(TOOLS.eraser);
      else if (k === 'a') s.setTool(TOOLS.autotile);
      else if (k === 'w') s.setTool(TOOLS.wall);
      else if (k === 's') s.setTool(TOOLS.select);
      else if (k === 'n') s.setTool(TOOLS.npcPlace);
      else if (k === 'p' && !(ev.ctrlKey || ev.metaKey)) s.setTool(TOOLS.playerStart);
      else if (k === 'g') s.setShowGrid(!s.showGrid);
      else if (k === 'c') s.setShowCollision(!s.showCollision);
      else if (k === '1') s.setActiveLayer('ground');
      else if (k === '2') s.setActiveLayer('overlay');
      else if (k === '3') s.setActiveLayer('objects');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
     
  }, [saveMap, toasts, onToggleShortcuts]);

  return { hoverCellRef };
}
