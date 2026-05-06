// Top-level router for the Map Studio / Map Editor slice.
//
// Two top-level routes:
//   /studio  — Tileset Studio (upload/slice/tag rules)
//   /editor  — Map Editor    (place tiles, paint autotiles, save MapDoc)
//   /chargen — Character Generator
//   /play    — playtest canvas
//
// A small top bar stays visible across all routes so the user can switch
// without a full reload.

import React from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import StudioPage from './studio/StudioPage.jsx';
import EditorPage from './editor/EditorPage.jsx';
import CharGenPage from './pages/CharGenPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import { useEditorStore } from './editor/useEditorStore.js';
import { useChargenStore } from './chargen/useChargenStore.js';
import { ToastsProvider } from './ui/Toasts.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import { SECTION_ACCENTS } from './ui/sectionAccents.js';

// Guarded NavLink: if the user has unsaved work on the current page
// (editor or chargen), intercept the click and ask before navigating
// away. Uses getState() reads so re-renders don't hammer both stores.
function guardNavigation(currentPath) {
  if (currentPath.startsWith('/editor')) {
    if (useEditorStore.getState().dirty) {
      return window.confirm('You have unsaved map changes. Leave without saving?');
    }
  } else if (currentPath.startsWith('/chargen')) {
    if (useChargenStore.getState().dirty) {
      return window.confirm('You have unsaved actor changes. Leave without saving?');
    }
  }
  return true;
}

// Each nav tab is coloured after the page it opens. The user orients
// by colour first — amber is where tiles live, sky is where maps
// live, violet is where characters live. Inactive tabs keep a muted
// greyscale look so the active tab really stands out.
const TAB_ACCENT = {
  '/studio': 'amber',
  '/editor': 'sky',
  '/chargen': 'violet',
};

function linkClass(to) {
  const accent = TAB_ACCENT[to] || 'primary';
  const tokens = SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary;
  return ({ isActive }) =>
    [
      'px-3 py-1.5 rounded-sm text-sm font-semibold tracking-wide transition-colors duration-150 border',
      isActive
        ? `${tokens.title} ${tokens.softBg} ${tokens.border}`
        : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container-high/50',
    ].join(' ');
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastsProvider>
        <AppShell />
      </ToastsProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const onNavClick = (e, to) => {
    if (pathname.startsWith(to)) return;
    if (!guardNavigation(pathname)) e.preventDefault();
  };
  return (
    <div className="flex flex-col h-full">
      <nav className="sticky top-0 z-10 flex items-center gap-4 px-4 py-2.5 bg-surface-container/70 backdrop-blur-xl border-b border-outline-variant/20">
        <div className="font-headline text-tertiary tracking-wider">RPGon · Map Studio</div>
        <NavLink to="/studio" className={linkClass('/studio')} onClick={(e) => onNavClick(e, '/studio')}>Studio</NavLink>
        <NavLink to="/editor" className={linkClass('/editor')} onClick={(e) => onNavClick(e, '/editor')}>Editor</NavLink>
        <NavLink to="/chargen" className={linkClass('/chargen')} onClick={(e) => onNavClick(e, '/chargen')}>CharGen</NavLink>
        <div className="ml-auto text-[11px] text-on-surface-variant/50 tracking-wide">
          v0.1.0
        </div>
      </nav>
      <div className="flex-1 min-h-0 overflow-auto">
        {/* Inner boundary: a render crash inside one route shouldn't kill the
            nav bar — the user can still click Studio/Editor/CharGen to escape. */}
        <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/studio" replace />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/chargen" element={<CharGenPage />} />
            <Route path="/play/:mapId" element={<PlayPage />} />
            <Route path="*" element={<Navigate to="/studio" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}
