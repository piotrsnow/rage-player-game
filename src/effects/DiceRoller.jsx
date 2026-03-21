import { useRef, useEffect, useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Design-system colours                                              */
/* ------------------------------------------------------------------ */

const COLORS = {
  primary:    [197, 154, 255],
  primaryDim: [149,  71, 247],
  tertiary:   [255, 239, 213],
  error:      [255, 110, 132],
  surface:    [ 14,  14,  16],
  white:      [255, 251, 254],
  orange:     [255, 180,  80],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutBounce(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75;
  return 7.5625 * t * t + 0.984375;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/* ------------------------------------------------------------------ */
/*  Burst particle system                                              */
/* ------------------------------------------------------------------ */

function createBurstParticles(cx, cy, count, success) {
  const particles = [];
  const baseColors = success
    ? [COLORS.primary, COLORS.tertiary, COLORS.primaryDim]
    : [COLORS.error, COLORS.orange];

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 180);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(1.5, 4),
      color: pick(baseColors),
      alpha: 1,
      life: rand(0.5, 1.2),
      age: 0,
    });
  }
  return particles;
}

function updateBurstParticles(particles, dt) {
  for (const p of particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 80 * dt;
    p.vx *= 0.98;
    const t = p.age / p.life;
    p.alpha = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.8);
  }
  return particles.filter((p) => p.age < p.life);
}

function drawBurstParticles(ctx, particles) {
  for (const p of particles) {
    if (p.alpha <= 0) continue;
    const [r, g, b] = p.color;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size + 6);
    grad.addColorStop(0, `rgba(${r},${g},${b},${p.alpha * 0.9})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${p.alpha * 0.3})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - p.size - 6, p.y - p.size - 6, (p.size + 6) * 2, (p.size + 6) * 2);
  }
}

/* ------------------------------------------------------------------ */
/*  Fake-3D cube projection (2D transforms)                            */
/* ------------------------------------------------------------------ */

const CUBE_FACES = [
  { offset: [0, 0, 1],  axis: 'z' },
  { offset: [0, 0, -1], axis: 'z' },
  { offset: [1, 0, 0],  axis: 'x' },
  { offset: [-1, 0, 0], axis: 'x' },
  { offset: [0, 1, 0],  axis: 'y' },
  { offset: [0, -1, 0], axis: 'y' },
];

function rotatePoint(x, y, z, rx, ry) {
  let y1 = y * Math.cos(rx) - z * Math.sin(rx);
  let z1 = y * Math.sin(rx) + z * Math.cos(rx);
  let x1 = x * Math.cos(ry) + z1 * Math.sin(ry);
  let z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  return [x1, y1, z2];
}

function project(x, y, z, cx, cy, fov) {
  const scale = fov / (fov + z);
  return [cx + x * scale, cy + y * scale, scale];
}

function drawCubeFace(ctx, cx, cy, size, rx, ry, faceIdx, text, fov) {
  const face = CUBE_FACES[faceIdx];
  const [nx, ny, nz] = rotatePoint(face.offset[0], face.offset[1], face.offset[2], rx, ry);
  if (nz < -0.05) return;

  const half = size / 2;
  const corners = [
    [-half, -half], [half, -half], [half, half], [-half, half],
  ];

  const projected = corners.map(([u, v]) => {
    let px, py, pz;
    if (face.axis === 'z') {
      px = u; py = v; pz = face.offset[2] * half;
    } else if (face.axis === 'x') {
      px = face.offset[0] * half; py = v; pz = u * face.offset[0];
    } else {
      px = u; py = face.offset[1] * half; pz = v * face.offset[1];
    }
    const [rx2, ry2, rz2] = rotatePoint(px, py, pz, rx, ry);
    return project(rx2, ry2, rz2, cx, cy, fov);
  });

  const brightness = 0.4 + nz * 0.6;
  const r = Math.round(14 + brightness * 20);
  const g = Math.round(14 + brightness * 18);
  const b = Math.round(16 + brightness * 22);

  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < projected.length; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(197,154,255,${0.15 + brightness * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const centerX = projected.reduce((s, p) => s + p[0], 0) / 4;
  const centerY = projected.reduce((s, p) => s + p[1], 0) / 4;
  const avgScale = projected.reduce((s, p) => s + p[2], 0) / 4;

  ctx.save();
  ctx.globalAlpha = Math.min(1, brightness * 1.2);
  ctx.font = `bold ${Math.round(size * 0.38 * avgScale)}px "Cinzel", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,239,213,${brightness})`;
  ctx.shadowColor = 'rgba(197,154,255,0.6)';
  ctx.shadowBlur = 6 * avgScale;
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Animation phases                                                   */
/* ------------------------------------------------------------------ */

const PHASE_SPIN = 0;
const PHASE_SETTLE = 1;
const PHASE_BURST = 2;
const PHASE_IDLE = 3;

const SPIN_DURATION = 1.0;
const SETTLE_DURATION = 0.6;
const BURST_DURATION = 0.5;

/* ------------------------------------------------------------------ */
/*  DiceRoller React component                                         */
/* ------------------------------------------------------------------ */

export default function DiceRoller({ diceRoll, onComplete }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [showResult, setShowResult] = useState(false);

  const startAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !diceRoll) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const syncSize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: rect.width, h: rect.height };
    };

    let { w, h } = syncSize();

    const slotNumbers = [];
    for (let i = 0; i < 40; i++) {
      slotNumbers.push(Math.floor(rand(1, 21)));
    }
    slotNumbers.push(diceRoll.roll);

    let phase = PHASE_SPIN;
    let elapsed = 0;
    let burstParticles = [];
    let glowRadius = 0;
    let lastTime = performance.now();

    const fov = 300;
    const cubeSize = Math.min(w, h) * 0.32;

    const draw = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      if (phase === PHASE_SPIN) {
        const t = Math.min(elapsed / SPIN_DURATION, 1);
        const spinSpeed = lerp(12, 2, easeOutCubic(t));
        const rx = elapsed * spinSpeed;
        const ry = elapsed * spinSpeed * 0.7;

        const slotIdx = Math.min(Math.floor(t * slotNumbers.length), slotNumbers.length - 1);
        const displayNum = String(slotNumbers[slotIdx]);

        for (let i = 0; i < 6; i++) {
          drawCubeFace(ctx, cx, cy, cubeSize, rx, ry, i, displayNum, fov);
        }

        if (t >= 1) {
          phase = PHASE_SETTLE;
          elapsed = 0;
        }
      } else if (phase === PHASE_SETTLE) {
        const t = Math.min(elapsed / SETTLE_DURATION, 1);
        const bounceT = easeOutBounce(t);

        const targetRx = 0.3;
        const targetRy = -0.2;
        const startRx = 4;
        const startRy = 3;

        const rx = lerp(startRx, targetRx, bounceT);
        const ry = lerp(startRy, targetRy, bounceT);
        const displayNum = String(diceRoll.roll);

        const scale = 1 + (1 - bounceT) * 0.15;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        for (let i = 0; i < 6; i++) {
          drawCubeFace(ctx, cx, cy, cubeSize, rx, ry, i, displayNum, fov);
        }
        ctx.restore();

        if (t >= 1) {
          phase = PHASE_BURST;
          elapsed = 0;
          burstParticles = createBurstParticles(cx, cy, 50, diceRoll.success);
          setShowResult(true);
        }
      } else if (phase === PHASE_BURST) {
        const t = Math.min(elapsed / BURST_DURATION, 1);

        for (let i = 0; i < 6; i++) {
          drawCubeFace(ctx, cx, cy, cubeSize, 0.3, -0.2, i, String(diceRoll.roll), fov);
        }

        burstParticles = updateBurstParticles(burstParticles, dt);
        drawBurstParticles(ctx, burstParticles);

        glowRadius = easeOutCubic(t) * Math.max(w, h) * 0.5;
        const [gr, gg, gb] = diceRoll.success ? COLORS.primary : COLORS.error;
        const glowAlpha = (1 - t) * 0.25;
        const grd = ctx.createRadialGradient(cx, cy, cubeSize * 0.3, cx, cy, glowRadius);
        grd.addColorStop(0, `rgba(${gr},${gg},${gb},${glowAlpha})`);
        grd.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);

        if (t >= 1) {
          phase = PHASE_IDLE;
          elapsed = 0;
          if (onComplete) onComplete();
        }
      } else {
        for (let i = 0; i < 6; i++) {
          drawCubeFace(ctx, cx, cy, cubeSize, 0.3, -0.2, i, String(diceRoll.roll), fov);
        }

        const pulse = 0.5 + Math.sin(elapsed * 2) * 0.5;
        const [gr, gg, gb] = diceRoll.success ? COLORS.primary : COLORS.error;
        const grd = ctx.createRadialGradient(cx, cy, cubeSize * 0.3, cx, cy, cubeSize * 1.5);
        grd.addColorStop(0, `rgba(${gr},${gg},${gb},${pulse * 0.08})`);
        grd.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [diceRoll, onComplete]);

  useEffect(() => {
    setShowResult(false);
    const cleanup = startAnimation();
    return () => {
      if (cleanup) cleanup();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [startAnimation]);

  if (!diceRoll) return null;

  return (
    <div className="relative w-full" style={{ height: 120 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
      {showResult && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center animate-fade-in pointer-events-none">
          <div className="text-center">
            <p
              className={`text-xs font-bold tracking-widest uppercase ${
                diceRoll.success ? 'text-primary' : 'text-error'
              }`}
            >
              {diceRoll.success ? '✦ ' : '✧ '}
              {diceRoll.total}
              {diceRoll.success ? ' ✦' : ' ✧'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
