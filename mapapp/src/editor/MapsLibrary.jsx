// MapsLibrary — list of saved MapDocs with load-into-editor buttons.
//
// Extracted from EditorPage's bottom-of-sidebar block. A single row is
// a <Button> list item; the `active` variant highlights the currently
// loaded map. While any map is loading, all rows are disabled so the
// user can't race the palette builder by clicking a second map.

import React from 'react';
import Button from '../ui/Button.jsx';
import SectionCard from '../ui/SectionCard.jsx';
import Spinner, { SkeletonList } from '../ui/Spinner.jsx';

export default function MapsLibrary({
  maps,
  mapId,
  loadingMapId,
  initialLoad,
  onLoad,
}) {
  return (
    <SectionCard
      title="Saved maps"
      accent="primary"
      count={maps.length}
    >
      {initialLoad && <SkeletonList count={3} rowHeight={28} />}
      {!initialLoad && maps.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/50">
          No saved maps.
        </div>
      )}
      <div className="flex flex-col gap-1">
        {maps.map((m) => {
          const isLoading = loadingMapId === m.id;
          const disabled = !!loadingMapId;
          return (
            <Button
              key={m.id}
              block
              active={m.id === mapId}
              onClick={() => onLoad(m.id)}
              disabled={disabled}
              className={[
                'justify-start text-left',
                disabled ? 'cursor-wait' : '',
                disabled && !isLoading ? 'opacity-50' : '',
              ].join(' ')}
            >
              {isLoading && <Spinner size={12} color="currentColor" />}
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {m.name}
                <span className="opacity-50 ml-1.5">
                  {Array.isArray(m.size) ? `${m.size[0]}×${m.size[1]}` : ''}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </SectionCard>
  );
}
