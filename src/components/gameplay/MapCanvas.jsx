import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { forceDirectedLayout } from '../../services/graphLayout';
import { generateMapDecorations, drawDecorations } from '../../services/mapSprites';

const MOD_ICONS = { trap: '\u26A0', destruction: '\uD83D\uDCA5', discovery: '\u2728', obstacle: '\uD83E\uDEA8', other: '\u25CF' };

export default function MapCanvas({ mapState, currentLocation, connections }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 500, h: 350 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const animFrame = useRef(0);

  const locs = useMemo(() => mapState || [], [mapState]);
  const conns = useMemo(() => connections || [], [connections]);

  const nodeNames = useMemo(() => {
    const names = new Set(locs.map((l) => l.name));
    if (currentLocation) names.add(currentLocation);
    conns.forEach((c) => { names.add(c.from); names.add(c.to); });
    return [...names];
  }, [locs, conns, currentLocation]);

  const normEdges = useMemo(() => {
    return conns.map((c) => ({
      from: nodeNames.find((n) => n.toLowerCase() === c.from.toLowerCase()) || c.from,
      to: nodeNames.find((n) => n.toLowerCase() === c.to.toLowerCase()) || c.to,
    }));
  }, [conns, nodeNames]);

  const positions = useMemo(
    () => forceDirectedLayout(nodeNames, normEdges, { width: size.w, height: size.h }),
    [nodeNames, normEdges, size.w, size.h]
  );

  const locMap = useMemo(() => {
    const m = new Map();
    locs.forEach((l) => m.set(l.name.toLowerCase(), l));
    return m;
  }, [locs]);

  const decorations = useMemo(
    () => generateMapDecorations(nodeNames, positions, locMap, normEdges, size.w, size.h),
    [nodeNames, positions, locMap, normEdges, size.w, size.h]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toScreen = useCallback((wx, wy) => {
    return {
      x: (wx + camera.x) * camera.zoom + size.w / 2,
      y: (wy + camera.y) * camera.zoom + size.h / 2,
    };
  }, [camera, size]);

  const toWorld = useCallback((sx, sy) => {
    return {
      x: (sx - size.w / 2) / camera.zoom - camera.x,
      y: (sy - size.h / 2) / camera.zoom - camera.y,
    };
  }, [camera, size]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, size.w, size.h);

    drawParchmentTexture(ctx, size.w, size.h);

    ctx.save();
    ctx.translate(size.w / 2, size.h / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(camera.x, camera.y);

    drawDecorations(ctx, decorations);

    for (const edge of normEdges) {
      const pa = positions.get(edge.from);
      const pb = positions.get(edge.to);
      if (!pa || !pb) continue;
      drawEdge(ctx, pa, pb);
    }

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    for (const name of nodeNames) {
      const p = positions.get(name);
      if (!p) continue;
      const isCurrent = name.toLowerCase() === currentLocation?.toLowerCase();
      const isHov = name === hovered;
      const loc = locMap.get(name.toLowerCase());
      drawNode(ctx, p, name, isCurrent, isHov, pulse, loc);
    }

    ctx.restore();

    if (hovered && positions.has(hovered)) {
      const loc = locMap.get(hovered.toLowerCase());
      drawTooltip(ctx, mousePos, hovered, loc, size);
    }
  }, [size, camera, positions, normEdges, nodeNames, currentLocation, hovered, mousePos, locMap, decorations]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      animFrame.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; cancelAnimationFrame(animFrame.current); };
  }, [draw]);

  const handlePointerDown = useCallback((e) => {
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setMousePos({ x: sx, y: sy });

    if (dragging.current) {
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setCamera((c) => ({ ...c, x: c.x + dx / c.zoom, y: c.y + dy / c.zoom }));
      return;
    }

    const wp = toWorld(sx, sy);
    let closest = null;
    let closestDist = 24 / camera.zoom;
    for (const name of nodeNames) {
      const p = positions.get(name);
      if (!p) continue;
      const d = Math.hypot(wp.x - p.x, wp.y - p.y);
      if (d < closestDist) { closestDist = d; closest = name; }
    }
    setHovered(closest);
  }, [nodeNames, positions, camera, toWorld]);

  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setCamera((c) => ({ ...c, zoom: Math.min(4, Math.max(0.3, c.zoom * factor)) }));
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[250px] relative rounded-sm overflow-hidden border border-outline-variant/10">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ display: 'block' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { dragging.current = false; setHovered(null); }}
      />
    </div>
  );
}

function drawParchmentTexture(ctx, w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(45,36,28,0.95)');
  grad.addColorStop(1, 'rgba(25,20,15,0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 2 + 0.5;
    ctx.fillStyle = Math.random() > 0.5 ? '#c9a96e' : '#3a2f24';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEdge(ctx, a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const off = Math.min(Math.hypot(dx, dy) * 0.15, 30);
  const cx = mx + (dy > 0 ? off : -off);
  const cy = my + (dx > 0 ? -off : off);

  ctx.save();
  ctx.strokeStyle = 'rgba(160,130,90,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cx, cy, b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawNode(ctx, pos, name, isCurrent, isHovered, pulse, loc) {
  const r = isCurrent ? 16 : 12;

  if (isCurrent) {
    const glowR = r + 10 + pulse * 6;
    const glow = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, glowR);
    glow.addColorStop(0, 'rgba(217,170,90,0.35)');
    glow.addColorStop(1, 'rgba(217,170,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = isCurrent ? 'rgba(160,120,50,0.9)' : 'rgba(100,80,55,0.7)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  const inner = ctx.createRadialGradient(pos.x - 2, pos.y - 2, 0, pos.x, pos.y, r);
  if (isCurrent) {
    inner.addColorStop(0, '#f0d48a');
    inner.addColorStop(1, '#c49a3c');
  } else if (isHovered) {
    inner.addColorStop(0, '#d4b87a');
    inner.addColorStop(1, '#9a7d4a');
  } else {
    inner.addColorStop(0, '#8a7558');
    inner.addColorStop(1, '#5c4d38');
  }
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.strokeStyle = isCurrent ? '#e8c868' : 'rgba(140,115,75,0.6)';
  ctx.lineWidth = isCurrent ? 2 : 1;
  ctx.stroke();

  if (loc?.modifications?.length > 0) {
    const types = [...new Set(loc.modifications.map((m) => m.type))];
    types.slice(0, 3).forEach((type, i) => {
      const angle = -Math.PI / 2 + (i - (types.length - 1) / 2) * 0.6;
      const bx = pos.x + (r + 8) * Math.cos(angle);
      const by = pos.y + (r + 8) * Math.sin(angle);
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = type === 'trap' ? '#e8a040' : type === 'destruction' ? '#d05050' : '#70b870';
      ctx.fillText(MOD_ICONS[type] || MOD_ICONS.other, bx, by);
    });
  }

  ctx.font = `${isCurrent ? 'bold ' : ''}11px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = isCurrent ? '#f0d48a' : 'rgba(190,170,140,0.9)';
  ctx.strokeStyle = 'rgba(20,16,12,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeText(name, pos.x, pos.y + r + 6);
  ctx.fillText(name, pos.x, pos.y + r + 6);
}

function drawTooltip(ctx, mouse, name, loc, size) {
  const lines = [name];
  if (loc?.description) lines.push(loc.description);
  if (loc?.modifications?.length > 0) {
    loc.modifications.forEach((m) => {
      lines.push(`${MOD_ICONS[m.type] || '•'} [${m.type}] ${m.description}`);
    });
  }

  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  const lineHeight = 16;
  const pad = 8;
  const maxW = Math.min(280, size.w * 0.6);
  const wrapped = [];
  for (const line of lines) {
    const words = line.split(' ');
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW - pad * 2) {
        if (cur) wrapped.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) wrapped.push(cur);
  }

  const tw = Math.min(maxW, Math.max(...wrapped.map((l) => ctx.measureText(l).width)) + pad * 2);
  const th = wrapped.length * lineHeight + pad * 2;

  let tx = mouse.x + 14;
  let ty = mouse.y - th - 8;
  if (tx + tw > size.w - 4) tx = mouse.x - tw - 14;
  if (ty < 4) ty = mouse.y + 18;

  ctx.fillStyle = 'rgba(30,24,18,0.92)';
  ctx.strokeStyle = 'rgba(160,130,90,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, tx, ty, tw, th, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d4c4a0';
  wrapped.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 11px "Segoe UI", system-ui, sans-serif' : '11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(line, tx + pad, ty + pad + i * lineHeight);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
