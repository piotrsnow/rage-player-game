// SlotEditor — one LPC slot row (select + randomize + color swatches).
//
// Visual state cues:
//   - When a slot holds a real item (`id !== 'none'`), its border picks
//     up the enclosing category's accent colour and a small dot appears
//     in the header. Empty slots stay neutral. Result: at a glance the
//     user sees "4 clothing pieces filled, 0 equipment, 2 add-ons" from
//     the colour distribution alone.
//   - The 🎲 per-slot randomizer is an IconButton with `ghost` variant.
//
// Slot search:
//   - If the slot has >10 options (hair, body, shirt, pants, hat, …),
//     an extra size="sm" search input appears above the <Select> and
//     filters the dropdown client-side. Small slots (tail, mask) render
//     without the search to avoid clutter.

import React, { useMemo, useState } from 'react';
import { Select, Input } from '../../ui/Input.jsx';
import IconButton from '../../ui/IconButton.jsx';
import { SECTION_ACCENTS } from '../../ui/sectionAccents.js';
import ColorSwatchButton from './ColorSwatchButton.jsx';

const SLOT_LABELS = {
  shadow: 'Shadow', body: 'Body', head: 'Head', ears: 'Ears', nose: 'Nose',
  eyes: 'Eyes', facial: 'Facial', hair: 'Hair', tail: 'Tail', wings: 'Wings',
  shirt: 'Shirt', pants: 'Pants', belt: 'Belt', shoes: 'Shoes',
  gloves: 'Gloves', jacket: 'Jacket', suit: 'Suit', mask: 'Mask',
  hat: 'Hat', glasses: 'Glasses', back: 'Back', offhand: 'Off-hand',
  mainhand: 'Main hand', ammo: 'Ammo', add1: 'Add 1', add2: 'Add 2', add3: 'Add 3',
};

const CHARACTER_SLOTS = new Set([
  'shadow', 'body', 'head', 'ears', 'nose', 'eyes', 'facial', 'hair',
  'tail', 'wings', 'add1', 'add2', 'add3',
]);

const SEARCH_THRESHOLD = 10;

export default function SlotEditor({
  slot,
  accent = 'primary',
  config,
  manifest,
  appearance,
  cm,
  onSetSlot,
  onSetColor,
  onRandomize,
}) {
  const entry = appearance.slots[slot];
  const allowed = Array.isArray(config?.[slot]) ? config[slot] : null;
  const isCharacterSlot = CHARACTER_SLOTS.has(slot);
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const cat = manifest.categories[slot];
    if (!cat) return [];
    const result = [{ key: 'none', label: '— none —' }];
    const seen = new Set(['none']);
    const raceGroupHint = config?.body?.[0] || appearance.race;
    const hints = Array.from(new Set([appearance.race, raceGroupHint, 'human', 'human_alt']));
    if (allowed) {
      for (const id of allowed) {
        if (cat.items[id] && !seen.has(id)) {
          seen.add(id);
          result.push({ key: id, label: cat.items[id].name || id });
        }
        for (const hint of hints) {
          const key = `${hint}/${id}`;
          if (cat.items[key] && !seen.has(key)) {
            seen.add(key);
            const label = cat.items[key].name || id;
            result.push({ key, label: hints[0] === hint ? label : `${label} (${hint})` });
          }
        }
      }
    } else {
      const sorted = Object.entries(cat.items).sort(
        (a, b) => String(a[1].name || a[0]).localeCompare(String(b[1].name || b[0])),
      );
      for (const [k, item] of sorted) {
        if (seen.has(k)) continue;
        seen.add(k);
        result.push({ key: k, label: item.name || k });
      }
    }
    return result;
  }, [slot, config, manifest, appearance.race, allowed]);

  if (isCharacterSlot && !allowed) return null;

  const showSearch = options.length > SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();
  const filteredOptions = !q
    ? options
    : options.filter((o) => (
      o.key === 'none'
      || o.label.toLowerCase().includes(q)
      || o.key.toLowerCase().includes(q)
    ));

  const currentItem = entry?.id && entry.id !== 'none'
    ? manifest.categories[slot]?.items[entry.id]
    : null;
  const colors = useMemo(() => {
    if (!currentItem) return [];
    const pc = currentItem.primarycolors || [];
    const fc = currentItem.fixedcolors || [];
    return [...pc, ...fc];
  }, [currentItem]);

  const filled = !!(entry?.id && entry.id !== 'none');
  const tokens = SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary;
  const wrapperClass = [
    'glass-panel rounded-sm p-2.5 transition-colors',
    filled ? `border ${tokens.border}` : 'border border-outline-variant/15',
  ].join(' ');

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {filled && (
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${tokens.stripe}`}
            aria-hidden="true"
          />
        )}
        <strong className="text-sm text-on-surface">{SLOT_LABELS[slot] || slot}</strong>
        <span className="text-[10px] text-on-surface-variant/50 truncate" title={entry?.id || 'none'}>
          {entry?.id || 'none'}
        </span>
        <IconButton
          size={22}
          variant="ghost"
          onClick={onRandomize}
          title={`Randomize ${SLOT_LABELS[slot] || slot}`}
          aria-label={`Randomize ${SLOT_LABELS[slot] || slot}`}
          className="ml-auto"
        >
          🎲
        </IconButton>
      </div>

      {showSearch && (
        <Input
          size="sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Szukaj… (${options.length - 1})`}
          className="mb-1"
        />
      )}

      <Select
        size="sm"
        value={entry?.id || 'none'}
        onChange={(e) => onSetSlot(e.target.value)}
        className="mb-1.5"
      >
        {filteredOptions.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </Select>

      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {colors.map((cid) => (
            <ColorSwatchButton
              key={cid}
              cm={cm}
              colorId={cid}
              selected={entry?.color === cid}
              onClick={() => onSetColor(cid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
