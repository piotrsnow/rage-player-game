import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useModals } from '../../contexts/ModalContext';
import { apiClient } from '../../services/apiClient';
import Button from '../ui/Button';

export default function JoinRoomPage() {
  const navigate = useNavigate();
  const { code } = useParams();
  const { t } = useTranslation();
  const mp = useMultiplayer();
  const { openSettings } = useModals();

  const [roomCode, setRoomCode] = useState(code || '');
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joining, setJoining] = useState(false);
  const isConnected = apiClient.isConnected();

  useEffect(() => {
    if (mp.state.isMultiplayer && mp.state.roomCode) {
      navigate(mp.state.phase === 'playing' ? '/play' : '/create');
    }
  }, [mp.state.isMultiplayer, mp.state.roomCode, mp.state.phase, navigate]);

  useEffect(() => {
    if (mp.state.error) {
      setError(mp.state.error);
    }
  }, [mp.state.error]);

  const fetchRooms = useCallback(async () => {
    if (!isConnected) return;
    setLoadingRooms(true);
    try {
      const data = await apiClient.request('/multiplayer/rooms');
      setRooms(data.rooms || []);
    } catch {
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [isConnected]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const handleJoin = async () => {
    if (!roomCode.trim()) return;
    setError(null);
    setJoining(true);
    try {
      await mp.joinRoom(roomCode.trim());
    } catch (err) {
      setError(err.message || t('multiplayer.connectionError', 'Failed to connect to multiplayer server.'));
    } finally {
      setJoining(false);
    }
  };

  const handleJoinFromList = async (code) => {
    setError(null);
    setRoomCode(code);
    setJoining(true);
    try {
      await mp.joinRoom(code);
    } catch (err) {
      setError(err.message || t('multiplayer.connectionError', 'Failed to connect to multiplayer server.'));
    } finally {
      setJoining(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin();
  };

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <span className="material-symbols-outlined text-5xl text-outline/30 block mb-4">cloud_off</span>
        <h2 className="font-headline text-xl text-on-surface mb-2">{t('multiplayer.backendRequired')}</h2>
        <p className="text-on-surface-variant text-sm mb-6">{t('multiplayer.backendRequiredDesc')}</p>
        <Button variant="ghost" onClick={openSettings}>
          {t('gameplay.goToSettings')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 animate-fade-in">
      <div className="text-center mb-10">
        <span className="material-symbols-outlined text-5xl text-primary block mb-4">group_add</span>
        <h1 className="font-headline text-3xl text-tertiary mb-2">{t('multiplayer.joinTitle')}</h1>
        <p className="text-on-surface-variant text-sm">{t('multiplayer.joinSubtitle')}</p>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        <div>
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
            {t('multiplayer.roomCode')}
          </label>
          <input
            data-testid="room-code-input"
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            onKeyDown={handleKeyDown}
            placeholder="A3K9"
            maxLength={4}
            autoFocus
            className="w-full text-center font-headline text-4xl tracking-[0.4em] bg-transparent border-0 border-b-2 border-outline-variant/30 focus:border-primary/60 focus:ring-0 text-on-surface py-4 px-2 placeholder:text-outline/20"
          />
        </div>

        {error && (
          <div data-testid="join-error" className="bg-error-container/20 border border-error/20 p-3 rounded-sm">
            <p className="text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-center pt-4">
          <Button data-testid="join-room-button" onClick={handleJoin} disabled={roomCode.length < 4 || joining} size="lg">
            <span className="material-symbols-outlined text-sm">login</span>
            {joining ? t('multiplayer.joining', 'Joining...') : t('multiplayer.join')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/create')}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>

      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-lg text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary">dns</span>
            {t('multiplayer.availableRooms')}
          </h2>
          <button
            data-testid="refresh-rooms"
            onClick={fetchRooms}
            disabled={loadingRooms}
            className="text-on-surface-variant hover:text-primary transition-colors p-1"
          >
            <span className={`material-symbols-outlined text-xl ${loadingRooms ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>

        {loadingRooms && rooms.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-sm">
            <span className="material-symbols-outlined text-3xl block mb-2 animate-spin">progress_activity</span>
            {t('multiplayer.loadingRooms')}
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-10 border border-outline-variant/10 rounded-lg bg-surface-container/30">
            <span className="material-symbols-outlined text-3xl text-outline/30 block mb-2">meeting_room</span>
            <p className="text-on-surface-variant text-sm">{t('multiplayer.noRooms')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div
                key={room.roomCode}
                data-testid="room-card"
                className="group flex items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/10 bg-surface-container/30 hover:bg-surface-container/60 hover:border-primary/20 transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-xl">
                      {room.phase === 'playing' ? 'swords' : 'groups'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-on-surface tracking-wider">{room.roomCode}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm font-label ${
                        room.phase === 'lobby'
                          ? 'bg-tertiary/15 text-tertiary'
                          : 'bg-primary/15 text-primary'
                      }`}>
                        {room.phase === 'lobby' ? t('multiplayer.phaseLobby') : t('multiplayer.phasePlaying')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">person</span>
                        {room.hostName}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">group</span>
                        {room.playerCount}/{room.maxPlayers}
                      </span>
                      {room.settings?.genre && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">auto_stories</span>
                          {room.settings.genre}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleJoinFromList(room.roomCode)}
                  disabled={joining}
                  className="flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                >
                  <span className="material-symbols-outlined text-sm">login</span>
                  {t('multiplayer.join')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
