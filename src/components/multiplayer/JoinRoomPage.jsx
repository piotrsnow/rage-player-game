import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { apiClient } from '../../services/apiClient';
import Button from '../ui/Button';

export default function JoinRoomPage() {
  const navigate = useNavigate();
  const { code } = useParams();
  const { t } = useTranslation();
  const mp = useMultiplayer();

  const [roomCode, setRoomCode] = useState(code || '');
  const [error, setError] = useState(null);
  const isConnected = apiClient.isConnected();

  useEffect(() => {
    if (mp.state.isMultiplayer && mp.state.roomCode) {
      navigate('/create');
    }
  }, [mp.state.isMultiplayer, mp.state.roomCode, navigate]);

  useEffect(() => {
    if (mp.state.error) {
      setError(mp.state.error);
    }
  }, [mp.state.error]);

  const handleJoin = () => {
    if (!roomCode.trim()) return;
    setError(null);
    mp.connect();
    setTimeout(() => mp.joinRoom(roomCode.trim()), 300);
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
        <Button variant="ghost" onClick={() => navigate('/settings')}>
          {t('gameplay.goToSettings')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24 animate-fade-in">
      <div className="text-center mb-10">
        <span className="material-symbols-outlined text-5xl text-primary block mb-4">group_add</span>
        <h1 className="font-headline text-3xl text-tertiary mb-2">{t('multiplayer.joinTitle')}</h1>
        <p className="text-on-surface-variant text-sm">{t('multiplayer.joinSubtitle')}</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
            {t('multiplayer.roomCode')}
          </label>
          <input
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
          <div className="bg-error-container/20 border border-error/20 p-3 rounded-sm">
            <p className="text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-center pt-4">
          <Button onClick={handleJoin} disabled={roomCode.length < 4} size="lg">
            <span className="material-symbols-outlined text-sm">login</span>
            {t('multiplayer.join')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/create')}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
