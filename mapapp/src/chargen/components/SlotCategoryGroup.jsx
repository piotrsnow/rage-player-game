// SlotCategoryGroup — one SectionCard per SLOT_CATEGORIES entry.
//
// Before: the slot grid was a flat `repeat(auto-fill, minmax(260px, 1fr))`
// of ~25 identical tiles. Ears sat next to Pants next to Wings, and the
// user had to read every tile's title to know what they were looking at.
//
// After: seven colour-coded cards ("Body", "Hair / Face", "Features",
// "Clothing", "Headgear", "Equipment", "Add-ons"), each collapsible and
// tinted from `SECTION_ACCENTS`. The body of each card is an inner
// `repeat(auto-fill, minmax(220px, 1fr))` grid of SlotEditors.
//
// Hide rule: if no slot inside the category is visible for the current
// config (e.g. a minotaur-only body ignoring all `hat`), the whole card
// collapses out. This avoids rendering an empty "Headgear" box.

import React, { useMemo } from 'react';
import SectionCard from '../../ui/SectionCard.jsx';
import SlotEditor from './SlotEditor.jsx';

const CHARACTER_SLOTS = new Set([
  'shadow', 'body', 'head', 'ears', 'nose', 'eyes', 'facial', 'hair',
  'tail', 'wings', 'add1', 'add2', 'add3',
]);

export default function SlotCategoryGroup({
  category,
  config,
  manifest,
  appearance,
  cm,
  collapsed,
  onToggle,
  onSetSlot,
  onSetColor,
  onRandomizeSlot,
}) {
  const visibleSlots = useMemo(() => {
    return category.slots.filter((slot) => {
      const allowed = Array.isArray(config?.[slot]) ? config[slot] : null;
      if (CHARACTER_SLOTS.has(slot) && !allowed) return false;
      return true;
    });
  }, [category.slots, config]);

  const filledCount = useMemo(() => {
    return visibleSlots.reduce((n, slot) => {
      const id = appearance?.slots?.[slot]?.id;
      return id && id !== 'none' ? n + 1 : n;
    }, 0);
  }, [appearance, visibleSlots]);

  if (visibleSlots.length === 0) return null;

  return (
    <SectionCard
      title={category.label}
      accent={category.accent}
      collapsible
      collapsed={!!collapsed}
      onToggle={() => onToggle?.()}
      headerRight={
        <span className="text-[10px] text-on-surface-variant/60">
          {filledCount}/{visibleSlots.length}
        </span>
      }
      bodyClassName="!gap-2"
    >
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {visibleSlots.map((slot) => (
          <SlotEditor
            key={slot}
            slot={slot}
            accent={category.accent}
            config={config}
            manifest={manifest}
            appearance={appearance}
            cm={cm}
            onSetSlot={(key) => onSetSlot(slot, key)}
            onSetColor={(cid) => onSetColor(slot, cid)}
            onRandomize={() => onRandomizeSlot(slot)}
          />
        ))}
      </div>
    </SectionCard>
  );
}
