// RaceConfigPicker — the two dropdowns that pick race + config.
//
// Extracted from CharGenPage#349-370. Kept its own component because:
//   1. It's a self-contained atomic unit of UX (change race → refills
//      config options → triggers random body).
//   2. It sits above the slot grid and now lives inside a SectionCard
//      with `fuchsia` accent to flag that this is the fantasy-identity
//      choice — a different kind of knob from the gear slots below.
//
// Props:
//   manifest        — full manifest (for race enum + configs)
//   appearance      — current appearance (race + config ids)
//   currentRace     — resolved race row (so the caller doesn't have to
//                     look it up twice)
//   onSetRace       — commit a race id
//   onSetConfig     — commit a config id

import React from 'react';
import { Select } from '../../ui/Input.jsx';
import SectionCard from '../../ui/SectionCard.jsx';

export default function RaceConfigPicker({ manifest, appearance, currentRace, onSetRace, onSetConfig }) {
  if (!manifest || !appearance || !currentRace) return null;
  return (
    <SectionCard title="Identity" accent="fuchsia" bodyClassName="!flex-row !flex-wrap !gap-2.5">
      <label className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <span className="w-10 shrink-0">Race</span>
        <Select
          value={appearance.race}
          onChange={(e) => onSetRace(e.target.value)}
          className="!w-[180px]"
          data-tutorial-id="chargen-race"
        >
          {Object.entries(manifest.races).map(([id, race]) => (
            <option key={id} value={id}>{race.name}</option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <span className="w-14 shrink-0">Config</span>
        <Select
          value={appearance.config}
          onChange={(e) => onSetConfig(e.target.value)}
          className="!w-[200px]"
        >
          {currentRace.configs.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
          ))}
        </Select>
      </label>
    </SectionCard>
  );
}
