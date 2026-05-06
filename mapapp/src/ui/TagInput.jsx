// TagInput — chips + input row with Enter/comma to add, × to remove.
//
// Replaces three near-identical implementations:
//   CharGenPage.jsx     → actor tags (tagInput state + addTag/removeTag)
//   TileInspector.jsx   → free tile tags
//   NpcPlaceInspector.jsx → required NPC tags
//
// Props:
//   tags         — string[]
//   onChange(next) — called with the next tags array
//   placeholder  — input placeholder
//   lowercase    — normalise added tags to lower-case (default true —
//                  CharGen / NPC filter behaviour). Tile free tags in
//                  Studio set `lowercase={false}` to preserve caps.
//   accent       — colour for chips (picks up the enclosing section's
//                  accent; default `primary` keeps the historical look).
//   className    — wrapper classes (flex / wrap / gap handled inside).
//
// Keyboard: Enter or comma commits the draft; Backspace on empty input
// pops the last tag (matches web-native chip inputs).

import React, { useState } from 'react';
import { Input } from './Input.jsx';
import Chip from './Chip.jsx';

export default function TagInput({
  tags,
  onChange,
  placeholder = 'add tag…',
  lowercase = true,
  accent,
  inputWidth = 140,
  disabled = false,
  'data-tutorial-id': tutorialId,
  className = '',
}) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(tags) ? tags : [];

  function commit() {
    let t = draft.trim();
    if (!t) return;
    if (lowercase) t = t.toLowerCase();
    if (list.includes(t)) { setDraft(''); return; }
    onChange?.([...list, t]);
    setDraft('');
  }

  function remove(t) {
    onChange?.(list.filter((x) => x !== t));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Backspace' && !draft && list.length) {
      e.preventDefault();
      onChange?.(list.slice(0, -1));
    }
  }

  return (
    <div
      className={`flex gap-1 flex-wrap items-center ${className}`}
      data-tutorial-id={tutorialId}
    >
      {list.map((t) => (
        <Chip key={t} accent={accent} onClose={() => remove(t)}>{t}</Chip>
      ))}
      <Input
        size="sm"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        style={{ width: inputWidth }}
        className="!w-auto"
      />
    </div>
  );
}
