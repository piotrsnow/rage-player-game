import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';
import PendingActions from '../multiplayer/PendingActions';
import { parseActionSegments } from '../../services/actionParser';

const ATTITUDE_STYLES = {
  hostile: 'bg-error/20 text-error border-error/30',
  neutral: 'bg-warning/20 text-warning border-warning/30',
  friendly: 'bg-success/20 text-success border-success/30',
};

export default function ActionPanel({ actions = [], onAction, disabled, npcs = [], autoPlayerTypingText = '' }) {
  const [customAction, setCustomAction] = useState('');
  const [combatPickerOpen, setCombatPickerOpen] = useState(false);
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

  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  const emitTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      mp.sendTyping(false);
    }
  }, [mp]);

  const handleTypingChange = useCallback((value) => {
    setCustomAction(value);
    if (!isMultiplayer) return;

    if (value.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        mp.sendTyping(true);
      }
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(emitTypingStop, 2000);
    } else {
      clearTimeout(typingTimerRef.current);
      emitTypingStop();
    }
  }, [isMultiplayer, mp, emitTypingStop]);

  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      if (isTypingRef.current) {
        mp.sendTyping(false);
      }
    };
  }, [mp]);

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (customAction.trim() && !disabled) {
      if (listening) toggle();
      clearTimeout(typingTimerRef.current);
      emitTypingStop();
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

  const handleInitiateCombat = () => {
    setCombatPickerOpen(false);
    if (isMultiplayer) {
      mp.soloAction('[INITIATE COMBAT]', true, settings.language || 'en', settings.dmSettings);
    } else {
      onAction('[INITIATE COMBAT]', true);
    }
  };

  const handleAttackNpc = (npcName) => {
    setCombatPickerOpen(false);
    if (isMultiplayer) {
      mp.soloAction(`[ATTACK: ${npcName}]`, true, settings.language || 'en', settings.dmSettings);
    } else {
      onAction(`[ATTACK: ${npcName}]`, true);
    }
  };

  const isAutoTyping = !!autoPlayerTypingText;
  const displayValue = isAutoTyping
    ? autoPlayerTypingText
    : customAction + (interim ? (customAction ? ' ' : '') + interim : '');
  const displaySegments = useMemo(() => parseActionSegments(displayValue), [displayValue]);
  const hasDialogueText = displaySegments.some((s) => s.type === 'dialogue');

  return (
    <div className="space-y-2">
      {/* Multiplayer: Solo Action Cooldown Indicator */}
      {isMultiplayer && !soloAvailable && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-tertiary/5 border border-tertiary/15 rounded-sm">
          <span className="material-symbols-outlined text-tertiary text-sm">timer</span>
          <span className="text-[11px] text-tertiary font-label">
            {t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
          </span>
        </div>
      )}
      {isMultiplayer && soloAvailable && (
        <div className="flex items-center gap-1.5 px-2.5 py-1">
          <span className="material-symbols-outlined text-tertiary/60 text-xs">bolt</span>
          <span className="text-[10px] text-tertiary/60 font-label uppercase tracking-widest">
            {t('multiplayer.soloActionReady')}
          </span>
        </div>
      )}

      {/* Multiplayer: Pending Actions */}
      {isMultiplayer && <PendingActions />}

      {/* Suggested Actions */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="space-y-2">
          {/* Row 1: 3 action buttons */}
          <div className="grid grid-cols-3 gap-2">
            {actions.slice(0, 3).map((action, i) => (
              <div key={`${action.substring(0, 30)}_${i}`} className="flex gap-1">
                <button
                  onClick={() => handleSuggestedAction(action)}
                  disabled={disabled || hasPendingAction}
                  className="flex-1 text-left px-3 py-2.5 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-primary-dim/20 to-primary/10 text-primary font-headline text-xs leading-none border border-primary/15 group-hover:border-primary/30 group-hover:shadow-[0_0_8px_rgba(197,154,255,0.2)] transition-all">
                      {i + 1}
                    </span>
                    <p className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors leading-snug line-clamp-2">
                      {action}
                    </p>
                  </div>
                </button>
                {isMultiplayer && (
                  <button
                    onClick={() => handleSoloSuggestedAction(action)}
                    disabled={disabled || !soloAvailable || mp.state.isGenerating}
                    title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                    className="shrink-0 w-7 flex items-center justify-center bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 hover:border-tertiary/40 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-tertiary text-sm">bolt</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Combat picker dropdown (absolute positioned) */}
          {combatPickerOpen && (
            <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                {t('gameplay.selectTarget')}
              </label>

              <button
                onClick={handleInitiateCombat}
                disabled={disabled}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-label text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm text-error">target</span>
                {t('gameplay.generalCombat')}
              </button>

              {npcs.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {npcs.map((npc) => {
                    const attitudeKey = npc.attitude === 'hostile' ? 'attitudeHostile'
                      : npc.attitude === 'friendly' ? 'attitudeFriendly' : 'attitudeNeutral';
                    const attitudeStyle = ATTITUDE_STYLES[npc.attitude] || ATTITUDE_STYLES.neutral;
                    return (
                      <div
                        key={npc.id || npc.name}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 rounded-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-on-surface truncate">{npc.name}</span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm border font-label uppercase tracking-wider ${attitudeStyle}`}>
                            {t(`gameplay.${attitudeKey}`)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleAttackNpc(npc.name)}
                          disabled={disabled}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-label uppercase tracking-widest text-error hover:text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-xs">swords</span>
                          {t('gameplay.attackNpc')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-on-surface-variant/60 italic px-1">
                  {t('gameplay.noNpcsNearby')}
                </p>
              )}

              <button
                onClick={() => setCombatPickerOpen(false)}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('gameplay.cancelCombat')}
              </button>
            </div>
          )}
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

      {/* Row 2: Utility buttons + Input */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="flex items-center gap-2">
          {/* Quick action buttons */}
          <button
            type="button"
            onClick={() => handleSuggestedAction(t('gameplay.searchForQuestsAction'))}
            disabled={disabled || hasPendingAction}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-label text-tertiary/80 hover:text-tertiary bg-tertiary/5 hover:bg-tertiary/10 border border-tertiary/10 hover:border-tertiary/25 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm">assignment</span>
            {t('gameplay.searchForQuests')}
          </button>
          <button
            type="button"
            onClick={() => setCombatPickerOpen((v) => !v)}
            disabled={disabled || hasPendingAction}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-label text-error/80 hover:text-error bg-error/5 hover:bg-error/10 border border-error/10 hover:border-error/25 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm">swords</span>
            {t('gameplay.initiateCombat')}
          </button>

          {/* Custom action input */}
          <form onSubmit={handleCustomSubmit} className="flex-1 min-w-0">
            {/* Dialogue tag */}
            <div
              className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${
                hasDialogueText ? 'max-h-10 opacity-100 mb-1' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-400/15 border border-amber-400/30">
                <span className="material-symbols-outlined text-amber-300 text-xs">chat_bubble</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  {t('gameplay.dialogueTag')}
                </span>
              </span>
              <span className="text-[10px] text-amber-300/50 italic">
                {t('gameplay.dialogueHint')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {supported && !isAutoTyping && (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={disabled}
                  title={listening ? t('gameplay.voiceStop') : t('gameplay.voiceStart')}
                  className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 disabled:opacity-30 ${
                    listening
                      ? 'text-error-light bg-error/15 mic-pulse'
                      : 'text-primary/70 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {listening ? 'mic' : 'mic_none'}
                  </span>
                </button>
              )}
              {isAutoTyping && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
                  <span className="material-symbols-outlined text-sm">smart_toy</span>
                </span>
              )}
              <div className="relative flex-1 min-w-0">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 w-full text-sm py-1.5 px-1 pointer-events-none whitespace-pre-wrap break-words overflow-hidden leading-[1.5]"
                >
                  {displaySegments.map((seg, i) =>
                    seg.type === 'dialogue' ? (
                      <span
                        key={i}
                        className="bg-amber-400/15 rounded-sm text-amber-300 border-b border-amber-400/40 transition-colors"
                      >{seg.text}</span>
                    ) : (
                      <span key={i} className="text-on-surface">{seg.text}</span>
                    )
                  )}
                </div>
                <textarea
                  value={displayValue}
                  onChange={(e) => !isAutoTyping && handleTypingChange(e.target.value)}
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
                  rows={1}
                  disabled={disabled && !isAutoTyping}
                  readOnly={listening || isAutoTyping}
                  style={hasDialogueText && !isAutoTyping ? { color: 'transparent', caretColor: '#fffbfe' } : undefined}
                  className={`relative w-full bg-transparent border-0 border-b-2 focus:ring-0 text-sm py-1.5 px-1 resize-none placeholder:text-outline/40 custom-scrollbar disabled:opacity-50 transition-all duration-300 leading-[1.5] ${
                    hasDialogueText ? 'selection:bg-amber-400/30' : ''
                  } ${
                    isAutoTyping
                      ? 'border-primary/60 text-primary shadow-[0_2px_8px_rgba(197,154,255,0.2)]'
                      : listening
                        ? `border-primary/60 shadow-[0_2px_8px_rgba(197,154,255,0.15)]${!hasDialogueText ? ' text-on-surface' : ''}`
                        : hasDialogueText
                          ? 'border-amber-400/40 shadow-[0_2px_8px_rgba(251,191,36,0.08)]'
                          : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)]'
                  }`}
                />
              </div>
              {isMultiplayer && (
                <button
                  type="button"
                  onClick={handleSoloCustomSubmit}
                  disabled={!customAction.trim() || disabled || !soloAvailable || mp.state.isGenerating}
                  title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                </button>
              )}
              <button
                type="submit"
                disabled={!customAction.trim() || disabled}
                className="shrink-0 text-primary hover:text-on-surface transition-all flex items-center justify-center w-8 h-8 rounded-sm hover:bg-primary/10 disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-lg">send</span>
              </button>
            </div>
            {listening && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 animate-pulse mt-1 block">
                {t('gameplay.voiceListening')}
              </span>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
