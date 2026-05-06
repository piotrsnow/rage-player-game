// Tiny inline spinner for loading states.
//
// Usage:
//   <Spinner />                       → 14px default
//   <Spinner size={20} />              → bigger
//   <Spinner label="Loading tiles…" /> → spinner + text (used in rows/buttons)
//
// Uses Tailwind's built-in `animate-spin`. Colour defaults to `currentColor`
// so the caller controls it via CSS (text-*). Accent colour is exposed via
// `color="primary"` / `color="tertiary"` shortcuts for the common cases.

import React from 'react';

const COLOR_MAP = {
  primary: 'text-primary',
  tertiary: 'text-tertiary',
  currentColor: '',
};

export default function Spinner({ size = 14, color = 'primary', label, className = '', style }) {
  const colorClass = COLOR_MAP[color] ?? '';
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block align-middle shrink-0 animate-spin ${colorClass}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
  if (!label) return svg;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} style={style}>
      {svg}
      <span className="text-xs text-on-surface-variant">{label}</span>
    </span>
  );
}

/**
 * Skeleton row — grey shimmer placeholder for lists that are still loading.
 */
export function SkeletonRow({ height = 22, width = '100%', className = '', style }) {
  return (
    <div
      className={`rounded-sm bg-surface-container-high/40 animate-pulse ${className}`}
      style={{ height, width, ...style }}
    />
  );
}

/**
 * Skeleton list — N rows stacked with a small gap.
 */
export function SkeletonList({ count = 3, rowHeight = 22, gap = 4, className = '', style }) {
  return (
    <div className={`flex flex-col ${className}`} style={{ gap, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} height={rowHeight} />
      ))}
    </div>
  );
}
