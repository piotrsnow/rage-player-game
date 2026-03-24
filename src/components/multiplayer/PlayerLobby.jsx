import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import Button from '../ui/Button';
import FloatingVideoPanel from './FloatingVideoPanel';
import { CHARACTERISTIC_SHORT } from '../../data/wfrp';
import { translateCareer } from '../../utils/wfrpTranslate';

function CharacterSummaryBadge({ characterData, t }) {
  if (!characterData) return null;
  return (
    <div className="mt-2 p-2.5 bg-surface-container-high/20 border border-primary/15 rounded-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-xs text-primary">check_circle</span>
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{t('charCreator.characterReady')}</span>
      </div>
      <div className="text-xs text-on-surface">
        <span className="font-bold">{characterData.name}</span>
        <span className="mx-1 text-outline">·</span>
        <span className="text-on-surface-variant">{t(`species.${characterData.species}`, { defaultValue: characterData.species })}</span>
        <span className="mx-1 text-outline">·</span>
        <span className="text-on-surface-variant">{translateCareer(characterData.career?.name, t)}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {Object.entries(CHARACTERISTIC_SHORT).slice(0, 5).map(([key, short]) => (
          <span key={key} className="text-[9px] text-on-surface-variant">
            {short}: <strong className="text-tertiary">{characterData.characteristics?.[key]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ player, isMe }) {
  const { t } = useTranslation();

  return (
    <div className={`p-4 rounded-sm border transition-all ${
      isMe
        ? 'bg-surface-tint/10 border-primary/30'
        : 'bg-surface-container-high/40 border-outline-variant/15'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
          player.isHost
            ? 'bg-gradient-to-tr from-primary-dim to-primary text-on-primary'
            : 'bg-surface-container-high text-on-surface-variant'
        }`}>
          {player.photo ? (
            <img src={player.photo} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-lg">
              {player.isHost ? 'shield' : 'person'}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-on-surface truncate">
              {player.characterData?.name || player.name}
            </span>
            {player.isHost && (
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                {t('multiplayer.host')}
              </span>
            )}
            {isMe && (
              <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                {t('multiplayer.you')}
              </span>
            )}
          </div>
          <div className="text-[10px] text-on-surface-variant capitalize">
            {player.characterData?.gender || player.gender}
            {player.voiceName && (
              <span className="ml-2 text-tertiary">
                <span className="material-symbols-outlined text-[10px] align-middle">record_voice_over</span>
                {' '}{player.voiceName}
              </span>
            )}
          </div>
        </div>

        {player.pendingAction && (
          <span className="material-symbols-outlined text-sm text-primary" title={t('multiplayer.actionSubmitted')}>
            check_circle
          </span>
        )}
      </div>

      {player.characterData && (
        <CharacterSummaryBadge characterData={player.characterData} t={t} />
      )}

      {isMe && !player.characterData && (
        <div className="mt-2 py-2 text-center text-[10px] text-on-surface-variant border border-dashed border-outline-variant/20 rounded-sm">
          {t('creator.noCharacterHint')}
        </div>
      )}
    </div>
  );
}

export default function PlayerLobby() {
  const { t } = useTranslation();
  const { state, leaveRoom } = useMultiplayer();
  const { players, myOdId, roomCode } = state;
  const [copied, setCopied] = useState(false);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* Room Code */}
      <div className="text-center">
        <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {t('multiplayer.roomCode')}
        </div>
        <button
          onClick={handleCopyCode}
          className="inline-flex items-center gap-2 px-6 py-3 bg-surface-container-high/60 border border-primary/30 rounded-sm hover:bg-surface-tint/10 transition-all group"
        >
          <span className="font-headline text-3xl tracking-[0.3em] text-primary">
            {roomCode}
          </span>
          <span className="material-symbols-outlined text-lg text-on-surface-variant group-hover:text-primary transition-colors">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
        {copied && (
          <div className="text-[10px] text-primary mt-1 animate-fade-in">{t('multiplayer.codeCopied')}</div>
        )}
      </div>

      {/* Player List */}
      <div>
        <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
          {t('multiplayer.players')} ({players.length}/6)
        </div>
        <div className="space-y-2">
          {players.map((player) => (
            <PlayerCard
              key={player.odId}
              player={player}
              isMe={player.odId === myOdId}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" onClick={leaveRoom} size="sm">
          <span className="material-symbols-outlined text-sm">logout</span>
          {t('multiplayer.leaveRoom')}
        </Button>
        <button
          onClick={() => setVideoPanelOpen((v) => !v)}
          title={t('webcam.videoChat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-label border transition-all ${
            videoPanelOpen
              ? 'bg-surface-tint/15 text-primary border-primary/30'
              : 'text-on-surface-variant border-outline-variant/15 hover:text-primary hover:border-primary/20'
          }`}
        >
          <span className="material-symbols-outlined text-sm">video_camera_front</span>
          {t('webcam.videoChat')}
        </button>
      </div>

      <FloatingVideoPanel
        visible={videoPanelOpen}
        onClose={() => setVideoPanelOpen(false)}
      />
    </div>
  );
}
