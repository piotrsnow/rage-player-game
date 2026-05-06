import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useGlobalMusic } from '../../contexts/MusicContext';

const STORAGE_KEY = 'rpgon_intro_seen';

export default function IntroOverlay({ onVideoEnded } = {}) {
  const [visible, setVisible] = useState(
    () => !sessionStorage.getItem(STORAGE_KEY)
  );
  const [fading, setFading] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);
  const videoRef = useRef(null);
  const { setSuppressLobbyMusicForIntroVideo } = useGlobalMusic();

  useLayoutEffect(() => {
    if (!visible) return undefined;
    setSuppressLobbyMusicForIntroVideo(true);
    return () => setSuppressLobbyMusicForIntroVideo(false);
  }, [visible, setSuppressLobbyMusicForIntroVideo]);

  useEffect(() => {
    const replay = () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setVisible(true);
      setFading(false);
      setSkipVisible(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('rpgon:replay-intro', replay);
    return () => window.removeEventListener('rpgon:replay-intro', replay);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setSkipVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = useCallback(() => {
    if (fading) return;
    setFading(true);
    onVideoEnded?.();
  }, [fading, onVideoEnded]);

  const handleTransitionEnd = useCallback(() => {
    if (!fading) return;
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }, [fading]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[5] pointer-events-none"
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.8s ease-out',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/video/krzemuch_intro.mp4"
        autoPlay
        muted
        playsInline
        onEnded={dismiss}
      />

      <div className="absolute inset-0 bg-black/60" />

      <button
        type="button"
        onClick={dismiss}
        className={`pointer-events-auto absolute bottom-8 right-8 px-4 py-2 rounded-sm text-sm font-label uppercase tracking-wider text-white/70 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 transition-all duration-300 z-10 ${skipVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        Pomiń
      </button>
    </div>
  );
}
