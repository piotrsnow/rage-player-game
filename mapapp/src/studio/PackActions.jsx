// PackActions — Export / Import ZIP buttons + progress bars + tutorial
// launcher. Second card in the Studio sidebar. The tertiary accent says
// "actions applied to the selected pack" and echoes the editor's MapBar.
//
// Props:
//   selectedPackId       — disables Export when null
//   zipExportProgress    — object or null
//   zipImportProgress    — object or null
//   onExportZip()        — fires the download
//   onImportZip(file)    — fires the upload
//   onStartTutorial()    — starts the studio tutorial

import React from 'react';
import Button from '../ui/Button.jsx';
import ImportProgress from './ImportProgress.jsx';
import SectionCard from '../ui/SectionCard.jsx';

export default function PackActions({
  selectedPackId,
  zipExportProgress,
  zipImportProgress,
  onExportZip,
  onImportZip,
  onStartTutorial,
}) {
  return (
    <SectionCard title="Actions" accent="tertiary" bodyClassName="!gap-2">
      <div className="flex gap-1.5">
        <Button
          block
          onClick={onExportZip}
          disabled={!selectedPackId || !!zipExportProgress}
          title="Download the selected pack as a portable ZIP"
        >
          Export ZIP
        </Button>
        <label
          className={[
            'flex-1 px-2 py-1 rounded-sm border border-outline-variant/25 bg-surface-container/60',
            'text-on-surface-variant text-xs text-center transition-colors',
            zipImportProgress
              ? 'opacity-60 cursor-wait'
              : 'hover:text-on-surface hover:border-primary/30 cursor-pointer',
          ].join(' ')}
          title="Import a ZIP built by Export ZIP"
        >
          Import ZIP
          <input
            type="file"
            accept=".zip"
            hidden
            disabled={!!zipImportProgress}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImportZip(f);
            }}
          />
        </label>
      </div>

      {zipExportProgress && <ImportProgress progress={zipExportProgress} />}
      {zipImportProgress && <ImportProgress progress={zipImportProgress} />}

      <Button
        block
        onClick={onStartTutorial}
        title="Uruchom samouczek krok po kroku"
        aria-label="Uruchom samouczek"
      >
        Tutorial
      </Button>
    </SectionCard>
  );
}
