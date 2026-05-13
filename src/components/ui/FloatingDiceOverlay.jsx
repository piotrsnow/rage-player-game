import { useRef, useEffect } from 'react';

const DICE_SIZE = 64;
const SPRING_STIFFNESS = 0.018;
const DAMPING = 0.51;
const ROTATION_FACTOR = 0.8;
const IDLE_TIMEOUT_MS = 1800;
const IDLE_FADE_SPEED = 0.012;
const ACTIVE_FADE_SPEED = 0.06;
const RESTING_OPACITY = 0.18;
const ACTIVE_OPACITY = 0.55;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MIN_PLAYBACK_RATE = 0.4;
const MAX_PLAYBACK_RATE = 4.0;
const SPEED_FOR_MAX_RATE = 18;
const MOMENTUM_FRICTION = 0.96;
const MOMENTUM_GAIN = 0.3;
const X_ACCELERATION_GAIN = 0.25;
const X_PLAYBACK_GAIN = 0.08;

function acceleratePointerDelta(delta) {
  const absDelta = Math.abs(delta);
  const acceleration = 1 + Math.min(absDelta / 80, 1) * X_ACCELERATION_GAIN;
  return absDelta * acceleration;
}

export default function FloatingDiceOverlay() {
  const videoRef = useRef(null);
  const stateRef = useRef({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    vx: 0,
    vy: 0,
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
    rotation: 0,
    opacity: RESTING_OPACITY,
    lastMoveTs: 0,
    idle: true,
    prevClientX: null,
    prevClientY: null,
    spinMomentum: 0,
    playMomentum: 0,
  });
  const rafRef = useRef(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    reducedMotionRef.current = mql.matches;
    const onChange = (e) => { reducedMotionRef.current = e.matches; };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onPointerMove = (e) => {
      const s = stateRef.current;
      if (s.prevClientX !== null) {
        const acceleratedX = acceleratePointerDelta(e.clientX - s.prevClientX);
        s.spinMomentum += acceleratedX * MOMENTUM_GAIN;
        s.playMomentum += Math.abs(e.clientY - s.prevClientY) * MOMENTUM_GAIN + acceleratedX * X_PLAYBACK_GAIN;
      }
      s.prevClientX = e.clientX;
      s.prevClientY = e.clientY;
      s.targetX = e.clientX;
      s.targetY = e.clientY;
      s.lastMoveTs = performance.now();
      s.idle = false;
    };

    const tick = () => {
      const s = stateRef.current;
      const now = performance.now();
      const isIdle = now - s.lastMoveTs > IDLE_TIMEOUT_MS;

      if (isIdle && !s.idle) s.idle = true;

      const targetOpacity = isIdle ? RESTING_OPACITY : ACTIVE_OPACITY;
      const fadeSpeed = isIdle ? IDLE_FADE_SPEED : ACTIVE_FADE_SPEED;
      s.opacity += (targetOpacity - s.opacity) * fadeSpeed;

      s.spinMomentum *= MOMENTUM_FRICTION;
      s.playMomentum *= MOMENTUM_FRICTION;

      if (!reducedMotionRef.current) {
        const dx = s.targetX - s.x;
        const dy = s.targetY - s.y;

        s.vx += dx * SPRING_STIFFNESS;
        s.vy += dy * SPRING_STIFFNESS;
        s.vx *= DAMPING;
        s.vy *= DAMPING;

        s.x += s.vx;
        s.y += s.vy;

        s.rotation += s.spinMomentum * ROTATION_FACTOR;
      } else {
        s.x += (s.targetX - s.x) * 0.15;
        s.y += (s.targetY - s.y) * 0.15;
      }

      const el = videoRef.current;
      if (el) {
        const half = DICE_SIZE / 2;
        el.style.transform = `translate(${s.x - half}px, ${s.y - half}px) rotate(${s.rotation}deg)`;
        el.style.opacity = s.opacity;
        const t = Math.min(s.playMomentum / SPEED_FOR_MAX_RATE, 1);
        el.playbackRate = MIN_PLAYBACK_RATE + t * (MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMove);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src="/video/dice.webm"
      className="dice-overlay-float"
      style={{ width: DICE_SIZE, height: DICE_SIZE, opacity: RESTING_OPACITY }}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
    />
  );
}
