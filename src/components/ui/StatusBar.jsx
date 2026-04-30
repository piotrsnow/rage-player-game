const DYNAMIC_ANCHORS = {
  low: [215, 51, 87],
  mid: [197, 154, 255],
  high: [238, 209, 152],
};

function interpolate(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function getDynamicColor(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 50) {
    return interpolate(DYNAMIC_ANCHORS.low, DYNAMIC_ANCHORS.mid, clamped / 50);
  }
  return interpolate(DYNAMIC_ANCHORS.mid, DYNAMIC_ANCHORS.high, (clamped - 50) / 50);
}

const toRgb = ([r, g, b], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;
const darken = ([r, g, b], factor = 0.55) => [
  Math.round(r * factor),
  Math.round(g * factor),
  Math.round(b * factor),
];

export default function StatusBar({ label, current, max, color = 'primary' }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;

  const barColors = {
    primary: 'from-primary-dim to-primary shadow-[0_0_8px_rgba(197,154,255,0.5)]',
    error: 'from-error-container to-error-dim',
    tertiary: 'from-on-tertiary-container to-tertiary-dim',
    blue: 'from-blue-700 to-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]',
  };

  const textColors = {
    primary: 'text-primary',
    error: 'text-error',
    tertiary: 'text-tertiary-dim',
    blue: 'text-blue-400',
  };

  const isDynamic = color === 'dynamic';
  const dynamicRgb = isDynamic ? getDynamicColor(pct) : null;
  const dynamicFillStyle = isDynamic
    ? {
        width: `${pct}%`,
        backgroundImage: `linear-gradient(to right, ${toRgb(darken(dynamicRgb))}, ${toRgb(dynamicRgb)})`,
        boxShadow: `0 0 8px ${toRgb(dynamicRgb, 0.45)}`,
      }
    : { width: `${pct}%` };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
        <span>{label}</span>
        <span
          className={isDynamic ? undefined : textColors[color]}
          style={isDynamic ? { color: toRgb(dynamicRgb) } : undefined}
        >
          {current}/{max}
        </span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-highest overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden ${
            isDynamic ? '' : `bg-gradient-to-r ${barColors[color]}`
          }`}
          style={dynamicFillStyle}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            style={{ animation: 'barShimmer 2s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  );
}
