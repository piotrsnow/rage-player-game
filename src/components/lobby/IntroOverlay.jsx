import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { INTRO_SEEN_SESSION_KEY } from '../../constants/sessionIntro';

export default function IntroOverlay({ onVideoEnded } = {}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(
    () => !sessionStorage.getItem(INTRO_SEEN_SESSION_KEY)
  );
  const [fading, setFading] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);
  const [needsTapForAudio, setNeedsTapForAudio] = useState(false);
  const videoRef = useRef(null);
  const blockAutoplayRef = useRef(false);
  const { setSuppressLobbyMusicForIntroVideo } = useGlobalMusic();

  useLayoutEffect(() => {
    if (!visible) return undefined;
    setSuppressLobbyMusicForIntroVideo(true);
    return () => setSuppressLobbyMusicForIntroVideo(false);
  }, [visible, setSuppressLobbyMusicForIntroVideo]);

  const attemptPlayWithSound = useCallback(() => {
    const v = videoRef.current;
    if (!v || blockAutoplayRef.current) return;
    v.muted = false;
    v.volume = 1;
    v.play().catch((err) => {
      if (err?.name === 'NotAllowedError') {
        blockAutoplayRef.current = true;
        setNeedsTapForAudio(true);
        v.muted = true;
        v.play().catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    const replay = () => {
      sessionStorage.removeItem(INTRO_SEEN_SESSION_KEY);
      blockAutoplayRef.current = false;
      setNeedsTapForAudio(false);
      setVisible(true);
      setFading(false);
      setSkipVisible(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        attemptPlayWithSound();
      }
    };
    window.addEventListener('rpgon:replay-intro', replay);
    return () => window.removeEventListener('rpgon:replay-intro', replay);
  }, [attemptPlayWithSound]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setSkipVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = requestAnimationFrame(() => {
      const v = videoRef.current;
      if (v && v.readyState >= 2) attemptPlayWithSound();
    });
    return () => cancelAnimationFrame(id);
  }, [visible, attemptPlayWithSound]);

  const unlockAudioFromGesture = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    blockAutoplayRef.current = false;
    setNeedsTapForAudio(false);
    v.muted = false;
    v.volume = 1;
    v.play().catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    if (fading) return;
    blockAutoplayRef.current = false;
    setNeedsTapForAudio(false);
    setFading(true);
    onVideoEnded?.();
  }, [fading, onVideoEnded]);

  const handleTransitionEnd = useCallback(() => {
    if (!fading) return;
    sessionStorage.setItem(INTRO_SEEN_SESSION_KEY, '1');
    window.dispatchEvent(new CustomEvent('rpgon:intro-seen'));
    setVisible(false);
  }, [fading]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[5] ${needsTapForAudio ? 'cursor-pointer' : 'pointer-events-none'}`}
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.8s ease-out',
      }}
      onClick={needsTapForAudio ? unlockAudioFromGesture : undefined}
      onTransitionEnd={handleTransitionEnd}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/video/krzemuch_intro.mp4"
        autoPlay
        muted
        playsInline
        onLoadedData={attemptPlayWithSound}
        onEnded={dismiss}
      />

      <div className="absolute inset-0 bg-black/60" />

      <div className={`pointer-events-auto absolute bottom-8 right-8 flex items-center gap-3 z-10 transition-all duration-300 ${skipVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        {needsTapForAudio ? (
          <button
            type="button"
            onClick={unlockAudioFromGesture}
            className="px-3 py-2 rounded-sm text-xs font-label uppercase tracking-wider text-white/50 hover:text-white bg-white/5 hover:bg-white/15 backdrop-blur-sm border border-white/10 transition-colors"
          >
            {t('lobby.introTapForSound')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={dismiss}
          className="px-4 py-2 rounded-sm text-sm font-label uppercase tracking-wider text-white/70 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 transition-colors"
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}
