import { useState, useEffect, useCallback, useRef } from 'react';
import { webrtcService } from '../services/webrtc';
import { wsService } from '../services/websocket';

export function useWebRTC(myOdId, players, isActive) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [connectionStates, setConnectionStates] = useState(new Map());
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [remoteTrackStates, setRemoteTrackStates] = useState(new Map());
  const [error, setError] = useState(null);
  const initializedRef = useRef(false);
  const connectedPeersRef = useRef(new Set());
  const playersRef = useRef([]);

  useEffect(() => {
    playersRef.current = players || [];
  }, [players]);

  const shouldInitiateOffer = useCallback((remoteOdId) => {
    if (!myOdId || !remoteOdId) return false;
    return String(myOdId).localeCompare(String(remoteOdId)) < 0;
  }, [myOdId]);

  useEffect(() => {
    if (!isActive || !myOdId || initializedRef.current) return;
    webrtcService.init(myOdId);
    initializedRef.current = true;
    if (webrtcService.localStream) {
      setLocalStream(webrtcService.localStream);
      setCameraEnabled(webrtcService.getTrackEnabled('video'));
      setMicEnabled(webrtcService.getTrackEnabled('audio'));
    }

    const unsubLocal = webrtcService.on('localStream', setLocalStream);
    const unsubRemote = webrtcService.on('remoteStream', ({ odId, stream }) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(odId, stream);
        return next;
      });
    });
    const unsubState = webrtcService.on('connectionState', ({ odId, state }) => {
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.set(odId, state);
        return next;
      });
    });
    const unsubDisconnect = webrtcService.on('peerDisconnected', (odId) => {
      connectedPeersRef.current.delete(odId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(odId);
        return next;
      });
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.delete(odId);
        return next;
      });
      setRemoteTrackStates((prev) => {
        const next = new Map(prev);
        next.delete(odId);
        return next;
      });
    });
    const unsubError = webrtcService.on('error', (err) => setError(err));

    const unsubTrackState = wsService.on('WEBRTC_TRACK_STATE', (msg) => {
      const { fromOdId, videoEnabled, audioEnabled } = msg;
      setRemoteTrackStates((prev) => {
        const next = new Map(prev);
        next.set(fromOdId, { videoEnabled, audioEnabled });
        return next;
      });
    });
    const unsubConnected = wsService.on('_connected', () => {
      if (!initializedRef.current) return;
      webrtcService.disconnectAll();
      connectedPeersRef.current.clear();
      setRemoteStreams(new Map());
      setConnectionStates(new Map());
      setRemoteTrackStates(new Map());

      const remotePlayers = (playersRef.current || []).filter((p) => p.odId !== myOdId);
      for (const player of remotePlayers) {
        if (!shouldInitiateOffer(player.odId)) continue;
        connectedPeersRef.current.add(player.odId);
        webrtcService.connectToPeer(player.odId);
      }
    });

    return () => {
      unsubLocal();
      unsubRemote();
      unsubState();
      unsubDisconnect();
      unsubError();
      unsubTrackState();
      unsubConnected();
      webrtcService.destroy();
      initializedRef.current = false;
      connectedPeersRef.current.clear();
      setLocalStream(null);
      setRemoteStreams(new Map());
      setConnectionStates(new Map());
      setRemoteTrackStates(new Map());
    };
  }, [isActive, myOdId, shouldInitiateOffer]);

  useEffect(() => {
    if (!isActive || !myOdId || !initializedRef.current) return;

    const remotePlayers = (players || []).filter((p) => p.odId !== myOdId);

    for (const player of remotePlayers) {
      if (!shouldInitiateOffer(player.odId)) continue;
      if (!connectedPeersRef.current.has(player.odId)) {
        connectedPeersRef.current.add(player.odId);
        webrtcService.connectToPeer(player.odId);
      }
    }

    const currentOdIds = new Set(remotePlayers.map((p) => p.odId));
    for (const odId of connectedPeersRef.current) {
      if (!currentOdIds.has(odId)) {
        connectedPeersRef.current.delete(odId);
        webrtcService.disconnectFromPeer(odId);
      }
    }
  }, [isActive, myOdId, players, localStream, shouldInitiateOffer]);

  const startCamera = useCallback(async () => {
    setError(null);
    const stream = await webrtcService.startLocalStream({ video: true, audio: true });
    if (stream) {
      setLocalStream(stream);
      setCameraEnabled(true);
      setMicEnabled(true);
      const remotePlayers = (playersRef.current || []).filter((p) => p.odId !== myOdId);
      for (const player of remotePlayers) {
        if (!connectedPeersRef.current.has(player.odId) && shouldInitiateOffer(player.odId)) {
          connectedPeersRef.current.add(player.odId);
          webrtcService.connectToPeer(player.odId);
        }
      }
    }
    return stream;
  }, [myOdId, shouldInitiateOffer]);

  const stopCamera = useCallback(() => {
    webrtcService.disconnectAll();
    webrtcService.stopLocalStream();
    connectedPeersRef.current.clear();
    setCameraEnabled(false);
    setMicEnabled(false);
    setRemoteStreams(new Map());
    setConnectionStates(new Map());
  }, []);

  const toggleCamera = useCallback(() => {
    const next = !cameraEnabled;
    webrtcService.setTrackEnabled('video', next);
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const toggleMic = useCallback(() => {
    const next = !micEnabled;
    webrtcService.setTrackEnabled('audio', next);
    setMicEnabled(next);
  }, [micEnabled]);

  return {
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
  };
}
