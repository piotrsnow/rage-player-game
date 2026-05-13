import { useRef, useEffect } from 'react';

/**
 * Full-viewport loop behind page chrome (z-[1]). `opacity` is video visibility 0–1; lower = stronger black overlay.
 */
export default function VideoBackground({ src, opacity = 0.1 }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    el.playbackRate = 0.75;
    const kick = () => {
      el.play().catch(() => {});
    };
    kick();
    el.addEventListener('loadeddata', kick);
    return () => el.removeEventListener('loadeddata', kick);
  }, [src]);

  return (
    <div className="fixed inset-0 z-[1] overflow-hidden pointer-events-none">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${1 - opacity})` }} />
    </div>
  );
}
