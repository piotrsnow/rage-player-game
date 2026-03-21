export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) {
  const base = 'font-bold uppercase tracking-widest rounded-sm transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2';

  const variants = {
    primary:
      'bg-gradient-to-tr from-primary-dim to-primary text-on-primary shadow-[0_0_30px_rgba(197,154,255,0.4)] hover:shadow-[0_0_50px_rgba(197,154,255,0.6)] hover:scale-105',
    secondary:
      'bg-surface-container-highest/80 backdrop-blur-xl border border-tertiary/20 text-tertiary hover:border-tertiary/50 hover:bg-surface-container-highest',
    ghost:
      'bg-transparent border border-outline-variant/30 text-on-surface-variant hover:border-on-surface hover:text-on-surface',
    danger:
      'bg-error-container text-on-error-container hover:brightness-110',
  };

  const sizes = {
    sm: 'px-4 py-2 text-[10px]',
    md: 'px-8 py-3 text-xs',
    lg: 'px-10 py-4 text-xl font-headline',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
