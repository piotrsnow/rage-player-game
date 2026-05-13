export default function MasonryGrid({ children, className = '' }) {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-[200px] sm:auto-rows-[220px] lg:auto-rows-[240px] gap-3 sm:gap-4 ${className}`}
      style={{ gridAutoFlow: 'dense' }}
    >
      {children}
    </div>
  );
}
