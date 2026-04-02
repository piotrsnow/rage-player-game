import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export default function VideoTile({
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
}) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      const maybePromise = video.play?.();
      if (maybePromise?.catch) {
        maybePromise.catch(() => {});
      }
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLocal) return;
    video.volume = muted ? 0 : volume;
  }, [volume, muted, isLocal]);

  const handleMuteToggle = useCallback(() => setMuted((m) => !m), []);
  const handleVolumeChange = useCallback((e) => {
    setVolume(parseFloat(e.target.value));
    if (muted) setMuted(false);
  }, [muted]);

  const videoOff = isLocal ? !cameraEnabled : remoteCameraOn === false;
  const audioOff = isLocal ? !micEnabled : remoteMicOn === false;
  const hasVideo = Boolean(stream) && !videoOff;

  const stateColor =
    connectionState === 'connected' ? 'bg-green-500' :
    connectionState === 'connecting' || connectionState === 'new' ? 'bg-yellow-500' :
    connectionState === 'failed' || connectionState === 'disconnected' ? 'bg-red-500' :
    'bg-gray-500';

  return (
    <div className="relative group rounded-sm overflow-hidden bg-surface-container-highest/80 border border-outline-variant/15 w-full h-full flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || muted}
        className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''} ${hasVideo ? '' : 'hidden'}`}
      />

      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-highest/90">
          <span className="material-symbols-outlined text-3xl text-outline/40">
            {connectionState === 'connecting' || connectionState === 'new' ? 'sync' : 'videocam_off'}
          </span>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-center gap-1.5">
        {!isLocal && (
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateColor}`} />
        )}
        <span className="text-[11px] text-white/90 font-label truncate flex-1">
          {playerName}{isLocal ? ` (${t('webcam.you')})` : ''}
        </span>

        {audioOff && !isLocal && (
          <span className="material-symbols-outlined text-xs text-red-400" title={t('webcam.remoteMicOff')}>mic_off</span>
        )}

        {isLocal ? (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onToggleCamera}
              className={`p-0.5 rounded-sm transition-colors ${cameraEnabled ? 'text-white/80 hover:text-white' : 'text-red-400 hover:text-red-300'}`}
              title={cameraEnabled ? t('webcam.stopCamera') : t('webcam.startCamera')}
            >
              <span className="material-symbols-outlined text-sm">{cameraEnabled ? 'videocam' : 'videocam_off'}</span>
            </button>
            <button
              onClick={onToggleMic}
              className={`p-0.5 rounded-sm transition-colors ${micEnabled ? 'text-white/80 hover:text-white' : 'text-red-400 hover:text-red-300'}`}
              title={micEnabled ? t('webcam.muteMic') : t('webcam.unmuteMic')}
            >
              <span className="material-symbols-outlined text-sm">{micEnabled ? 'mic' : 'mic_off'}</span>
            </button>
          </div>
        ) : (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity relative">
            <button
              onClick={handleMuteToggle}
              className={`p-0.5 rounded-sm transition-colors ${muted ? 'text-red-400 hover:text-red-300' : 'text-white/80 hover:text-white'}`}
              title={muted ? t('webcam.unmutePlayer') : t('webcam.mutePlayer')}
            >
              <span className="material-symbols-outlined text-sm">{muted ? 'volume_off' : 'volume_up'}</span>
            </button>
            <button
              onClick={() => setShowVolume((v) => !v)}
              className="p-0.5 rounded-sm text-white/80 hover:text-white transition-colors"
              title={t('webcam.volume')}
            >
              <span className="material-symbols-outlined text-sm">tune</span>
            </button>
            {showVolume && (
              <div className="absolute bottom-full right-0 mb-1 p-2 bg-surface-container-highest/95 backdrop-blur-md border border-outline-variant/20 rounded-sm shadow-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 accent-primary cursor-pointer"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
