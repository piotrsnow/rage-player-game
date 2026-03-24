import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';
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
  const { isAvailable: soloAvailable, formattedTime: soloCooldownTime } = useSoloActionCooldown(myPlayer?.lastSoloActionAt);

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
        mp.submitAction(customAction.trim(), true);
      } else {
        onAction(customAction.trim(), true);
      }
      setCustomAction('');
    }
  };

  const handleSuggestedAction = (action) => {
    if (isMultiplayer) {
      mp.submitAction(action, false);
    } else {
      onAction(action, false);
    }
  };

  const handleWithdraw = () => {
    mp.withdrawAction();
  };

  const handleApprove = () => {
    mp.approveActions(settings.language || 'en', settings.dmSettings);
  };

  const handleSoloSuggestedAction = (action) => {
    mp.soloAction(action, false, settings.language || 'en', settings.dmSettings);
  };

  const handleSoloCustomSubmit = () => {
    if (customAction.trim()) {
      if (listening) toggle();
      mp.soloAction(customAction.trim(), true, settings.language || 'en', settings.dmSettings);
      setCustomAction('');
    }
  };

  const handleSoloPendingAction = () => {
    if (myPlayer?.pendingAction) {
      mp.soloAction(myPlayer.pendingAction, false, settings.language || 'en', settings.dmSettings);
    }
  };

  return (
    <div className="space-y-4">
      {/* Multiplayer: Solo Action Cooldown Indicator */}
      {isMultiplayer && !soloAvailable && (
        <div className="flex items-center gap-2 px-3 py-2 bg-tertiary/5 border border-tertiary/15 rounded-sm">
          <span className="material-symbols-outlined text-tertiary text-base">timer</span>
          <span className="text-xs text-tertiary font-label">
            {t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
          </span>
        </div>
      )}
      {isMultiplayer && soloAvailable && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="material-symbols-outlined text-tertiary/60 text-sm">bolt</span>
          <span className="text-[10px] text-tertiary/60 font-label uppercase tracking-widest">
            {t('multiplayer.soloActionReady')}
          </span>
        </div>
      )}

      {/* Multiplayer: Pending Actions */}
      {isMultiplayer && <PendingActions />}

      {/* Suggested Actions */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {actions.map((action, i) => (
              <div key={`${action.substring(0, 30)}_${i}`} className="flex gap-1.5">
                <button
                  onClick={() => handleSuggestedAction(action)}
                  disabled={disabled || hasPendingAction}
                  className="flex-1 text-left p-4 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-primary-dim/20 to-primary/10 text-primary font-headline text-sm leading-none border border-primary/15 group-hover:border-primary/30 group-hover:shadow-[0_0_8px_rgba(197,154,255,0.2)] transition-all">
                      {i + 1}
                    </span>
                    <p className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors leading-relaxed">
                      {action}
                    </p>
                  </div>
                </button>
                {isMultiplayer && (
                  <button
                    onClick={() => handleSoloSuggestedAction(action)}
                    disabled={disabled || !soloAvailable || mp.state.isGenerating}
                    title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                    className="shrink-0 w-10 flex items-center justify-center bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 hover:border-tertiary/40 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-tertiary text-base">bolt</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Search for Quests */}
          <button
            onClick={() => handleSuggestedAction(t('gameplay.searchForQuestsAction'))}
            disabled={disabled || hasPendingAction}
            className="flex items-center gap-2 px-3 py-2 text-xs font-label text-tertiary/80 hover:text-tertiary bg-tertiary/5 hover:bg-tertiary/10 border border-tertiary/10 hover:border-tertiary/25 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm">assignment</span>
            {t('gameplay.searchForQuests')}
          </button>
        </div>
      )}

      {/* Multiplayer: Withdraw / Solo Send / Approve buttons */}
      {isMultiplayer && hasPendingAction && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleWithdraw}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-sm">undo</span>
            {t('multiplayer.withdrawAction')}
          </button>
          <button
            onClick={handleSoloPendingAction}
            disabled={!soloAvailable || mp.state.isGenerating}
            title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            {soloAvailable ? t('multiplayer.soloActionSend') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
          </button>
          <span className="text-[10px] text-on-surface-variant italic">
            {t('multiplayer.waitingForHost')}
          </span>
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
            className={`w-full bg-transparent border-0 border-b-2 focus:ring-0 text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar disabled:opacity-50 transition-all duration-300 ${
              listening
                ? 'border-primary/60 text-on-surface shadow-[0_2px_8px_rgba(197,154,255,0.15)]'
                : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)]'
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
            <div className="flex items-center gap-1.5">
              {isMultiplayer && (
                <button
                  type="button"
                  onClick={handleSoloCustomSubmit}
                  disabled={!customAction.trim() || disabled || !soloAvailable || mp.state.isGenerating}
                  title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                  className="flex items-center gap-1 px-2 py-1.5 text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">bolt</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {soloAvailable ? t('multiplayer.soloAction') : soloCooldownTime}
                  </span>
                </button>
              )}
              <button
                type="submit"
                disabled={!customAction.trim() || disabled}
                className="text-primary hover:text-on-surface transition-all flex items-center gap-1.5 group disabled:opacity-30 px-3 py-1.5 rounded-sm hover:bg-primary/10"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                  {isMultiplayer ? t('multiplayer.submitAction') : t('gameplay.send')}
                </span>
                <span className="material-symbols-outlined text-xl group-hover:translate-x-0.5 transition-transform">send</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
