import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import PendingActions from '../multiplayer/PendingActions';

export default function ActionPanel({ actions = [], onAction, disabled }) {
  const [customAction, setCustomAction] = useState('');
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mp = useMultiplayer();
  const isMultiplayer = mp.state.isMultiplayer;
  const isHost = mp.state.isHost;
  const myPlayer = mp.state.players?.find((p) => p.odId === mp.state.myOdId);
  const hasPendingAction = isMultiplayer && myPlayer?.pendingAction;

  const onVoiceResult = useCallback((transcript) => {
    setCustomAction((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + separator + transcript;
    });
  }, []);

  const { listening, interim, supported, toggle } = useSpeechRecognition({
    lang: settings.language || 'pl',
    onResult: onVoiceResult,
  });

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (customAction.trim() && !disabled) {
      if (listening) toggle();
      if (isMultiplayer) {
        mp.submitAction(customAction.trim());
      } else {
        onAction(customAction.trim());
      }
      setCustomAction('');
    }
  };

  const handleSuggestedAction = (action) => {
    if (isMultiplayer) {
      mp.submitAction(action);
    } else {
      onAction(action);
    }
  };

  const handleWithdraw = () => {
    mp.withdrawAction();
  };

  const handleApprove = () => {
    mp.approveActions(settings.language || 'en');
  };

  return (
    <div className="space-y-4">
      {/* Multiplayer: Pending Actions */}
      {isMultiplayer && <PendingActions />}

      {/* Suggested Actions */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleSuggestedAction(action)}
              disabled={disabled || hasPendingAction}
              className="text-left p-4 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none"
            >
              <div className="flex items-start gap-3">
                <span className="text-primary-dim font-headline text-lg leading-none mt-0.5">
                  {i + 1}
                </span>
                <p className="text-base text-on-surface-variant group-hover:text-on-surface transition-colors leading-relaxed">
                  {action}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Multiplayer: Withdraw / Approve buttons */}
      {isMultiplayer && hasPendingAction && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleWithdraw}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-sm">undo</span>
            {t('multiplayer.withdrawAction')}
          </button>
          {!isMultiplayer || !hasPendingAction ? null : (
            <span className="text-[10px] text-on-surface-variant italic">
              {t('multiplayer.waitingForHost')}
            </span>
          )}
        </div>
      )}

      {isMultiplayer && isHost && (
        <button
          onClick={handleApprove}
          disabled={!mp.state.players?.some((p) => p.pendingAction) || mp.state.isGenerating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-sm text-primary font-label text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg">gavel</span>
          {t('multiplayer.approveAndSend')}
        </button>
      )}

      {/* Custom Action Input */}
      {(!hasPendingAction || !isMultiplayer) && (
        <form onSubmit={handleCustomSubmit} className="relative">
          <textarea
            value={customAction + (interim ? (customAction ? ' ' : '') + interim : '')}
            onChange={(e) => setCustomAction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCustomSubmit(e);
              }
            }}
            placeholder={
              listening
                ? t('gameplay.voiceListening')
                : supported
                  ? t('gameplay.customActionPlaceholderVoice')
                  : t('gameplay.customActionPlaceholder')
            }
            rows={2}
            disabled={disabled}
            readOnly={listening}
            className={`w-full bg-transparent border-0 border-b focus:ring-0 text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar disabled:opacity-50 transition-colors ${
              listening
                ? 'border-primary/60 text-on-surface'
                : 'border-outline-variant/20 focus:border-primary/50'
            }`}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {supported && (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={disabled}
                  title={listening ? t('gameplay.voiceStop') : t('gameplay.voiceStart')}
                  className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 disabled:opacity-30 ${
                    listening
                      ? 'text-error-light bg-error/15 mic-pulse'
                      : 'text-primary/70 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {listening ? 'mic' : 'mic_none'}
                  </span>
                </button>
              )}
              {listening && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 animate-pulse">
                  {t('gameplay.voiceListening')}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!customAction.trim() || disabled}
              className="text-primary hover:text-on-surface transition-all flex items-center gap-1 group disabled:opacity-30"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                {isMultiplayer ? t('multiplayer.submitAction') : t('gameplay.send')}
              </span>
              <span className="material-symbols-outlined text-xl">send</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
