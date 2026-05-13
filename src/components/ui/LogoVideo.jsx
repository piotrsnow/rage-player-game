import { useRef, useEffect, useCallback } from 'react';

const DEFAULT_REPLAY_MS = 30_000;

/**
 * @param {string}  [src="/video/logo_1.webm"]
 * @param {number}  [replayIntervalMs=30000]
 * @param {boolean} [active=true] — when false the video stays on the last frame
 *   and the replay timer is paused. Flip to true to seek-to-start and play immediately.
 */
export default function LogoVideo({
  src = '/video/logo_1.webm',
  replayIntervalMs = DEFAULT_REPLAY_MS,
  className,
  style,
  alt,
  active = true,
}) {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const prevActiveRef = useRef(active);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  }, []);

  const handleEnded = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(replay, replayIntervalMs);
  }, [replay, replayIntervalMs]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const wasInactive = !prevActiveRef.current;
    prevActiveRef.current = active;

    if (wasInactive) {
      replay();
    } else {
      videoRef.current?.play().catch(() => {});
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, replay]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      onEnded={handleEnded}
      className={className}
      style={style}
      aria-label={alt}
    />
  );
}
