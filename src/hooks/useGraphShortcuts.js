import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts for the LocationGraphModal.
 *
 * - Delete        → deactivate selected node/edge (calls onDelete)
 * - Escape        → deselect / cancel add mode (calls onEscape)
 * - Ctrl+F or /   → focus search input (calls onFocusSearch)
 * - +             → toggle add node mode (calls onToggleAddNode)
 * - E             → toggle add edge mode (calls onToggleAddEdge)
 * - Tab           → cycle focus (calls onCycleFocus)
 */
export function useGraphShortcuts({
  onDelete,
  onEscape,
  onFocusSearch,
  onToggleAddNode,
  onToggleAddEdge,
  onCycleFocus,
  enabled = true,
}) {
  const handlers = useRef({ onDelete, onEscape, onFocusSearch, onToggleAddNode, onToggleAddEdge, onCycleFocus });
  handlers.current = { onDelete, onEscape, onFocusSearch, onToggleAddNode, onToggleAddEdge, onCycleFocus };

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e) {
      const tag = e.target?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.onEscape?.();
        return;
      }

      // Don't intercept shortcuts when user is typing in form fields (except Escape)
      if (isInput) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handlers.current.onDelete?.();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        handlers.current.onFocusSearch?.();
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        handlers.current.onFocusSearch?.();
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handlers.current.onToggleAddNode?.();
        return;
      }

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handlers.current.onToggleAddEdge?.();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handlers.current.onCycleFocus?.();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
