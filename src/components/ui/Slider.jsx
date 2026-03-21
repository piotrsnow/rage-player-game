export default function Slider({ label, description, value, onChange, min = 0, max = 100, displayValue }) {
  return (
    <div className="mb-10 group">
      <div className="flex justify-between items-end mb-4">
        <div>
          <label className="block font-headline text-on-surface text-lg">{label}</label>
          {description && (
            <span className="text-on-surface-variant text-xs font-label">{description}</span>
          )}
        </div>
        <span className="text-primary font-bold text-sm tracking-widest">
          {displayValue ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
      />
    </div>
  );
}
