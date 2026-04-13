export default function Toggle({ checked, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
        checked ? 'bg-primary-dim/20 border-primary/30' : 'bg-surface-container-highest border-outline-variant/30'
      }`}
    >
      <div
        className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
          checked
            ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
            : 'left-1 bg-on-surface-variant'
        }`}
      />
    </button>
  );
}
