export default function GlassCard({ children, className = '', glow = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-surface-container-highest/60 backdrop-blur-2xl rounded-sm
        border border-outline-variant/10
        ${glow ? 'arcane-glow' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
