import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useWebRTC } from '../../hooks/useWebRTC';
import VideoTile from './VideoTile';

const STORAGE_KEY = 'nikczemny_krzemuch_video_panel';
const MIN_W = 280;
const MIN_H = 180;
const DEFAULT_W = 480;
const DEFAULT_H = 320;

function loadPanelState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function savePanelState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function FloatingVideoPanel({ visible, onClose }) {
  const { t } = useTranslation();
  const mp = useMultiplayer();
  const players = mp.state.players || [];
  const myOdId = mp.state.myOdId;
  const isActive = visible && mp.state.isMultiplayer;

  const {
    localStream,
    remoteStreams,
    connectionStates,
    remoteTrackStates,
    cameraEnabled,
    micEnabled,
    error,
    startCamera,
    stopCamera,
    toggleCamera,
    toggleMic,
  } = useWebRTC(myOdId, players, isActive);

  const saved = useRef(loadPanelState());
  const [pos, setPos] = useState({ x: saved.current?.x ?? 16, y: saved.current?.y ?? 16 });
  const [size, setSize] = useState({ w: saved.current?.w ?? DEFAULT_W, h: saved.current?.h ?? DEFAULT_H });
  const [collapsed, setCollapsed] = useState(saved.current?.collapsed ?? false);
  const [started, setStarted] = useState(false);

  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    savePanelState({ x: pos.x, y: pos.y, w: size.w, h: size.h, collapsed });
  }, [pos, size, collapsed]);

  const handleStart = useCallback(async () => {
    const stream = await startCamera();
    if (stream) setStarted(true);
  }, [startCamera]);

  const handleStop = useCallback(() => {
    stopCamera();
    setStarted(false);
  }, [stopCamera]);

  const handleClose = useCallback(() => {
    handleStop();
    onClose();
  }, [handleStop, onClose]);

  // --- Drag logic ---
  const onDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;

    const onMove = (ev) => {
      const x = Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - startY));
      setPos({ x, y });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos]);

  // --- Resize logic ---
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const onMove = (ev) => {
      const w = Math.max(MIN_W, startW + (ev.clientX - startX));
      const h = Math.max(MIN_H, startH + (ev.clientY - startY));
      setSize({ w, h });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [size]);

  if (!visible) return null;

  const remotePlayers = players.filter((p) => p.odId !== myOdId);
  const totalTiles = (started ? 1 : 0) + remotePlayers.filter((p) => remoteStreams.has(p.odId)).length;
  const gridCols = totalTiles <= 1 ? 1 : totalTiles <= 4 ? 2 : 3;

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999] flex flex-col shadow-2xl rounded-sm border border-outline-variant/20 overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: collapsed ? 320 : size.w,
        height: collapsed ? 'auto' : size.h,
        backdropFilter: 'blur(24px)',
        background: 'rgba(30, 27, 38, 0.92)',
      }}
    >
      {/* Title bar / drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing select-none shrink-0 border-b border-outline-variant/10"
        onPointerDown={onDragStart}
      >
        <span className="material-symbols-outlined text-sm text-primary">video_camera_front</span>
        <span className="text-xs font-label text-on-surface/80 flex-1 truncate">
          {t('webcam.videoChat')} ({players.length})
        </span>

        {started && (
          <div className="flex gap-0.5">
            <button
              onClick={toggleCamera}
              className={`p-1 rounded-sm transition-colors ${cameraEnabled ? 'text-on-surface/70 hover:text-on-surface' : 'text-red-400 hover:text-red-300'}`}
              title={cameraEnabled ? t('webcam.stopCamera') : t('webcam.startCamera')}
            >
              <span className="material-symbols-outlined text-sm">{cameraEnabled ? 'videocam' : 'videocam_off'}</span>
            </button>
            <button
              onClick={toggleMic}
              className={`p-1 rounded-sm transition-colors ${micEnabled ? 'text-on-surface/70 hover:text-on-surface' : 'text-red-400 hover:text-red-300'}`}
              title={micEnabled ? t('webcam.muteMic') : t('webcam.unmuteMic')}
            >
              <span className="material-symbols-outlined text-sm">{micEnabled ? 'mic' : 'mic_off'}</span>
            </button>
          </div>
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 text-on-surface-variant/60 hover:text-on-surface transition-colors"
          title={collapsed ? t('webcam.expand') : t('webcam.minimize')}
        >
          <span className="material-symbols-outlined text-sm">
            {collapsed ? 'expand_content' : 'collapse_content'}
          </span>
        </button>
        <button
          onClick={handleClose}
          className="p-1 text-on-surface-variant/60 hover:text-red-400 transition-colors"
          title={t('common.close')}
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {!started ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <span className="material-symbols-outlined text-4xl text-outline/30">video_camera_front</span>
              {error && (
                <p className="text-[11px] text-error text-center px-4">{t('webcam.cameraError')}</p>
              )}
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 px-4 py-2 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all"
              >
                <span className="material-symbols-outlined text-sm">videocam</span>
                {t('webcam.startCamera')}
              </button>
              <p className="text-[11px] text-on-surface-variant/50 text-center px-4">{t('webcam.hint')}</p>
            </div>
          ) : (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
            >
              {/* Local tile */}
              <VideoTile
                stream={localStream}
                playerName={players.find((p) => p.odId === myOdId)?.name || t('webcam.you')}
                isLocal
                cameraEnabled={cameraEnabled}
                micEnabled={micEnabled}
                onToggleCamera={toggleCamera}
                onToggleMic={toggleMic}
              />

              {/* Remote tiles */}
              {remotePlayers.map((player) => {
                const stream = remoteStreams.get(player.odId);
                const connState = connectionStates.get(player.odId) || 'new';
                const trackState = remoteTrackStates.get(player.odId);
                if (!stream && connState !== 'connecting' && connState !== 'new') return null;
                return (
                  <VideoTile
                    key={player.odId}
                    stream={stream}
                    playerName={player.name}
                    isLocal={false}
                    connectionState={connState}
                    remoteCameraOn={trackState?.videoEnabled}
                    remoteMicOn={trackState?.audioEnabled}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
          onPointerDown={onResizeStart}
        >
          <svg viewBox="0 0 16 16" className="w-full h-full text-outline/30">
            <path d="M14 16L16 14M10 16L16 10M6 16L16 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
