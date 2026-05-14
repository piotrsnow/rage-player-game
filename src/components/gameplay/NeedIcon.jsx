const MATERIAL_NEED_ICONS = {
  hunger: 'restaurant',
  thirst: 'water_drop',
  rest: 'bedtime',
};

function BladderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block h-[0.95em] w-[0.95em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 4.5h8v5h-8z" />
      <path d="M13.5 9.5h3.2c.8 0 1.4.6 1.4 1.4v2.4c0 2.7-2.2 4.9-4.9 4.9h-2.4a5.3 5.3 0 0 1-5.3-5.3V9.5h8z" />
      <path d="M10 18.2v1.9h5.5" />
      <path d="M4 6.5h1.5" />
    </svg>
  );
}

export default function NeedIcon({ needKey, icon, className = '' }) {
  const boxClassName = `inline-flex h-[1em] w-[1em] items-center justify-center leading-none ${className}`;

  if (needKey === 'bladder') {
    return (
      <span className={boxClassName}>
        <BladderIcon />
      </span>
    );
  }

  return (
    <span className={boxClassName}>
      <span className="material-symbols-outlined text-[1em] leading-none">
        {icon || MATERIAL_NEED_ICONS[needKey] || 'radio_button_unchecked'}
      </span>
    </span>
  );
}
