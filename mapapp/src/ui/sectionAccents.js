// Section accent tokens — one row per "color identity" used by a sidebar
// section / panel / nav tab. The goal is that every dense sidebar (CharGen
// slots, Editor layers, Studio packs) gives the user a quick *spatial*
// cue: "I'm in the Actors card (emerald)", "I'm in the Packs card
// (indigo)" — without having to read the headings.
//
// Mapping conventions (see plan doc for the full rationale):
//   • `primary` / `tertiary` — reserved for UI states (selected rows,
//     CTAs, warnings). Do NOT reuse them for section identity; we want
//     the user to associate primary = Save, tertiary = tutorial/map
//     meta, independently of where the button lives.
//   • `emerald|sky|rose|amber|indigo|orange|violet|fuchsia` — section
//     identities. They share the same `*-300` text / `*-500/30` border
//     shade so the overall page doesn't feel rainbow-y; the hue is only
//     enough to tell cards apart at a glance.
//
// Every token value is a *literal* Tailwind class string because Tailwind's
// purger can only see classes that appear verbatim in source. If you ever
// need a new accent (e.g. `teal`), add a full row here — don't try to
// interpolate `${color}-500` anywhere in the app.
//
// Tokens per accent:
//   stripe         — left stripe / dot fill (solid color, 3px)
//   title          — section heading text
//   dim            — muted text (same hue, lower opacity) — hints / counts
//   border         — card border (bg-{hue}-500/30 style)
//   softBg         — hover glow / selected-row tint
//   glow           — box-shadow for the card (hover / selected)
//   chipActiveBg   — fill for active chip in this accent
//   outlineText    — ring-color helper for focus outlines
//
// Consumed by: SectionCard, Chip (accent prop), Checkbox, IconButton
// variants, and the colored layer indicators inside LayersPanel.

export const SECTION_ACCENTS = {
  primary: {
    stripe: 'bg-primary',
    title: 'text-primary',
    dim: 'text-primary/60',
    border: 'border-primary/30',
    softBg: 'bg-primary/10',
    glow: 'shadow-[0_0_14px_rgba(197,154,255,0.25)]',
    chipActiveBg: 'bg-primary/20',
    outlineText: 'ring-primary/40',
  },
  tertiary: {
    stripe: 'bg-tertiary-dim',
    title: 'text-tertiary-dim',
    dim: 'text-tertiary-dim/60',
    border: 'border-tertiary-dim/30',
    softBg: 'bg-tertiary-dim/10',
    glow: 'shadow-[0_0_14px_rgba(238,209,152,0.25)]',
    chipActiveBg: 'bg-tertiary-dim/20',
    outlineText: 'ring-tertiary-dim/40',
  },
  emerald: {
    stripe: 'bg-emerald-500',
    title: 'text-emerald-300',
    dim: 'text-emerald-300/60',
    border: 'border-emerald-500/30',
    softBg: 'bg-emerald-500/10',
    glow: 'shadow-[0_0_14px_rgba(16,185,129,0.25)]',
    chipActiveBg: 'bg-emerald-500/20',
    outlineText: 'ring-emerald-500/40',
  },
  sky: {
    stripe: 'bg-sky-500',
    title: 'text-sky-300',
    dim: 'text-sky-300/60',
    border: 'border-sky-500/30',
    softBg: 'bg-sky-500/10',
    glow: 'shadow-[0_0_14px_rgba(14,165,233,0.25)]',
    chipActiveBg: 'bg-sky-500/20',
    outlineText: 'ring-sky-500/40',
  },
  rose: {
    stripe: 'bg-rose-500',
    title: 'text-rose-300',
    dim: 'text-rose-300/60',
    border: 'border-rose-500/30',
    softBg: 'bg-rose-500/10',
    glow: 'shadow-[0_0_14px_rgba(244,63,94,0.25)]',
    chipActiveBg: 'bg-rose-500/20',
    outlineText: 'ring-rose-500/40',
  },
  amber: {
    stripe: 'bg-amber-500',
    title: 'text-amber-300',
    dim: 'text-amber-300/60',
    border: 'border-amber-500/30',
    softBg: 'bg-amber-500/10',
    glow: 'shadow-[0_0_14px_rgba(245,158,11,0.25)]',
    chipActiveBg: 'bg-amber-500/20',
    outlineText: 'ring-amber-500/40',
  },
  indigo: {
    stripe: 'bg-indigo-500',
    title: 'text-indigo-300',
    dim: 'text-indigo-300/60',
    border: 'border-indigo-500/30',
    softBg: 'bg-indigo-500/10',
    glow: 'shadow-[0_0_14px_rgba(99,102,241,0.25)]',
    chipActiveBg: 'bg-indigo-500/20',
    outlineText: 'ring-indigo-500/40',
  },
  orange: {
    stripe: 'bg-orange-500',
    title: 'text-orange-300',
    dim: 'text-orange-300/60',
    border: 'border-orange-500/30',
    softBg: 'bg-orange-500/10',
    glow: 'shadow-[0_0_14px_rgba(249,115,22,0.25)]',
    chipActiveBg: 'bg-orange-500/20',
    outlineText: 'ring-orange-500/40',
  },
  violet: {
    stripe: 'bg-violet-500',
    title: 'text-violet-300',
    dim: 'text-violet-300/60',
    border: 'border-violet-500/30',
    softBg: 'bg-violet-500/10',
    glow: 'shadow-[0_0_14px_rgba(139,92,246,0.25)]',
    chipActiveBg: 'bg-violet-500/20',
    outlineText: 'ring-violet-500/40',
  },
  fuchsia: {
    stripe: 'bg-fuchsia-500',
    title: 'text-fuchsia-300',
    dim: 'text-fuchsia-300/60',
    border: 'border-fuchsia-500/30',
    softBg: 'bg-fuchsia-500/10',
    glow: 'shadow-[0_0_14px_rgba(217,70,239,0.25)]',
    chipActiveBg: 'bg-fuchsia-500/20',
    outlineText: 'ring-fuchsia-500/40',
  },
};

// Helper: return a token bundle. Falls through to `primary` if the accent
// name is unknown — no caller ever renders a blank section.
export function getAccent(accent) {
  return SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary;
}
