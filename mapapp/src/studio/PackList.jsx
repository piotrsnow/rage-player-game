// PackList — clickable list of the current user's tileset packs.
//
// Pulled out of StudioPage so the sidebar is just <PackList /> +
// <PackActions />. Delete confirmation is kept local (the inline
// "are you sure?" inside the row), because it shares a timeout and
// a selection memory with the list. A global "confirm delete" modal
// would be heavier and harder to hit on a touchpad.
//
// Props:
//   packs              — array of pack rows
//   loading            — spinner in the header until the first load completes
//   selectedPackId     — highlighted row
//   onSelect(id)       — row click
//   onDelete(pack)     — fully confirmed delete (parent does the API call)

import React, { useEffect, useState } from 'react';
import Spinner, { SkeletonList } from '../ui/Spinner.jsx';
import SectionCard from '../ui/SectionCard.jsx';

export default function PackList({
  packs,
  loading,
  selectedPackId,
  onSelect,
  onDelete,
}) {
  const [deletingPackId, setDeletingPackId] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  useEffect(() => {
    if (!confirmingDeleteId) return undefined;
    const t = setTimeout(() => setConfirmingDeleteId(null), 6000);
    return () => clearTimeout(t);
  }, [confirmingDeleteId]);

  async function handleDelete(pack) {
    setConfirmingDeleteId(null);
    setDeletingPackId(pack.id);
    try {
      await onDelete(pack);
    } finally {
      setDeletingPackId(null);
    }
  }

  return (
    <SectionCard
      title="Packs"
      accent="primary"
      count={packs.length}
      loading={loading}
      data-tutorial-id="studio-packs"
      bodyClassName="!gap-1.5"
    >
      {loading && packs.length === 0 && <SkeletonList count={3} rowHeight={36} />}
      {!loading && packs.length === 0 && (
        <div className="text-xs text-on-surface-variant/70">
          Brak paczek. Zaimportuj jedną po prawej.
        </div>
      )}
      {packs.map((p) => {
        const isDeleting = deletingPackId === p.id;
        const isConfirming = confirmingDeleteId === p.id;
        const active = p.id === selectedPackId;

        // Full-height left stripe says "state first" — the user reads the
        // colour before the label. Error red while arming a delete beats
        // a subtle border; primary cyan for the selected pack gives the
        // sidebar a quick anchor.
        const stripeCls = isConfirming
          ? 'bg-error'
          : active
            ? 'bg-primary'
            : 'bg-transparent group-hover:bg-primary/40';
        const rowCls = isConfirming
          ? 'bg-error/10 border-error/40'
          : active
            ? 'bg-primary/10 border-primary/30'
            : 'bg-surface-container/50 border-outline-variant/25 hover:border-primary/25';
        return (
          <div
            key={p.id}
            onClick={() => {
              if (isDeleting) return;
              if (isConfirming) { setConfirmingDeleteId(null); return; }
              onSelect(p.id);
            }}
            className={[
              'group relative pl-3 pr-2 py-2 rounded-sm flex items-center gap-2 border transition-colors',
              rowCls,
              isDeleting ? 'cursor-wait opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            <span
              className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm transition-colors ${stripeCls}`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate flex items-center gap-1.5 text-on-surface">
                {isDeleting && <Spinner size={12} />}
                {p.name}
              </div>
              {isConfirming ? (
                <div
                  className="text-[11px] text-error flex items-center gap-1 mt-0.5"
                  title="Skasuje wszystkie tilesety, kafle, reguły i autotile groups w tym packu. Operacja jest nieodwracalna."
                >
                  <span aria-hidden="true" className="text-xs leading-none">⚠</span>
                  <span>Usunąć nieodwracalnie?</span>
                </div>
              ) : (
                <div className="text-[11px] text-on-surface-variant/60">
                  proj {p.projectTilesize}px · {p.scaleAlgo}
                </div>
              )}
            </div>
            {isConfirming ? (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  disabled={isDeleting}
                  title="Tak, usuń pack (nieodwracalne)"
                  aria-label={`Potwierdź usunięcie packa ${p.name}`}
                  className="w-6 h-6 rounded-sm bg-error/80 border border-error text-on-error text-sm leading-none inline-flex items-center justify-center hover:bg-error"
                >
                  ✓
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(null); }}
                  title="Anuluj"
                  aria-label="Anuluj usuwanie"
                  className="w-6 h-6 rounded-sm bg-transparent border border-outline-variant/40 text-on-surface-variant text-sm leading-none inline-flex items-center justify-center hover:bg-surface-container-high/60"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(p.id); }}
                disabled={isDeleting}
                title={`Usuń pack "${p.name}"`}
                aria-label={`Usuń pack ${p.name}`}
                className="w-6 h-6 rounded-sm bg-transparent border border-outline-variant/30 text-on-surface-variant/70 text-sm leading-none shrink-0 hover:bg-error/80 hover:text-on-error hover:border-error transition-colors"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}
