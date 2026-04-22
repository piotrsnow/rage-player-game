export default function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-sm border border-outline-variant/25 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/25 sticky top-0 bg-surface">
          <h2 className="text-sm font-bold text-on-surface">{title || 'Detail'}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
