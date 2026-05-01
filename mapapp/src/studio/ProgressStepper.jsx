// ProgressStepper — 4-stage "where am I in setting up a pack?" bar,
// shown at the top of the Studio main column.
//
// Stages (read-only, computed from the zustand store):
//   1. Pack wybrany          (selectedPackId)
//   2. Tileset wybrany       (selectedTilesetId && tilesByLocalId.size > 0)
//   3. Autotile group istnieje (autotileGroups.length > 0)
//   4. ≥1 connection rule    (rules.length > 0)
//
// Clicking a step scrolls to the corresponding anchor (same
// `data-tutorial-id` attributes TutorialSpotlight uses) so it doubles as
// a "jump to section" affordance for long tilesets.

import React from 'react';
import { useStudioStore } from './useStudioStore.js';

const STAGES = [
  { id: 'pack',    label: 'Paczka',    targetId: 'studio-packs' },
  { id: 'tileset', label: 'Tileset', targetId: 'studio-tileset-tabs' },
  { id: 'group',   label: 'Grupa kafli', targetId: 'studio-autodetect' },
  { id: 'rule',    label: 'Reguła łączenia', targetId: 'studio-rules' },
];

function useStageFlags() {
  const selectedPackId = useStudioStore((s) => s.selectedPackId);
  const selectedTilesetId = useStudioStore((s) => s.selectedTilesetId);
  const tilesSize = useStudioStore((s) => s.tilesByLocalId?.size || 0);
  const autotileGroups = useStudioStore((s) => s.autotileGroups);
  const rules = useStudioStore((s) => s.rules);

  return {
    pack: Boolean(selectedPackId),
    tileset: Boolean(selectedTilesetId) && tilesSize > 0,
    group: Array.isArray(autotileGroups) && autotileGroups.length > 0,
    rule: Array.isArray(rules) && rules.length > 0,
  };
}

function scrollToStage(targetId) {
  if (!targetId || typeof document === 'undefined') return;
  const el = document.querySelector(`[data-tutorial-id="${targetId}"]`);
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    el.scrollIntoView();
  }
}

export default function ProgressStepper() {
  const flags = useStageFlags();
  const doneCount = STAGES.filter((s) => flags[s.id]).length;

  return (
    <section
      className={[
        'glass-panel border border-outline-variant/20 rounded-sm',
        'px-3 py-2 flex items-center gap-1',
      ].join(' ')}
      role="navigation"
      aria-label="Postęp przygotowania paczki"
    >
      <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-on-surface-variant/70 mr-2">
        Postęp {doneCount}/{STAGES.length}
      </span>

      {STAGES.map((stage, i) => {
        const done = flags[stage.id];
        const isLast = i === STAGES.length - 1;
        return (
          <React.Fragment key={stage.id}>
            <button
              type="button"
              onClick={() => scrollToStage(stage.targetId)}
              title={done ? `${stage.label} — gotowe` : `${stage.label} — przejdź`}
              aria-label={`${stage.label}${done ? ' — gotowe' : ' — niezaliczone'}`}
              className={[
                'flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-xs',
                'transition-colors hover:bg-surface-container/60',
              ].join(' ')}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] font-bold shrink-0"
                style={
                  done
                    ? {
                        background: 'rgba(134,239,172,0.2)',
                        borderColor: 'rgba(134,239,172,0.6)',
                        color: 'rgb(134 239 172)',
                      }
                    : {
                        background: 'transparent',
                        borderColor: 'rgba(148,163,184,0.4)',
                        color: 'rgb(148 163 184)',
                      }
                }
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={done ? 'text-on-surface' : 'text-on-surface-variant'}
              >
                {stage.label}
              </span>
            </button>
            {!isLast && (
              <span
                className="text-on-surface-variant/40 px-0.5"
                aria-hidden="true"
              >
                →
              </span>
            )}
          </React.Fragment>
        );
      })}
    </section>
  );
}
