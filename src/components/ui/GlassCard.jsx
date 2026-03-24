export default function GlassCard({ children, className = '', glow = false, elevated = false, onClick }) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      className={`
        ${elevated ? 'glass-panel-elevated' : 'bg-surface-container-highest/60 backdrop-blur-2xl border border-outline-variant/10'}
        rounded-sm transition-all duration-300
        ${glow ? 'arcane-glow' : ''}
        ${interactive ? 'cursor-pointer hover:translate-y-[-2px] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-primary/20' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
