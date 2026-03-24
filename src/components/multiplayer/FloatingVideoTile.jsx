import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import VideoTile from './VideoTile';

const STORAGE_PREFIX = 'nikczemny_krzemuch_vtile_';
const MIN_W = 200;
const MIN_H = 150;
const DEFAULT_W = 280;
const DEFAULT_H = 210;
const CASCADE_OFFSET = 30;

function loadTileState(id) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveTileState(id, state) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function FloatingVideoTile({
  tileId,
  index,
  stream,
  playerName,
  isLocal,
  connectionState,
  cameraEnabled,
  micEnabled,
  remoteCameraOn,
  remoteMicOn,
  onToggleCamera,
  onToggleMic,
  onClose,
}) {
  const { t } = useTranslation();
  const saved = useRef(loadTileState(tileId));

  const defaultX = 16 + (index * CASCADE_OFFSET);
  const defaultY = 16 + (index * CASCADE_OFFSET);

  const [pos, setPos] = useState({
    x: saved.current?.x ?? defaultX,
    y: saved.current?.y ?? defaultY,
  });
  const [size, setSize] = useState({
    w: saved.current?.w ?? DEFAULT_W,
    h: saved.current?.h ?? DEFAULT_H,
  });
  const [collapsed, setCollapsed] = useState(saved.current?.collapsed ?? false);

  useEffect(() => {
    saveTileState(tileId, { x: pos.x, y: pos.y, w: size.w, h: size.h, collapsed });
  }, [tileId, pos, size, collapsed]);

  const onDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;

    const onMove = (ev) => {
      const x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - 32, ev.clientY - startY));
      setPos({ x, y });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos]);

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

  const label = isLocal
    ? `${playerName} (${t('webcam.you')})`
    : playerName;

  return (
    <div
      className="fixed z-[9999] flex flex-col shadow-2xl rounded-sm border border-outline-variant/20 overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: collapsed ? 200 : size.w,
        height: collapsed ? 'auto' : size.h,
        backdropFilter: 'blur(24px)',
        background: 'rgba(30, 27, 38, 0.92)',
      }}
    >
      {/* Title bar / drag handle */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-grab active:cursor-grabbing select-none shrink-0 border-b border-outline-variant/10"
        onPointerDown={onDragStart}
      >
        <span className="material-symbols-outlined text-xs text-primary">
          {isLocal ? 'person' : 'videocam'}
        </span>
        <span className="text-[11px] font-label text-on-surface/80 flex-1 truncate">
          {label}
        </span>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-0.5 text-on-surface-variant/60 hover:text-on-surface transition-colors"
          title={collapsed ? t('webcam.expand') : t('webcam.minimize')}
        >
          <span className="material-symbols-outlined text-xs">
            {collapsed ? 'expand_content' : 'collapse_content'}
          </span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-0.5 text-on-surface-variant/60 hover:text-red-400 transition-colors"
            title={t('common.close')}
          >
            <span className="material-symbols-outlined text-xs">close</span>
          </button>
        )}
      </div>

      {/* Video content */}
      {!collapsed && (
        <div className="flex-1 min-h-0 relative">
          <VideoTile
            stream={stream}
            playerName={playerName}
            isLocal={isLocal}
            connectionState={connectionState}
            cameraEnabled={cameraEnabled}
            micEnabled={micEnabled}
            remoteCameraOn={remoteCameraOn}
            remoteMicOn={remoteMicOn}
            onToggleCamera={onToggleCamera}
            onToggleMic={onToggleMic}
          />
        </div>
      )}

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
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
