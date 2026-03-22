import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import { storage } from '../../services/storage';
import Button from '../ui/Button';

function PastCharacterPicker({ onSelect, onClose }) {
  const { t } = useTranslation();
  const pastCharacters = useMemo(() => {
    const campaigns = storage.getCampaigns();
    const seen = new Set();
    return campaigns
      .filter((c) => c.character?.name)
      .map((c) => ({ name: c.character.name, class: c.character.class, campaignName: c.campaign?.name }))
      .filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      });
  }, []);

  if (pastCharacters.length === 0) {
    return (
      <div className="mt-2 p-3 bg-surface-container-high/30 border border-outline-variant/15 rounded-sm">
        <p className="text-xs text-on-surface-variant">{t('multiplayer.noPastCharacters')}</p>
        <button onClick={onClose} className="text-xs text-primary mt-2">{t('common.cancel')}</button>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 bg-surface-container-high/30 border border-outline-variant/15 rounded-sm space-y-1">
      <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('multiplayer.pastCharacters')}
      </div>
      {pastCharacters.map((c) => (
        <button
          key={c.name}
          onClick={() => onSelect(c)}
          className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-surface-tint/10 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base text-tertiary">person</span>
          <div>
            <span className="text-on-surface font-bold">{c.name}</span>
            {c.class && <span className="text-on-surface-variant ml-2 text-xs">{c.class}</span>}
          </div>
        </button>
      ))}
      <button onClick={onClose} className="text-xs text-on-surface-variant hover:text-on-surface mt-1 transition-colors">
        {t('common.cancel')}
      </button>
    </div>
  );
}

function PlayerCard({ player, isMe, onUpdate, characterVoices }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [showPastPicker, setShowPastPicker] = useState(false);
  const [name, setName] = useState(player.name);
  const [gender, setGender] = useState(player.gender);
  const [voiceId, setVoiceId] = useState(player.voiceId || '');

  const handleSave = () => {
    const selectedVoice = characterVoices?.find((v) => v.voiceId === voiceId);
    onUpdate({ name, gender, voiceId: voiceId || null, voiceName: selectedVoice?.voiceName || null });
    setEditing(false);
  };

  const handleSelectPast = (character) => {
    setName(character.name);
    const selectedVoice = characterVoices?.find((v) => v.voiceId === voiceId);
    onUpdate({ name: character.name, gender, voiceId: voiceId || null, voiceName: selectedVoice?.voiceName || null });
    setShowPastPicker(false);
    setEditing(false);
  };

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
          {editing && isMe ? (
            <div className="space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-1 px-0 font-body"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setGender('male')}
                  className={`px-2 py-1 text-xs rounded-sm border transition-colors ${
                    gender === 'male' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/20 text-on-surface-variant'
                  }`}
                >
                  {t('multiplayer.male')}
                </button>
                <button
                  onClick={() => setGender('female')}
                  className={`px-2 py-1 text-xs rounded-sm border transition-colors ${
                    gender === 'female' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/20 text-on-surface-variant'
                  }`}
                >
                  {t('multiplayer.female')}
                </button>
              </div>
              {characterVoices && characterVoices.length > 0 && (
                <div>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-xs py-1 px-0 font-body"
                  >
                    <option value="">{t('multiplayer.noVoice')}</option>
                    {characterVoices.map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>{v.voiceName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <button onClick={handleSave} className="text-xs text-primary hover:text-on-surface transition-colors">
                  {t('common.save')}
                </button>
                <button onClick={() => setShowPastPicker(true)} className="text-xs text-tertiary hover:text-on-surface transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">history</span>
                  {t('multiplayer.usePastCharacter')}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface truncate">{player.name}</span>
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
                {player.gender}
                {player.voiceName && (
                  <span className="ml-2 text-tertiary">
                    <span className="material-symbols-outlined text-[10px] align-middle">record_voice_over</span>
                    {' '}{player.voiceName}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {isMe && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
          </button>
        )}

        {player.pendingAction && (
          <span className="material-symbols-outlined text-sm text-primary" title={t('multiplayer.actionSubmitted')}>
            check_circle
          </span>
        )}
      </div>

      {showPastPicker && isMe && (
        <PastCharacterPicker
          onSelect={handleSelectPast}
          onClose={() => setShowPastPicker(false)}
        />
      )}
    </div>
  );
}

export default function PlayerLobby() {
  const { t } = useTranslation();
  const { state, updateMyCharacter, leaveRoom } = useMultiplayer();
  const { settings } = useSettings();
  const { players, myOdId, roomCode } = state;
  const [copied, setCopied] = useState(false);

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
              onUpdate={(data) => updateMyCharacter(data)}
              characterVoices={settings.characterVoices}
            />
          ))}
        </div>
      </div>

      {/* Leave Button */}
      <div className="pt-2">
        <Button variant="ghost" onClick={leaveRoom} size="sm">
          <span className="material-symbols-outlined text-sm">logout</span>
          {t('multiplayer.leaveRoom')}
        </Button>
      </div>
    </div>
  );
}
