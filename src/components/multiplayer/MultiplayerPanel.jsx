import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useGame } from '../../contexts/GameContext';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';

function PlayerRow({ player, myOdId }) {
  const { t } = useTranslation();
  const isMe = player.odId === myOdId;

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-sm ${
      isMe ? 'bg-surface-tint/10' : ''
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
        player.isHost
          ? 'bg-gradient-to-tr from-primary-dim to-primary text-on-primary'
          : 'bg-surface-container-high text-on-surface-variant'
      }`}>
        <span className="material-symbols-outlined text-base">
          {player.isHost ? 'shield' : 'person'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-on-surface truncate">{player.name}</span>
          {player.isHost && (
            <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
              {t('multiplayer.host')}
            </span>
          )}
          {isMe && (
            <span className="text-[9px] font-bold text-tertiary uppercase tracking-wider">
              {t('multiplayer.you')}
            </span>
          )}
        </div>
      </div>
      {player.pendingAction && (
        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
      )}
    </div>
  );
}

export default function MultiplayerPanel({ onClose }) {
  const { t } = useTranslation();
  const mp = useMultiplayer();
  const { state: gameState } = useGame();
  const [copied, setCopied] = useState(false);
  const [converting, setConverting] = useState(false);

  const modalRef = useModalA11y(onClose);
  const isConnected = apiClient.isConnected();
  const isMultiplayer = mp.state.isMultiplayer;
  const roomCode = mp.state.roomCode;
  const players = mp.state.players || [];
  const myOdId = mp.state.myOdId;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  const handleConvert = () => {
    if (converting) return;
    setConverting(true);

    const mpGameState = {
      campaign: gameState.campaign,
      characters: gameState.character ? [{
        ...gameState.character,
        playerName: gameState.character.name,
      }] : [],
      world: gameState.world,
      quests: gameState.quests,
      scenes: gameState.scenes || [],
      chatHistory: gameState.chatHistory || [],
    };

    const settings = {
      genre: gameState.campaign?.genre || 'Fantasy',
      tone: gameState.campaign?.tone || 'Epic',
      style: gameState.campaign?.style || 'Hybrid',
      difficulty: gameState.campaign?.difficulty || 'Normal',
      length: gameState.campaign?.length || 'Medium',
      storyPrompt: '',
    };

    mp.convertToMultiplayer(mpGameState, settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('multiplayer.multiplayer')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-md max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">group</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">{t('multiplayer.multiplayer')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {!isConnected && !isMultiplayer ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-4xl text-outline/30 block mb-3">cloud_off</span>
              <p className="text-sm text-on-surface-variant">{t('multiplayer.backendRequiredDesc')}</p>
            </div>
          ) : !isMultiplayer ? (
            <div className="text-center py-4 space-y-4">
              <p className="text-sm text-on-surface-variant">{t('multiplayer.openMultiplayerDesc')}</p>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-surface-tint text-on-primary font-bold text-xs tracking-widest uppercase rounded-sm shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] active:scale-95 transition-all duration-200 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">
                  {converting ? 'hourglass_top' : 'group_add'}
                </span>
                {converting ? t('multiplayer.converting') : t('multiplayer.openMultiplayer')}
              </button>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('multiplayer.roomCode')}
                </div>
                <button
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-container-high/60 border border-primary/30 rounded-sm hover:bg-surface-tint/10 transition-all group"
                >
                  <span className="font-headline text-2xl tracking-[0.3em] text-primary">
                    {roomCode}
                  </span>
                  <span className="material-symbols-outlined text-base text-on-surface-variant group-hover:text-primary transition-colors">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                </button>
                {copied && (
                  <div className="text-[10px] text-primary mt-1 animate-fade-in">{t('multiplayer.codeCopied')}</div>
                )}
              </div>

              <div>
                <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('multiplayer.players')} ({players.length}/6)
                </div>
                <div className="space-y-1">
                  {players.map((player) => (
                    <PlayerRow key={player.odId} player={player} myOdId={myOdId} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
