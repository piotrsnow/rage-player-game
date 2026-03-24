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
      'bg-gradient-to-tr from-primary-dim to-primary text-on-primary shadow-[0_0_30px_rgba(197,154,255,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(197,154,255,0.6),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 hover:brightness-110',
    secondary:
      'bg-surface-container-highest/80 backdrop-blur-xl border border-tertiary/20 text-tertiary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-tertiary/50 hover:bg-surface-container-highest hover:shadow-[0_0_20px_rgba(255,239,213,0.1),inset_0_1px_0_rgba(255,255,255,0.06)]',
    ghost:
      'bg-transparent border border-outline-variant/30 text-on-surface-variant hover:border-on-surface hover:text-on-surface hover:bg-surface-container-high/30',
    danger:
      'bg-error-container text-on-error-container shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:brightness-110',
    icon:
      'bg-transparent text-on-surface-variant hover:text-primary hover:bg-surface-container-high/50 rounded-full !p-0',
  };

  const sizes = {
    sm: 'px-4 py-2 text-[10px]',
    md: 'px-8 py-3 text-xs',
    lg: 'px-10 py-4 text-xl font-headline',
    icon: 'w-9 h-9 text-base',
  };

  const resolvedSize = variant === 'icon' ? (sizes[size] || sizes.icon) : sizes[size];

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${resolvedSize} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
