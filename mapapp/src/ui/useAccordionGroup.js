// useAccordionGroup — MRU-coordinated accordion for a set of stacked
// SectionCards sharing a scroll container.
//
// Behaviour:
//   - Each section id is either open or closed. The open set is kept as
//     an MRU-ordered list (index 0 = most recently opened).
//   - Toggling closed -> open prepends to MRU, then runs a reflow pass.
//   - Toggling open -> closed removes from MRU unless it would leave the
//     group empty (we always keep at least one section open so the user
//     never ends up with nothing to interact with).
//   - reflow() measures the scroll container's clientHeight and each open
//     section's rendered body height (plus every section header). While the
//     total wouldn't fit and more than one section is open, it collapses
//     the tail of the MRU list one by one.
//   - ResizeObserver on the container + each registered body re-runs
//     reflow on layout changes (window resize, inner content growth).
//   - Open state is persisted to localStorage under `storageKey`.
//
// Returns:
//   {
//     isOpen(id),
//     toggle(id),
//     registerBodyRef(id) — pass as `bodyRef` to SectionCard,
//     registerHeaderRef(id) — optional, for header height measurement,
//   }
//
// Ids passed to the hook are the canonical set — stored entries for ids
// that aren't in the current set get pruned on mount (handles cases where
// sections are conditionally rendered, e.g. only when a pack is selected).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function readStored(storageKey) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

function writeStored(storageKey, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function useAccordionGroup({
  ids,
  storageKey,
  containerRef,
  defaultOpen,
}) {
  const idsKey = ids.join('|');

  const [expanded, setExpanded] = useState(() => {
    const stored = storageKey ? readStored(storageKey) : null;
    const idSet = new Set(ids);
    if (stored && stored.length) {
      const filtered = stored.filter((id) => idSet.has(id));
      if (filtered.length) return filtered;
    }
    if (Array.isArray(defaultOpen) && defaultOpen.length) {
      const filtered = defaultOpen.filter((id) => idSet.has(id));
      if (filtered.length) return filtered;
    }
    return ids.length ? [ids[0]] : [];
  });

  // Prune stale ids when the `ids` set changes (e.g. a section disappears
  // because its prerequisite is no longer met).
  useEffect(() => {
    setExpanded((prev) => {
      const idSet = new Set(ids);
      const next = prev.filter((id) => idSet.has(id));
      if (next.length === prev.length) return prev;
      if (!next.length && ids.length) return [ids[0]];
      return next;
    });
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist on every change.
  useEffect(() => {
    if (storageKey) writeStored(storageKey, expanded);
  }, [storageKey, expanded]);

  const bodyRefs = useRef(new Map()); // id -> HTMLElement
  const headerRefs = useRef(new Map());

  const registerBodyRef = useCallback(
    (id) => (node) => {
      if (node) bodyRefs.current.set(id, node);
      else bodyRefs.current.delete(id);
    },
    [],
  );
  const registerHeaderRef = useCallback(
    (id) => (node) => {
      if (node) headerRefs.current.set(id, node);
      else headerRefs.current.delete(id);
    },
    [],
  );

  // Compute the tail-pop needed to make the open set fit the container.
  // Pure function of current measurements; called by reflow().
  const reflow = useCallback(() => {
    const container = containerRef?.current;
    if (!container) return;
    setExpanded((prev) => {
      if (prev.length <= 1) return prev;
      const available = container.clientHeight;
      if (!available) return prev;

      // Total height when all sections' headers are rendered + open bodies
      // are expanded. We sum every header (even closed) because they're
      // always in the DOM.
      let headersTotal = 0;
      for (const node of headerRefs.current.values()) {
        headersTotal += node?.offsetHeight || 0;
      }
      // Small slack for gaps / padding — the Sidebar uses `gap-3` (12px)
      // between cards and `p-3` (12px top+bottom). Rather than measure
      // those we use a conservative constant that tracks the Sidebar.
      const CHROME_SLACK = 48;

      const bodyHeight = (id) => bodyRefs.current.get(id)?.scrollHeight || 0;

      const order = [...prev];
      const sumBodies = () =>
        order.reduce((acc, id) => acc + bodyHeight(id), 0);

      while (order.length > 1 && headersTotal + sumBodies() + CHROME_SLACK > available) {
        order.pop();
      }

      if (order.length === prev.length) return prev;
      return order;
    });
  }, [containerRef]);

  const toggle = useCallback(
    (id) => {
      setExpanded((prev) => {
        const isOpen = prev.includes(id);
        if (isOpen) {
          if (prev.length <= 1) return prev; // keep >=1 open
          return prev.filter((x) => x !== id);
        }
        return [id, ...prev.filter((x) => x !== id)];
      });
      // reflow after commit — wait two frames so the newly-opened body has
      // measurable layout before we decide which tail to collapse.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => reflow());
      });
    },
    [reflow],
  );

  const isOpen = useCallback((id) => expanded.includes(id), [expanded]);

  // ResizeObserver wiring: watch the container + every currently-mounted
  // body node. Re-run reflow whenever any of them changes size.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => reflow());
    });
    const container = containerRef?.current;
    if (container) ro.observe(container);
    for (const node of bodyRefs.current.values()) {
      if (node) ro.observe(node);
    }
    return () => ro.disconnect();
  }, [containerRef, reflow, expanded]);

  return useMemo(
    () => ({ isOpen, toggle, registerBodyRef, registerHeaderRef }),
    [isOpen, toggle, registerBodyRef, registerHeaderRef],
  );
}

export default useAccordionGroup;
