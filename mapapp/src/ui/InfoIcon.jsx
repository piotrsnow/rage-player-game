// InfoIcon — tiny "i" bubble that reveals a Tooltip on hover/focus.
//
// Used next to section headings to explain what a closed-enum like
// "Atomy", "Traity" or "Layout" means, without forcing the user to
// read a separate docs page.
//
// Usage:
//   <InfoIcon content={<div>...explainer...</div>} />

import React from 'react';
import Tooltip from './Tooltip.jsx';

export default function InfoIcon({ content, size = 14, className = '', ariaLabel = 'Informacja' }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-center rounded-full border border-outline-variant/40 text-on-surface-variant/80 hover:text-on-surface hover:border-primary/50 bg-surface-container/40 cursor-help transition-colors duration-150 ${className}`}
        style={{ width: size, height: size, padding: 0, fontSize: Math.max(9, size - 5), lineHeight: 1 }}
      >
        <span aria-hidden="true" className="font-bold italic select-none">i</span>
      </button>
    </Tooltip>
  );
}
