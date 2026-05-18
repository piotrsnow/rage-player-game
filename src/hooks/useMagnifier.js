import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'rpgon_magnifier';
const ZOOM_MIN = 1.5;
const ZOOM_MAX = 5.0;
const ZOOM_STEP = 0.5;
const SIZE_MIN = 100;
const SIZE_MAX = 500;
const SIZE_STEP = 50;

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function persist(zoom, size) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ zoom, size })); } catch {}
}

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export default function useMagnifier() {
  const saved = useRef(loadPersisted());
  const [active, setActive] = useState(false);
  const [zoom, setZoomRaw] = useState(saved.current?.zoom ?? 2.0);
  const [size, setSizeRaw] = useState(saved.current?.size ?? 200);
  // 'zoom' or 'size' — determines what scroll / +/- adjusts
  const [mode, setMode] = useState('zoom');

  const setZoom = useCallback((v) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(v * 10) / 10));
    setZoomRaw(clamped);
  }, []);

  const setSize = useCallback((v) => {
    const clamped = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(v)));
    setSizeRaw(clamped);
  }, []);

  const toggle = useCallback(() => setActive((p) => !p), []);
  const toggleMode = useCallback(() => setMode((m) => m === 'zoom' ? 'size' : 'zoom'), []);

  const increment = useCallback(() => {
    if (mode === 'zoom') setZoom(zoom + ZOOM_STEP);
    else setSize(size + SIZE_STEP);
  }, [mode, zoom, size, setZoom, setSize]);

  const decrement = useCallback(() => {
    if (mode === 'zoom') setZoom(zoom - ZOOM_STEP);
    else setSize(size - SIZE_STEP);
  }, [mode, zoom, size, setZoom, setSize]);

  useEffect(() => { persist(zoom, size); }, [zoom, size]);

  // Right click = toggle mode (left click passes through to the page normally)
  useEffect(() => {
    if (!active) return;
    const onContext = (e) => {
      if (e.target.closest?.('[data-magnifier-hud]')) return;
      e.preventDefault();
      e.stopPropagation();
      setMode((m) => m === 'zoom' ? 'size' : 'zoom');
    };
    window.addEventListener('contextmenu', onContext, true);
    return () => window.removeEventListener('contextmenu', onContext, true);
  }, [active]);

  // Scroll wheel = adjust current mode value
  useEffect(() => {
    if (!active) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) increment();
      else if (e.deltaY > 0) decrement();
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [active, increment, decrement]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        if (isInputFocused()) return;
        e.preventDefault();
        setActive((p) => !p);
        return;
      }
      if (!active) return;
      if (isInputFocused()) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setActive(false);
          break;
        case '=':
        case '+':
          e.preventDefault();
          increment();
          break;
        case '-':
          e.preventDefault();
          decrement();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, increment, decrement]);

  return { active, zoom, size, mode, toggle, toggleMode, setZoom, setSize, increment, decrement };
}
