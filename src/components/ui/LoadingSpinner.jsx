export default function LoadingSpinner({ size = 'md', text }) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const innerSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-5 h-5',
    lg: 'w-8 h-8',
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`${sizeClasses[size]} relative`}>
        <div className={`${sizeClasses[size]} absolute inset-0 border-2 border-primary/20 border-t-primary rounded-full animate-spin`}
          style={{ filter: 'drop-shadow(0 0 4px rgba(197, 154, 255, 0.4))' }}
        />
        <div
          className={`${innerSizeClasses[size]} absolute inset-0 m-auto border-2 border-tertiary/15 border-b-tertiary rounded-full`}
          style={{ animation: 'spinReverse 1.2s linear infinite' }}
        />
      </div>
      {text && (
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer">
          {text}
        </p>
      )}
    </div>
  );
}
