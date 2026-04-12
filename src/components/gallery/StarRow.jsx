import { iconFill, iconOutline } from './galleryHelpers';

export default function StarRow({ rating, max = 5, className = '' }) {
  const full = Math.floor(Math.min(rating, max));
  const half = rating - full >= 0.5 && full < max;
  const empty = max - full - (half ? 1 : 0);
  return (
    <div className={`flex items-center gap-0.5 text-primary ${className}`} aria-label={`${rating} / ${max}`}>
      {Array.from({ length: full }, (_, i) => (
        <span key={`f-${i}`} className="material-symbols-outlined text-[18px]" style={iconFill}>
          star
        </span>
      ))}
      {half && (
        <span className="material-symbols-outlined text-[18px] text-primary" style={iconFill}>
          star_half
        </span>
      )}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e-${i}`} className="material-symbols-outlined text-[18px] text-outline-variant" style={iconOutline}>
          star
        </span>
      ))}
    </div>
  );
}
