// /play/:mapId — walk-test mode. The actual canvas + controller lives in
// src/play/. This page is a thin shell that loads the map + actors and
// mounts the PlayCanvas.

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useActors, useActorsStore } from '../services/useActorsStore.js';
import PlayCanvas from '../play/PlayCanvas.jsx';
import { useChargenStore } from '../chargen/useChargenStore.js';
import Spinner from '../ui/Spinner.jsx';
import { useToasts } from '../ui/Toasts.jsx';
import Button from '../ui/Button.jsx';
import { Select } from '../ui/Input.jsx';

const LS_PLAYER_KEY = 'rpgon:mapapp:playerActorId';

export default function PlayPage() {
  const { mapId } = useParams();
  const nav = useNavigate();
  const toasts = useToasts();
  const store = useChargenStore();
  const [mapDoc, setMapDoc] = useState(null);
  // Actors list comes from the shared store (TTL cache + in-flight dedup +
  // auto-refresh on focus / visibility / `rpgon:actors-changed`).
  const { actors, loading: actorsLoading } = useActors();
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(LS_PLAYER_KEY) || '');
  const [error, setError] = useState('');

  useEffect(() => { store.init(); }, [store]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await api.getMap(mapId);
        if (cancelled) return;
        setMapDoc(m);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          toasts.show(`Play load failed: ${err.message}`, { level: 'error' });
        }
      }
    })();
    return () => { cancelled = true; };
     
  }, [mapId]);

  // Drop the stored player id if it no longer resolves to a real actor
  // (deleted in CharGen, wiped DB, etc.) — otherwise the <select> silently
  // points to nothing while LS still holds the stale id. Gated on the store
  // having actually completed at least one fetch so we don't clobber `prev`
  // on the initial empty-array render before the request returns.
  const actorsFetchedAt = useActorsStore((s) => s.lastFetchedAt);
  useEffect(() => {
    if (!actorsFetchedAt) return;
    setPlayerId((prev) => (prev && actors.some((x) => x.id === prev) ? prev : ''));
  }, [actors, actorsFetchedAt]);

  useEffect(() => {
    if (playerId) localStorage.setItem(LS_PLAYER_KEY, playerId);
    else localStorage.removeItem(LS_PLAYER_KEY);
  }, [playerId]);

  const manifest = store.manifest;
  const playerActor = actors.find((a) => a.id === playerId);

  if (error) {
    return (
      <div className="p-6 text-error flex flex-col gap-3 items-start">
        <div>Play failed: {error}</div>
        <Button onClick={() => nav('/editor')}>← Editor</Button>
      </div>
    );
  }
  if (!mapDoc || !manifest) {
    return (
      <div className="p-6 text-on-surface-variant flex items-center gap-2">
        <Spinner size={16} />
        <span>Loading map + manifest…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 text-on-surface">
      <aside className="w-[260px] glass-panel-elevated border-r border-outline-variant/15 p-3 flex flex-col gap-2 overflow-auto custom-scrollbar">
        <div className="text-[11px] font-bold tracking-[0.08em] text-on-surface-variant/70 uppercase">Play</div>
        <div className="text-sm font-semibold text-on-surface font-headline">{mapDoc.name}</div>
        <div className="text-[11px] text-on-surface-variant/60">
          {Array.isArray(mapDoc.size) ? `${mapDoc.size[0]}×${mapDoc.size[1]}` : ''}
        </div>

        <div className="text-[11px] font-bold tracking-[0.08em] text-on-surface-variant/70 uppercase mt-2.5">
          Player character
        </div>
        {actors.length === 0 && actorsLoading ? (
          <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <Spinner size={12} />
            <span>Loading actors…</span>
          </div>
        ) : actors.length === 0 ? (
          <div className="text-[11px] text-on-surface-variant">
            No actors yet.{' '}
            <button
              onClick={() => nav('/chargen')}
              className="bg-transparent border-none text-primary cursor-pointer p-0 text-[11px] underline hover:text-primary-container"
            >
              Create one
            </button>.
          </div>
        ) : (
          <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">— pick actor —</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}

        {!playerActor && (
          <div className="text-[11px] text-tertiary">
            Pick a playable actor to start walking.
          </div>
        )}

        <div className="text-[11px] text-on-surface-variant/70 mt-3 leading-relaxed">
          <b className="text-on-surface-variant">Controls</b><br />
          WASD / arrows — walk<br />
          Bump an NPC — they'll flash "!"
        </div>

        <Button block onClick={() => nav('/editor')} className="mt-auto">
          ← Back to Editor
        </Button>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-surface-container-lowest">
        {playerActor ? (
          <PlayCanvas mapDoc={mapDoc} actors={actors} playerActor={playerActor} manifest={manifest} />
        ) : (
          <div className="p-6 text-on-surface-variant/60">Pick a player actor on the left.</div>
        )}
      </main>
    </div>
  );
}
