/**
 * SceneRenderer — EffectEngine-compatible layer that renders a full
 * procedural 2D scene: sky, background silhouette, midground elements,
 * ground plane, characters, lighting, and combat overlay.
 *
 * Implements the standard layer interface: init, update, draw, destroy, resize.
 * Call setScene(config) to update the scene data; the renderer handles
 * animated crossfade transitions internally.
 */

import { SPRITE_DRAW, drawCharacter } from './sceneSprites';
import { getSkyPalette, BIOMES, LIGHT_PRESETS, GROUND_STYLES, BG_SILHOUETTE_TYPES } from './sceneData';

/* ------------------------------------------------------------------ */
/*  Seeded RNG (deterministic per scene)                               */
/* ------------------------------------------------------------------ */

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  SceneRenderer                                                      */
/* ------------------------------------------------------------------ */

export default class SceneRenderer {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.finished = false;

    this.config = null;
    this.elements = [];
    this.stars = [];
    this.clouds = [];
    this.characterSlots = [];

    // Scene transition state
    this._prevSnapshot = null;
    this._transitionAlpha = 1;
    this._transitioning = false;
    this._transitionDuration = 1.0;
  }

  /* ---------------------------------------------------------------- */
  /*  Public: set scene config                                         */
  /* ---------------------------------------------------------------- */

  setScene(config) {
    if (!config) return;

    const sceneChanged = this.config?.sceneId !== config.sceneId;

    if (sceneChanged && this.config && this._ctx) {
      this._captureSnapshot();
      this._transitioning = true;
      this._transitionAlpha = 0;
    }

    this.config = config;

    if (sceneChanged || this.elements.length === 0) {
      this._generateElements();
      this._generateSkyElements();
      this._layoutCharacters();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Layer interface                                                   */
  /* ---------------------------------------------------------------- */

  init(ctx, width, height) {
    this._ctx = ctx;
    this.width = width;
    this.height = height;
    if (this.config) {
      this._generateElements();
      this._generateSkyElements();
      this._layoutCharacters();
    }
  }

  update(dt) {
    this.time += dt;

    if (this._transitioning) {
      this._transitionAlpha = Math.min(1, this._transitionAlpha + dt / this._transitionDuration);
      if (this._transitionAlpha >= 1) {
        this._transitioning = false;
        this._prevSnapshot = null;
      }
    }
  }

  draw(ctx) {
    if (!this.config) return;

    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    // Draw previous scene snapshot underneath during transition
    if (this._transitioning && this._prevSnapshot) {
      ctx.save();
      ctx.globalAlpha = 1 - this._transitionAlpha;
      ctx.drawImage(this._prevSnapshot, 0, 0, w, h);
      ctx.restore();
    }

    ctx.save();
    if (this._transitioning) {
      ctx.globalAlpha = this._transitionAlpha;
    }

    this._drawSky(ctx, w, h);
    this._drawBackground(ctx, w, h);
    this._drawGround(ctx, w, h);
    this._drawElements(ctx, w, h);
    this._drawCharacters(ctx, w, h);
    this._drawLighting(ctx, w, h);
    if (this.config.combat?.active) {
      this._drawCombatOverlay(ctx, w, h);
    }

    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this.config) {
      this._generateElements();
      this._generateSkyElements();
      this._layoutCharacters();
    }
  }

  destroy() {
    this.config = null;
    this.elements = [];
    this.stars = [];
    this.clouds = [];
    this.characterSlots = [];
    this._prevSnapshot = null;
    this._ctx = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Sky                                                              */
  /* ---------------------------------------------------------------- */

  _drawSky(ctx, w, h) {
    const { biome, timeOfDay, weather } = this.config;
    const palette = getSkyPalette(this.config.biomeKey, timeOfDay, weather);
    const horizonY = h * (biome.horizonLine || 0.45);

    const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
    for (const stop of palette) {
      const [r, g, b] = stop.color;
      grad.addColorStop(stop.pos, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, horizonY);

    // Stars at night
    if (timeOfDay === 'night' && !biome.indoor) {
      for (const st of this.stars) {
        SPRITE_DRAW.star(ctx, st.x, st.y, st.scale, this.time);
      }
      // Moon
      const moonX = w * 0.75;
      const moonY = h * 0.1;
      SPRITE_DRAW.moon(ctx, moonX, moonY, 1.5, this.time);
    }

    // Clouds (day / dawn / dusk)
    if (!biome.indoor && timeOfDay !== 'night') {
      for (const cl of this.clouds) {
        SPRITE_DRAW.cloud(ctx, cl.x, cl.y, cl.scale, this.time);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Background silhouette                                            */
  /* ---------------------------------------------------------------- */

  _drawBackground(ctx, w, h) {
    const { biome, timeOfDay } = this.config;
    const horizonY = h * (biome.horizonLine || 0.45);
    const darkFactor = timeOfDay === 'night' ? 0.4 : timeOfDay === 'dusk' ? 0.7 : 1;
    const [br, bg, bb] = biome.bgColor;
    const col = `rgb(${Math.round(br * darkFactor)},${Math.round(bg * darkFactor)},${Math.round(bb * darkFactor)})`;

    ctx.fillStyle = col;

    switch (biome.bgSilhouette) {
      case BG_SILHOUETTE_TYPES.treeline:
        this._drawTreelineSilhouette(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.mountains:
        this._drawMountainSilhouette(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.cityscape:
        this._drawCityscapeSilhouette(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.caveCeiling:
        this._drawCaveCeiling(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.indoorWall:
        this._drawIndoorWall(ctx, w, h, col);
        break;
      case BG_SILHOUETTE_TYPES.seaHorizon:
        this._drawSeaHorizon(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.hills:
        this._drawHillsSilhouette(ctx, w, horizonY, col);
        break;
      case BG_SILHOUETTE_TYPES.ruins:
        this._drawRuinsSilhouette(ctx, w, horizonY, col);
        break;
      default:
        break;
    }
  }

  _drawTreelineSilhouette(ctx, w, horizonY, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    const step = w / 20;
    for (let x = 0; x <= w; x += step) {
      const treeH = 20 + Math.sin(x * 0.03 + 1) * 15 + Math.sin(x * 0.07) * 10;
      ctx.lineTo(x, horizonY - treeH);
      ctx.lineTo(x + step * 0.5, horizonY - treeH * 0.7);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  _drawMountainSilhouette(ctx, w, horizonY, col) {
    // Far range
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w * 0.1, horizonY - 60);
    ctx.lineTo(w * 0.25, horizonY - 100);
    ctx.lineTo(w * 0.4, horizonY - 70);
    ctx.lineTo(w * 0.55, horizonY - 120);
    ctx.lineTo(w * 0.7, horizonY - 80);
    ctx.lineTo(w * 0.85, horizonY - 110);
    ctx.lineTo(w, horizonY - 50);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Near range
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w * 0.05, horizonY - 30);
    ctx.lineTo(w * 0.15, horizonY - 55);
    ctx.lineTo(w * 0.3, horizonY - 35);
    ctx.lineTo(w * 0.45, horizonY - 65);
    ctx.lineTo(w * 0.6, horizonY - 40);
    ctx.lineTo(w * 0.75, horizonY - 60);
    ctx.lineTo(w * 0.9, horizonY - 30);
    ctx.lineTo(w, horizonY - 45);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  _drawCityscapeSilhouette(ctx, w, horizonY, col) {
    ctx.fillStyle = col;
    const rng = mulberry32(hashStr(this.config.sceneId + 'city'));
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    let cx = 0;
    while (cx < w) {
      const bw = 15 + rng() * 30;
      const bh = 20 + rng() * 60;
      ctx.lineTo(cx, horizonY - bh);
      // Roof variation
      if (rng() > 0.5) {
        ctx.lineTo(cx + bw / 2, horizonY - bh - 10 - rng() * 15);
        ctx.lineTo(cx + bw, horizonY - bh);
      } else {
        ctx.lineTo(cx + bw, horizonY - bh);
      }
      cx += bw;
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  _drawCaveCeiling(ctx, w, h, col) {
    const ceilingY = h * 0.15;
    // Ceiling fill
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, ceilingY + 20);

    // Stalactite edge
    ctx.beginPath();
    ctx.moveTo(0, ceilingY);
    const step = w / 15;
    for (let x = 0; x <= w; x += step) {
      const drop = 5 + Math.sin(x * 0.05 + 2) * 10 + Math.sin(x * 0.12) * 8;
      ctx.lineTo(x, ceilingY + drop);
      ctx.lineTo(x + step * 0.5, ceilingY + drop * 0.4);
    }
    ctx.lineTo(w, ceilingY);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    // Side walls
    const wallW = w * 0.05;
    ctx.fillRect(0, 0, wallW, h);
    ctx.fillRect(w - wallW, 0, wallW, h);
  }

  _drawIndoorWall(ctx, w, h, col) {
    // Back wall
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, h * 0.5);

    // Ceiling line with beam detail
    const beamY = h * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, w, beamY);

    // Beams
    const beamCount = 4;
    ctx.fillStyle = 'rgba(60,45,30,0.5)';
    for (let i = 0; i <= beamCount; i++) {
      const bx = (i / beamCount) * w;
      ctx.fillRect(bx - 3, 0, 6, h * 0.5);
    }
    ctx.fillRect(0, beamY - 3, w, 6);

    // Wainscoting
    const wainH = h * 0.06;
    const wainY = h * 0.5 - wainH;
    ctx.fillStyle = 'rgba(70,55,35,0.3)';
    ctx.fillRect(0, wainY, w, wainH);
  }

  _drawSeaHorizon(ctx, w, horizonY) {
    // Sea gradient
    const grad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 80);
    grad.addColorStop(0, 'rgba(40,80,120,0.8)');
    grad.addColorStop(1, 'rgba(30,60,90,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY - 2, w, 80);

    // Waves
    ctx.strokeStyle = 'rgba(120,170,220,0.2)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
      const wy = horizonY + 10 + row * 15;
      ctx.beginPath();
      for (let x = 0; x < w; x += 4) {
        const yy = wy + Math.sin((x + this.time * 20) * 0.03 + row) * 3;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  _drawHillsSilhouette(ctx, w, horizonY, col) {
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 4) {
      const y = horizonY - 15 - Math.sin(x * 0.008) * 20 - Math.sin(x * 0.02 + 1) * 10;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 4) {
      const y = horizonY - 5 - Math.sin(x * 0.012 + 2) * 12 - Math.sin(x * 0.03) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  _drawRuinsSilhouette(ctx, w, horizonY, col) {
    ctx.fillStyle = col;
    const rng = mulberry32(hashStr(this.config.sceneId + 'ruins'));
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    let cx = 0;
    while (cx < w) {
      const segW = 20 + rng() * 25;
      const segH = rng() > 0.4 ? 15 + rng() * 40 : 5 + rng() * 10;
      ctx.lineTo(cx, horizonY - segH);
      if (rng() > 0.6) {
        ctx.lineTo(cx + segW * 0.3, horizonY - segH - 5);
        ctx.lineTo(cx + segW * 0.5, horizonY - segH + 3);
      }
      ctx.lineTo(cx + segW, horizonY - segH * 0.3);
      cx += segW;
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------------------------------------------------------- */
  /*  Ground                                                           */
  /* ---------------------------------------------------------------- */

  _drawGround(ctx, w, h) {
    const { biome } = this.config;
    const ground = biome.ground || GROUND_STYLES.grass;
    const horizonY = h * (biome.horizonLine || 0.45);

    // Main ground gradient
    const [gr, gg, gb] = ground.base;
    const [hr, hg, hb] = ground.highlight;
    const grad = ctx.createLinearGradient(0, horizonY, 0, h);
    grad.addColorStop(0, `rgb(${hr},${hg},${hb})`);
    grad.addColorStop(1, `rgb(${gr},${gg},${gb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Ground detail patterns
    this._drawGroundDetail(ctx, w, h, horizonY, ground);
  }

  _drawGroundDetail(ctx, w, h, horizonY, ground) {
    const rng = mulberry32(hashStr((this.config.sceneId || '') + 'ground'));
    ctx.save();

    switch (ground.pattern) {
      case 'grass': {
        ctx.strokeStyle = 'rgba(60,90,30,0.15)';
        ctx.lineWidth = 0.8;
        ctx.lineCap = 'round';
        for (let i = 0; i < 60; i++) {
          const gx = rng() * w;
          const gy = horizonY + rng() * (h - horizonY) * 0.8 + (h - horizonY) * 0.1;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + (rng() - 0.5) * 4, gy - 3 - rng() * 4);
          ctx.stroke();
        }
        break;
      }
      case 'cobble': {
        ctx.strokeStyle = 'rgba(50,45,40,0.1)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 40; i++) {
          const gx = rng() * w;
          const gy = horizonY + rng() * (h - horizonY);
          const gr2 = 3 + rng() * 5;
          ctx.beginPath();
          ctx.arc(gx, gy, gr2, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'stone': {
        ctx.strokeStyle = 'rgba(50,45,40,0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 30; i++) {
          const gx = rng() * w;
          const gy = horizonY + rng() * (h - horizonY);
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + 5 + rng() * 10, gy + (rng() - 0.5) * 2);
          ctx.stroke();
        }
        break;
      }
      case 'planks': {
        ctx.strokeStyle = 'rgba(60,40,20,0.12)';
        ctx.lineWidth = 0.6;
        const plankH = 12;
        for (let py = horizonY; py < h; py += plankH) {
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(w, py);
          ctx.stroke();
        }
        break;
      }
      case 'water': {
        ctx.strokeStyle = 'rgba(80,120,160,0.12)';
        ctx.lineWidth = 0.8;
        for (let row = 0; row < 8; row++) {
          const wy = horizonY + (row + 1) * ((h - horizonY) / 9);
          ctx.beginPath();
          for (let x = 0; x < w; x += 5) {
            const yy = wy + Math.sin((x + this.time * 15) * 0.04 + row) * 2;
            x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
        break;
      }
      case 'sand': {
        ctx.fillStyle = 'rgba(180,160,120,0.06)';
        for (let i = 0; i < 50; i++) {
          const gx = rng() * w;
          const gy = horizonY + rng() * (h - horizonY);
          ctx.beginPath();
          ctx.arc(gx, gy, 0.5 + rng(), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
        break;
    }

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Midground elements                                               */
  /* ---------------------------------------------------------------- */

  _generateElements() {
    if (!this.config || this.width === 0) return;
    const { biome, sceneId } = this.config;
    const rng = mulberry32(hashStr(sceneId + 'elem'));
    const pool = biome.elements || [];
    if (pool.length === 0) { this.elements = []; return; }

    const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    const [minCount, maxCount] = biome.elementCount || [5, 10];
    const count = minCount + Math.floor(rng() * (maxCount - minCount + 1));

    const horizonY = this.height * (biome.horizonLine || 0.45);
    const groundH = this.height - horizonY;

    this.elements = [];
    for (let i = 0; i < count; i++) {
      // Weighted random selection
      let r = rng() * totalWeight;
      let picked = pool[0];
      for (const entry of pool) {
        r -= entry.weight;
        if (r <= 0) { picked = entry; break; }
      }

      const [minS, maxS] = picked.scaleRange;
      const sc = minS + rng() * (maxS - minS);

      // Distribute across ground area, avoiding center (character zone)
      let ex, ey;
      let attempts = 0;
      do {
        ex = rng() * this.width;
        ey = horizonY + rng() * groundH * 0.75 + groundH * 0.05;
        attempts++;
      } while (attempts < 10 && Math.abs(ex - this.width / 2) < this.width * 0.12);

      // Depth sorting: elements further from horizon appear in front
      const depth = (ey - horizonY) / groundH;

      this.elements.push({
        type: picked.type,
        x: ex,
        y: ey,
        scale: sc * (0.6 + depth * 0.6),
        depth,
      });
    }

    // Sort by depth (back to front)
    this.elements.sort((a, b) => a.depth - b.depth);
  }

  _drawElements(ctx, w, h) {
    for (const el of this.elements) {
      const drawFn = SPRITE_DRAW[el.type];
      if (drawFn) {
        ctx.save();
        ctx.globalAlpha = 0.6 + el.depth * 0.4;
        drawFn(ctx, el.x, el.y, el.scale, this.time);
        ctx.restore();
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Sky elements (stars, clouds)                                     */
  /* ---------------------------------------------------------------- */

  _generateSkyElements() {
    if (!this.config || this.width === 0) return;
    const { biome, sceneId } = this.config;
    const rng = mulberry32(hashStr(sceneId + 'sky'));
    const horizonY = this.height * (biome.horizonLine || 0.45);

    // Stars
    this.stars = [];
    if (!biome.indoor) {
      for (let i = 0; i < 50; i++) {
        this.stars.push({
          x: rng() * this.width,
          y: rng() * horizonY * 0.9,
          scale: 0.5 + rng() * 1.5,
        });
      }
    }

    // Clouds
    this.clouds = [];
    if (!biome.indoor) {
      for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
        this.clouds.push({
          x: rng() * this.width,
          y: horizonY * (0.1 + rng() * 0.5),
          scale: 0.8 + rng() * 1.2,
        });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Characters                                                       */
  /* ---------------------------------------------------------------- */

  _layoutCharacters() {
    if (!this.config || this.width === 0) return;
    const { biome, playerCharacter, npcs, combat } = this.config;
    const horizonY = this.height * (biome.horizonLine || 0.45);
    const charY = horizonY + (this.height - horizonY) * 0.45;

    this.characterSlots = [];
    const allChars = [];

    // Player at center
    allChars.push({
      ...playerCharacter,
      role: 'player',
      isPlayer: true,
    });

    // NPCs
    for (const npc of (npcs || [])) {
      allChars.push({
        name: npc.name,
        species: npc.species || 'Human',
        role: npc.role || 'neutral',
        weapon: null,
        isPlayer: false,
      });
    }

    // Combat combatants override
    if (combat?.active && combat.combatants?.length > 0) {
      const combatNames = new Set(combat.combatants.map((c) => c.name?.toLowerCase()));
      // Keep only combat-relevant characters
      const filtered = allChars.filter((c) =>
        c.isPlayer || combatNames.has(c.name?.toLowerCase())
      );
      if (filtered.length > 0) {
        allChars.length = 0;
        allChars.push(...filtered);
      }
    }

    const total = allChars.length;
    const spacing = Math.min(this.width / (total + 1), 100);
    const startX = (this.width - spacing * (total - 1)) / 2;

    for (let i = 0; i < total; i++) {
      const c = allChars[i];
      const combatant = combat?.combatants?.find(
        (cb) => cb.name?.toLowerCase() === c.name?.toLowerCase()
      );

      this.characterSlots.push({
        x: startX + i * spacing,
        y: charY,
        scale: c.isPlayer ? 0.9 : 0.75,
        name: c.name,
        species: c.species || 'Human',
        role: c.role,
        weapon: c.weapon,
        isActive: combatant?.isActive || false,
        healthPct: combatant ? (combatant.wounds / Math.max(1, combatant.maxWounds)) : 1,
      });
    }
  }

  _drawCharacters(ctx) {
    for (const slot of this.characterSlots) {
      drawCharacter(ctx, slot.x, slot.y, slot.scale, {
        species: slot.species,
        role: slot.role,
        name: slot.name,
        weapon: slot.weapon,
        isActive: slot.isActive,
        healthPct: slot.healthPct,
        time: this.time,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Lighting                                                         */
  /* ---------------------------------------------------------------- */

  _drawLighting(ctx, w, h) {
    const { biome, timeOfDay } = this.config;
    const lightNames = biome.lights?.[timeOfDay] || [];

    ctx.save();

    for (let i = 0; i < lightNames.length; i++) {
      const preset = LIGHT_PRESETS[lightNames[i]];
      if (!preset) continue;

      const [lr, lg, lb] = preset.color;
      let intensity = preset.intensity;
      if (preset.flicker) {
        intensity *= 0.8 + 0.2 * Math.sin(this.time * 8 + i * 5) *
          Math.sin(this.time * 13 + i * 3);
      }

      let lx, ly;
      if (lightNames[i] === 'sun') {
        lx = w * 0.3;
        ly = h * preset.y;
      } else if (lightNames[i] === 'moon') {
        lx = w * 0.75;
        ly = h * preset.y;
      } else if (lightNames[i] === 'fireplace') {
        lx = w * 0.15;
        ly = h * 0.6;
      } else if (lightNames[i] === 'campfire') {
        lx = w * 0.5;
        ly = h * 0.65;
      } else {
        // Distribute other lights (torches, candles) along upper walls
        const t = lightNames.filter((n, j) => j <= i && n === lightNames[i]).length;
        lx = w * (0.2 + t * 0.25);
        ly = h * 0.35;
      }

      const radius = Math.max(w, h) * preset.radius;
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
      grad.addColorStop(0, `rgba(${lr},${lg},${lb},${intensity * 0.5})`);
      grad.addColorStop(0.5, `rgba(${lr},${lg},${lb},${intensity * 0.15})`);
      grad.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(lx - radius, ly - radius, radius * 2, radius * 2);
    }

    ctx.globalCompositeOperation = 'source-over';

    // Global ambient darkening for night
    if (timeOfDay === 'night' && !biome.indoor) {
      ctx.fillStyle = 'rgba(0,0,15,0.25)';
      ctx.fillRect(0, 0, w, h);
    } else if (timeOfDay === 'dusk') {
      ctx.fillStyle = 'rgba(20,10,30,0.1)';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Combat overlay                                                   */
  /* ---------------------------------------------------------------- */

  _drawCombatOverlay(ctx, w, h) {
    const { combat } = this.config;
    if (!combat?.active) return;

    // Pulsing red border
    const pulse = 0.3 + 0.15 * Math.sin(this.time * 3);
    ctx.save();
    ctx.strokeStyle = `rgba(200,50,50,${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Round indicator
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(w - 80, 6, 74, 22);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#e05050';
    ctx.textAlign = 'right';
    ctx.fillText(`Round ${combat.round || 1}`, w - 12, 22);

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Transition helpers                                               */
  /* ---------------------------------------------------------------- */

  _captureSnapshot() {
    if (!this._ctx || this.width === 0) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = this.width;
    offscreen.height = this.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.drawImage(this._ctx.canvas, 0, 0);
    this._prevSnapshot = offscreen;
  }
}
