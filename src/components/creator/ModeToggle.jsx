import { useTranslation } from 'react-i18next';

export default function ModeToggle({ mode, onModeChange, inMpRoom, isBackendConnected }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 mb-10">
      <button
        onClick={() => !inMpRoom && onModeChange('solo')}
        disabled={inMpRoom}
        className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
          mode === 'solo'
            ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
            : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">person</span>
          <span className="font-bold">{t('multiplayer.solo')}</span>
        </div>
      </button>
      <button
        onClick={() => onModeChange('multiplayer')}
        disabled={!isBackendConnected}
        className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
          mode === 'multiplayer'
            ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
            : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">group</span>
          <span className="font-bold">{t('multiplayer.multiplayer')}</span>
        </div>
      </button>
      {!isBackendConnected && (
        <span className="self-center text-[10px] text-on-surface-variant">
          {t('multiplayer.backendRequired')}
        </span>
      )}
    </div>
  );
}
