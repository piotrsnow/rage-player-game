export default function LoadingSpinner({ size = 'md', text }) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`${sizeClasses[size]} border-2 border-primary/20 border-t-primary rounded-full animate-spin`} />
      {text && (
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer">
          {text}
        </p>
      )}
    </div>
  );
}
