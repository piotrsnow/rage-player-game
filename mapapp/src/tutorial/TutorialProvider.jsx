// TutorialProvider — mounts the tutorial UI (panel + spotlight) for a
// specific page tutorial. One provider instance per page, configured via
// props so the same renderer can drive the map editor, studio, chargen…
//
// Props:
//   tutorialId  — stable string id, used for localStorage seen-flags.
//   steps       — array of step descriptors (see steps.js examples).
//   sourceStore — Zustand hook for the page's domain store. Must expose
//                 `getState()` + `subscribe()` (the default Zustand API).
//
// Contract:
//   1. On mount, if the user hasn't seen this tutorial yet, flip active=true
//      at step 0.
//   2. Subscribe to `sourceStore`. On each state change (and once on mount),
//      if the current step has a `predicate` and it returns true, advance.
//   3. Render <TutorialPanel /> + <TutorialSpotlight /> (both no-op when
//      the tutorial store is inactive).
//   4. On unmount (e.g. user navigates between /editor ↔ /studio ↔ /chargen
//      during an active run), silently clear `active` so another page's
//      tutorial can take over without permanently flagging this one as seen.

import React, { useEffect } from 'react';
import { useTutorialStore } from './useTutorialStore.js';
import TutorialPanel from './TutorialPanel.jsx';
import TutorialSpotlight from './TutorialSpotlight.jsx';

export default function TutorialProvider({ tutorialId, steps, sourceStore }) {
  useEffect(() => {
    useTutorialStore.getState().maybeAutoStart({ tutorialId, steps });
    return () => {
      // Leaving the page while this tutorial is active — don't burn the
      // seen flag, just stop rendering. maybeAutoStart on remount is
      // still gated by the persisted seenFlags map.
      const t = useTutorialStore.getState();
      if (t.active && t.tutorialId === tutorialId) {
        t.dismiss({ silent: true });
      }
    };
     
  }, [tutorialId]);

  useEffect(() => {
    if (!sourceStore || typeof sourceStore.subscribe !== 'function') return undefined;

    function check() {
      const t = useTutorialStore.getState();
      if (!t.active || t.tutorialId !== tutorialId) return;
      const step = t.steps[t.stepIdx];
      if (!step || step.manual || !step.predicate) return;
      try {
        if (step.predicate(sourceStore.getState())) {
          t.advance(step.id);
        }
      } catch {
        /* predicate failure shouldn't break the page */
      }
    }

    check();
    const unsubSource = sourceStore.subscribe(check);
    // Re-check when the tutorial store itself advances — the new step's
    // predicate might already be satisfied by current domain state.
    const unsubTutorial = useTutorialStore.subscribe(check);
    return () => {
      unsubSource();
      unsubTutorial();
    };
  }, [tutorialId, sourceStore]);

  return (
    <>
      <TutorialSpotlight tutorialId={tutorialId} />
      <TutorialPanel tutorialId={tutorialId} />
    </>
  );
}
