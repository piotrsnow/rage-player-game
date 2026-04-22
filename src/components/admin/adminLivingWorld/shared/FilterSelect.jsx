export default function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-on-surface-variant">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 bg-surface-container rounded-sm border border-outline-variant/25 text-on-surface"
      >
        {options.map(([val, labelText]) => (
          <option key={val || 'any'} value={val}>{labelText}</option>
        ))}
      </select>
    </label>
  );
}
