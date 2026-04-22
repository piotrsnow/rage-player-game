// Inline atoms used across admin tabs — grouped in one file because each is
// ~5 lines and they're always used together.

export function KV({ k, v }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] uppercase tracking-widest text-on-surface-variant shrink-0">{k}</span>
      <span className="font-mono text-[10px] text-on-surface break-all">{String(v)}</span>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div className="mt-3">
      <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">{title}</div>
      {children}
    </div>
  );
}

export function Empty() {
  return <div className="text-[10px] text-on-surface-variant italic">nothing</div>;
}
