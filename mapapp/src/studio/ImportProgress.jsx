// ImportProgress — unified progress bar for Map Studio import/export flows.
//
// Handles five phases:
//   - 'upload'     → real byte progress from XHR (loaded/total)
//   - 'processing' → server is synchronously decoding PNG + writing tile rows.
//                    We don't get byte-level feedback, so we estimate elapsed
//                    against the empirical rate (~65 s per 3 MB of source PNG)
//                    and map it through an asymptotic curve so the bar keeps
//                    creeping but never hits 100% before the real response.
//   - 'zip-read'   → determinate: loaded/total = files unpacked from a ZIP
//   - 'post'       → determinate: loaded/total = post-import patch batches
//   - 'done'       → 100%
//
// The asymptotic formula: displayed = 100 * (1 - exp(-1.1 * p))
//   p=1 → ~67%, p=2 → ~89%, p=3 → ~96%.  Deliberately never 100% for p<∞.
//
// Usage:
//   <ImportProgress progress={{ phase:'upload', loaded, total, sourceBytes }} />

import React, { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner.jsx';

// Empirical rate: 3 MB of source PNG → ~65 s of backend work
// (sharp probe + prisma.tile.createMany for thousands of rows).
const PROCESSING_MS_PER_BYTE = 65_000 / (3 * 1024 * 1024);
const MIN_PROCESSING_MS = 3_000;

// Visual bar caps per phase — only 'done' is allowed to reach 100%.
// This prevents the "bar at 100% while the request is still running" glitch
// in phases where the semantic byte/count total is reached but there's still
// server-side work left to do (processing) or post-steps (metadata patches).
const PHASE_BAR_CAP = {
  upload: 85,
  processing: 95,
  'zip-read': 99,
  post: 99,
};

export function estimateProcessingMs(sourceBytes) {
  const bytes = Number.isFinite(sourceBytes) && sourceBytes > 0 ? sourceBytes : 0;
  return Math.max(MIN_PROCESSING_MS, bytes * PROCESSING_MS_PER_BYTE);
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function ImportProgress({ progress }) {
  const { phase, loaded = 0, total = 0, sourceBytes = 0, subLabel } = progress || {};

  // Track when the 'processing' phase started so we can drive an ETA curve.
  const processingStartRef = useRef(null);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  useEffect(() => {
    if (phase !== 'processing') {
      processingStartRef.current = null;
      setProcessingElapsedMs(0);
      return undefined;
    }
    if (processingStartRef.current == null) {
      processingStartRef.current = Date.now();
      setProcessingElapsedMs(0);
    }
    const id = setInterval(() => {
      setProcessingElapsedMs(Date.now() - (processingStartRef.current || Date.now()));
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  const estimatedMs = estimateProcessingMs(sourceBytes);
  const p = estimatedMs > 0 ? processingElapsedMs / estimatedMs : 0;

  // Raw semantic percent from loaded/total — used for labels (bytes/counts).
  const rawPct =
    total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;

  const uploadComplete =
    phase === 'upload' && total > 0 && loaded >= total;

  // During 'processing', interpret loaded/total as the bar *floor* — callers
  // that pre-scale an overall progress bar (e.g. ZIP import, where
  // processing occupies 85-95% of the overall bar) pass loaded=85, total=100;
  // the dropzone flow passes loaded=0 / total=100 so the curve runs from 0.
  // Cap is the ceiling the asymptotic curve approaches.
  const cap = PHASE_BAR_CAP[phase];
  const processingFloor =
    phase === 'processing' && rawPct != null ? rawPct : 0;
  const processingCeiling = Math.max(processingFloor, cap ?? 95);
  const processingRange = processingCeiling - processingFloor;
  const processingPct =
    processingFloor + processingRange * (1 - Math.exp(-1.1 * p));

  // Visual bar percent — per-phase cap keeps the bar honest:
  // only 'done' ever fills to 100%.
  const determinatePct =
    phase === 'done'
      ? 100
      : phase === 'upload' && rawPct != null
      ? Math.min(cap, rawPct)
      : phase === 'processing'
      ? processingPct
      : (phase === 'zip-read' || phase === 'post') && rawPct != null
      ? Math.min(cap, rawPct)
      : null;

  // Truly indeterminate only when we have no signal at all
  // (e.g. 'upload' before the first progress event).
  const isIndeterminate = determinatePct == null;

  const elapsedSec = Math.floor(processingElapsedMs / 1000);
  const etaSec = Math.max(0, Math.ceil((estimatedMs - processingElapsedMs) / 1000));
  const showEta = phase === 'processing' && p < 0.9 && sourceBytes > 0;

  // Default per-phase label; a caller-supplied subLabel replaces the default
  // for 'upload' / 'processing' (where loaded/total may be pre-scaled
  // percentages rather than real bytes, as in the ZIP import flow), and is
  // appended as an info suffix for determinate count-based phases.
  let label;
  if (phase === 'upload') {
    if (subLabel) {
      label = subLabel;
    } else if (uploadComplete) {
      label = `Upload complete (${formatBytes(total)}) — waiting for server…`;
    } else if (total > 0) {
      label = `Upload: ${rawPct}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
    } else {
      label = `Upload: ${formatBytes(loaded)}`;
    }
  } else if (phase === 'processing') {
    const base = 'Processing on server — decoding images, saving tiles…';
    const elapsedPart = showEta
      ? ` (${elapsedSec}s, ~${etaSec}s left)`
      : ` (${elapsedSec}s)`;
    label = subLabel ? `${subLabel}${elapsedPart}` : `${base}${elapsedPart}`;
  } else if (phase === 'zip-read') {
    const base = total > 0 ? `Reading ZIP: ${loaded}/${total}` : 'Reading ZIP…';
    label = subLabel ? `${base} · ${subLabel}` : base;
  } else if (phase === 'post') {
    const base = total > 0 ? `Finalizing: ${loaded}/${total}` : 'Finalizing…';
    label = subLabel ? `${base} · ${subLabel}` : base;
  } else if (phase === 'done') {
    label = 'Done.';
  } else {
    label = subLabel || '';
  }

  const barColorClass =
    phase === 'done'
      ? 'bg-tertiary'
      : phase === 'processing'
      ? 'bg-primary/90'
      : 'bg-primary';

  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 bg-surface-container-lowest border border-outline-variant/25 rounded-sm overflow-hidden relative">
        {isIndeterminate ? (
          <div
            className="h-full w-2/5 bg-gradient-to-r from-transparent via-primary to-transparent"
            style={{ animation: 'barShimmer 1.2s linear infinite' }}
          />
        ) : (
          <div
            className={`h-full transition-[width] duration-200 ${barColorClass}`}
            style={{ width: `${determinatePct ?? 0}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
        {(phase === 'processing' || phase === 'zip-read' || phase === 'post') && (
          <Spinner size={12} color="currentColor" />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
