export default function GlassCard({ children, className = '', glow = false, elevated = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`
        ${elevated ? 'glass-panel-elevated' : 'bg-surface-container-highest/60 backdrop-blur-2xl border border-outline-variant/10'}
        rounded-sm transition-all duration-300
        ${glow ? 'arcane-glow' : ''}
        ${onClick ? 'cursor-pointer hover:translate-y-[-2px] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-primary/20' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
