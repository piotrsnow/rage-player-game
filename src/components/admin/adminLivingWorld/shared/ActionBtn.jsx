export default function ActionBtn({ children, disabled, onClick, danger }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border disabled:opacity-40 ${
        danger
          ? 'border-error/30 text-error hover:bg-error/10'
          : 'border-tertiary/30 text-tertiary hover:bg-tertiary/10'
      }`}
    >
      {children}
    </button>
  );
}
