import { useTranslation } from 'react-i18next';

const btnBase = 'min-w-0 overflow-hidden px-4 py-3 rounded-sm font-label text-sm border disabled:opacity-50 disabled:cursor-not-allowed';
const btnActive = 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]';
const btnInactive = 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20';

export default function ModeToggle({ mode, onModeChange, inMpRoom, isBackendConnected, livingWorldEnabled, onLivingWorldClick }) {
  const { t } = useTranslation();

  const modeBtn = (id, icon, label, onClick, isDisabled, title) => {
    const isActive = mode === id;
    return (
      <button
        onClick={onClick}
        disabled={isDisabled}
        title={!isActive ? (title || label) : undefined}
        style={{
          flex: isActive ? '2 1 0%' : '1 1 0%',
          transition: 'flex 300ms ease, background-color 300ms, color 300ms, border-color 300ms, box-shadow 300ms, opacity 300ms',
        }}
        className={`${btnBase} ${isActive ? btnActive : btnInactive}`}
      >
        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
          <span className="material-symbols-outlined text-lg shrink-0">{icon}</span>
          {isActive && <span className="font-bold">{label}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <section>
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
          {t('creator.modeLabel', 'Mode')}
        </label>
        <div className="flex gap-3">
          {modeBtn('solo', 'person', t('multiplayer.solo'), () => !inMpRoom && onModeChange('solo'), inMpRoom)}
          {modeBtn('multiplayer', 'group', t('multiplayer.multiplayer'), () => onModeChange('multiplayer'), !isBackendConnected, t('multiplayer.backendRequired'))}
        </div>
      </section>

      <section className="md:col-start-3">
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
          Living World
        </label>
        <div className="flex gap-3">
          <button
            onClick={onLivingWorldClick}
            style={{
              flex: livingWorldEnabled ? '2 1 0%' : '1 1 0%',
              transition: 'flex 300ms ease, background-color 300ms, color 300ms, border-color 300ms, box-shadow 300ms, opacity 300ms',
            }}
            className={`${btnBase} ${livingWorldEnabled ? btnActive : btnInactive}`}
          >
            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
              <span className="material-symbols-outlined text-lg shrink-0">public</span>
              {livingWorldEnabled && <span className="font-bold">Living World</span>}
            </div>
          </button>
          <button
            disabled
            title="Dead World"
            style={{
              flex: '1 1 0%',
              transition: 'flex 300ms ease, background-color 300ms, color 300ms, border-color 300ms, box-shadow 300ms, opacity 300ms',
            }}
            className={`${btnBase} bg-surface-container-high/20 text-on-surface-variant/50 border-outline-variant/20 cursor-default opacity-60`}
          >
            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
              <span className="material-symbols-outlined text-lg shrink-0">public_off</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
