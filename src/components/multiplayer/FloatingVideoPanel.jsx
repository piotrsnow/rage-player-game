import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useWebRTC } from '../../hooks/useWebRTC';
import FloatingVideoTile from './FloatingVideoTile';

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

  const [started, setStarted] = useState(false);

  const cameraErrorText = (() => {
    const code = error?.code;
    if (code === 'insecure_context') return t('webcam.cameraErrorInsecureContext');
    if (code === 'unsupported_media_api') return t('webcam.cameraErrorUnsupported');
    if (code === 'permission_denied') return t('webcam.cameraErrorPermissionDenied');
    if (code === 'device_not_found') return t('webcam.cameraErrorDeviceNotFound');
    if (code === 'device_in_use') return t('webcam.cameraErrorDeviceInUse');
    return t('webcam.cameraError');
  })();

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

  if (!visible) return null;

  const localPlayer = players.find((p) => p.odId === myOdId);
  const remotePlayers = players.filter((p) => p.odId !== myOdId);

  if (!started) {
    return (
      <div
        className="fixed z-[9999] flex flex-col items-center gap-3 py-5 px-6 shadow-2xl rounded-sm border border-outline-variant/20"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          backdropFilter: 'blur(24px)',
          background: 'rgba(30, 27, 38, 0.95)',
          minWidth: 260,
        }}
      >
        <span className="material-symbols-outlined text-4xl text-outline/30">video_camera_front</span>
        {error && (
          <p className="text-[11px] text-error text-center px-2">{cameraErrorText}</p>
        )}
        <button
          onClick={handleStart}
          className="flex items-center gap-1.5 px-4 py-2 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all"
        >
          <span className="material-symbols-outlined text-sm">videocam</span>
          {t('webcam.startCamera')}
        </button>
        <p className="text-[11px] text-on-surface-variant/50 text-center max-w-[220px]">{t('webcam.hint')}</p>
        <button
          onClick={handleClose}
          className="text-[11px] text-outline hover:text-on-surface-variant transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    );
  }

  let tileIndex = 0;

  return (
    <>
      {/* Local player tile */}
      <FloatingVideoTile
        tileId={`local_${myOdId}`}
        index={tileIndex++}
        stream={localStream}
        playerName={localPlayer?.name || t('webcam.you')}
        isLocal
        cameraEnabled={cameraEnabled}
        micEnabled={micEnabled}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onClose={handleClose}
      />

      {/* Remote player tiles */}
      {remotePlayers.map((player) => {
        const stream = remoteStreams.get(player.odId);
        const connState = connectionStates.get(player.odId) || 'new';
        const trackState = remoteTrackStates.get(player.odId);
        if (!stream && connState !== 'connecting' && connState !== 'new') return null;
        const idx = tileIndex++;
        return (
          <FloatingVideoTile
            key={player.odId}
            tileId={`remote_${player.odId}`}
            index={idx}
            stream={stream}
            playerName={player.name}
            isLocal={false}
            connectionState={connState}
            remoteCameraOn={trackState?.videoEnabled}
            remoteMicOn={trackState?.audioEnabled}
          />
        );
      })}
    </>
  );
}
