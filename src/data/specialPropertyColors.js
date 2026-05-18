const PALETTE = {
  fire:      { chip: 'bg-orange-500/15 border-orange-400/30 text-orange-200' },
  frost:     { chip: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200' },
  lightning: { chip: 'bg-yellow-500/15 border-yellow-400/30 text-yellow-200' },
  poison:    { chip: 'bg-green-500/15 border-green-400/30 text-green-300' },
  arcane:    { chip: 'bg-purple-500/15 border-purple-400/30 text-purple-200' },
  shadow:    { chip: 'bg-slate-500/15 border-slate-400/30 text-slate-300' },
  holy:      { chip: 'bg-amber-500/15 border-amber-400/30 text-amber-200' },
  nature:    { chip: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200' },
  blood:     { chip: 'bg-red-500/15 border-red-400/30 text-red-200' },
  physical:  { chip: 'bg-gray-500/15 border-gray-400/30 text-gray-300' },
  neutral:   { chip: 'bg-tertiary/10 border-tertiary/20 text-tertiary/90' },
};

export function getSpecialPropertyChipClass(color) {
  return (PALETTE[color] || PALETTE.neutral).chip;
}
