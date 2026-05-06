// PlayCanvas — renders a saved MapDoc as an interactive walk-test:
//   - Tile layers (ground/overlay/objects) via shared renderTileLayers.
//   - Player actor sprite, controlled with WASD/arrows, respecting
//     MapDoc.collision and NPC positions.
//   - NPC actors placed by `npcMatcher`; they show "!" bubbles when the
//     player tries to step into their cell.
//
// All composition happens in the browser: each MapActor's appearance is
// funnelled through chargen/compose.js → HTMLCanvasElement, which Pixi
// consumes as a texture source. Actor frames are sliced at render time
// from the composed sheet using the LPC animation manifest.

import React, { useEffect, useRef, useState } from 'react';
import {
  Application, Assets, Container, Graphics, Rectangle, Sprite, Texture,
} from 'pixi.js';
import { api, mediaUrlForKey } from '../services/api.js';
import Spinner from '../ui/Spinner.jsx';
import { composeSheet } from '../chargen/compose.js';
import { frameAt, getAnimation } from '../chargen/animFrames.js';
import {
  buildPaletteFromPacks, decodeCollision, decodeLayers, renderTileLayers,
} from '../engine/renderTileLayers.js';
import { findPlayerStart, matchActorsToPlaces } from './npcMatcher.js';
import {
  animIdFor, createPlayerState, playerPixelPos, tickPlayer,
} from './playerController.js';
import { createBubble } from './speechBubble.js';

const LAYER_NAMES = ['ground', 'overlay', 'objects'];

const KEY_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', W: 'up',
  s: 'down', S: 'down',
  a: 'left', A: 'left',
  d: 'right', D: 'right',
};

export default function PlayCanvas({ mapDoc, actors, playerActor, manifest }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState('Booting play mode…');
  const [warn, setWarn] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let app = null;
    let cleanup = () => {};

    (async () => {
      try {
        setStatus('Loading tilesets…');
        const [cols, rows] = Array.isArray(mapDoc.size) ? mapDoc.size : [32, 24];
        const tsize = mapDoc.projectTilesize || 24;
        const cellSize = tsize;

        const { palette, paletteByKey, textureUrls } = await buildPaletteFromPacks({
          api, packIds: mapDoc.packIds || [], projectTilesize: tsize, mediaUrlForKey,
        });
        if (cancelled) return;

        const layers = decodeLayers({ mapDoc, layerNames: LAYER_NAMES, paletteByKey, cols, rows });
        const collision = decodeCollision({ mapDoc, cols, rows });

        setStatus('Loading textures…');
        const textures = new Map();
        for (const [key, url] of Object.entries(textureUrls)) {
          try {
            const tex = await Assets.load(url);
            tex.source.scaleMode = 'nearest';
            textures.set(key, tex);
          } catch (err) {
            console.error('play: texture load failed', key, err);
          }
          if (cancelled) return;
        }

        setStatus('Composing actors…');
        // Compose player sheet + all enabled NPC sheets.
        const playerSheet = await composeSheet(playerActor.appearance, { manifest });
        if (cancelled) return;
        if (playerSheet.warnings.length) console.warn('player:', playerSheet.warnings);

        const mapNpcs = (mapDoc.meta && mapDoc.meta.npcs) || [];
        const npcAssignments = matchActorsToPlaces({
          objects: mapDoc.objects || [], mapNpcs, actors,
        });
        // Compose NPC sheets sequentially — each composeSheet is CPU-heavy
        // (ImageData decode + per-pixel palette map) and running them in
        // parallel with Promise.all pegs the main thread and balloons
        // peak memory on maps with many NPCs.
        const npcSheets = [];
        for (const n of npcAssignments) {
          const sheet = await composeSheet(n.actor.appearance, { manifest });
          if (cancelled) return;
          npcSheets.push(sheet);
        }

        setStatus('Starting canvas…');
        app = new Application();
        await app.init({
          width: Math.max(1, cols * cellSize),
          height: Math.max(1, rows * cellSize),
          background: 0x0a0a0a,
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        if (cancelled) { app.destroy(true); return; }
        host.innerHTML = '';
        host.appendChild(app.canvas);
        app.canvas.style.imageRendering = 'pixelated';
        app.canvas.style.display = 'block';
        app.canvas.tabIndex = 0;

        const world = new Container();
        app.stage.addChild(world);
        const layerContainers = {};
        for (const name of LAYER_NAMES) {
          const c = new Container();
          world.addChild(c);
          layerContainers[name] = c;
        }
        const actorContainer = new Container();
        world.addChild(actorContainer);
        const bubbleLayer = new Container();
        world.addChild(bubbleLayer);

        renderTileLayers({
          containers: layerContainers, layerNames: LAYER_NAMES,
          layers, palette, textures, cols, rows, cellSize, tsize,
        });

        // ── actor sprites ────────────────────────────────────────────
        const animMap = manifest.anim;

        const playerTexSource = Texture.from(playerSheet.canvas).source;
        const playerSprite = makeActorSprite(playerTexSource);
        actorContainer.addChild(playerSprite.container);

        const startCell = findPlayerStart(mapDoc.objects || []) || firstWalkable(collision, cols, rows);
        let playerState = createPlayerState(startCell);

        const npcSprites = [];
        npcAssignments.forEach((assignment, i) => {
          const sheet = npcSheets[i];
          if (!sheet) return;
          if (sheet.warnings.length) console.warn('npc:', sheet.warnings);
          const texSource = Texture.from(sheet.canvas).source;
          const sprite = makeActorSprite(texSource);
          actorContainer.addChild(sprite.container);
          const bubble = createBubble(bubbleLayer);
          npcSprites.push({
            sprite, bubble,
            x: assignment.x, y: assignment.y, dir: assignment.dir,
            startAt: performance.now(),
          });
        });

        // ── input ────────────────────────────────────────────────────
        const input = { up: false, down: false, left: false, right: false };
        function onKeyDown(e) {
          const k = KEY_MAP[e.key];
          if (!k) return;
          input[k] = true;
          e.preventDefault();
        }
        function onKeyUp(e) {
          const k = KEY_MAP[e.key];
          if (!k) return;
          input[k] = false;
        }
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // Focus the canvas so arrow keys route there (helps on Firefox
        // which doesn't send them to document if something else has focus).
        app.canvas.focus();

        // ── game loop ────────────────────────────────────────────────
        const loopStart = performance.now();
        function isBlocked(x, y) {
          if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
          if (collision[y * cols + x]) return true;
          for (const n of npcSprites) {
            if (n.x === x && n.y === y) return true;
          }
          return false;
        }
        function triggerNpcBubble(x, y, now) {
          for (const n of npcSprites) {
            if (n.x === x && n.y === y) {
              // Face the NPC toward the player (opposite of player's dir).
              const opposite = oppositeDir(playerState.dir);
              n.dir = opposite;
              n.bubble.show({
                x: x * cellSize + cellSize / 2,
                y: y * cellSize - cellSize * 0.3,
                now,
              });
            }
          }
        }

        const ticker = (ticker) => {
          const now = performance.now();
          playerState = tickPlayer(playerState, input, now, {
            canMoveTo: (nx, ny) => !isBlocked(nx, ny),
            onBlocked: (nx, ny) => triggerNpcBubble(nx, ny, now),
          });

          // Player draw
          const playerAnim = getAnimation(animMap, animIdFor(playerState));
          const { px, py } = playerPixelPos(playerState, now, cellSize);
          drawActorFrame(playerSprite, playerAnim, now - loopStart, px, py, cellSize);

          // NPC draw (all idle)
          for (const n of npcSprites) {
            const a = getAnimation(animMap, `idle_${n.dir}`);
            drawActorFrame(n.sprite, a, now - n.startAt, n.x * cellSize, n.y * cellSize, cellSize);
            n.bubble.tick(now);
          }

          // Camera — centre on player, clamp to map bounds.
          const viewW = app.renderer.width / app.renderer.resolution;
          const viewH = app.renderer.height / app.renderer.resolution;
          const targetX = Math.max(0, Math.min(cols * cellSize - viewW,
            px + cellSize / 2 - viewW / 2));
          const targetY = Math.max(0, Math.min(rows * cellSize - viewH,
            py + cellSize / 2 - viewH / 2));
          world.x = -Math.round(targetX);
          world.y = -Math.round(targetY);
        };
        app.ticker.add(ticker);

        setStatus('');

        cleanup = () => {
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          try { app.ticker.remove(ticker); } catch { /* ignore */ }
          try { app.destroy(true, { children: true }); } catch { /* ignore */ }
        };
      } catch (err) {
        console.error(err);
        if (!cancelled) setWarn(err.message);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      if (host) host.innerHTML = '';
    };
  }, [mapDoc.id, playerActor.id, manifest, actors]);

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={hostRef}
        className="w-full h-full flex items-center justify-center overflow-hidden bg-surface-container-lowest"
      />
      {(status || warn) && (
        <div
          className={`absolute top-2.5 left-2.5 right-2.5 px-2.5 py-1.5 text-xs rounded-sm pointer-events-none flex items-center gap-2 backdrop-blur border ${
            warn
              ? 'bg-error/30 text-error border-error/40'
              : 'glass-panel text-on-surface border-outline-variant/30'
          }`}
        >
          {!warn && <Spinner size={12} />}
          <span>{warn ? `Play error: ${warn}` : status}</span>
        </div>
      )}
    </div>
  );
}

// LPC sheets are 832×1344 with frames at 64×64. Each frame is centred on
// a 32-pixel-tall "ground" cell. We render actors at 2× cellSize height
// so the character's feet roughly align with the cell bottom.
function makeActorSprite(source) {
  const container = new Container();
  const sprite = new Sprite();
  container.addChild(sprite);
  return { container, sprite, source };
}

function drawActorFrame(actor, anim, elapsedMs, px, py, cellSize) {
  if (!anim) return;
  const { frame } = frameAt(anim, elapsedMs);
  if (!frame) return;
  const [sx, sy, fw, fh, ax, ay] = frame;
  const frameRect = new Rectangle(sx, sy, fw, fh);
  actor.sprite.texture = new Texture({ source: actor.source, frame: frameRect });
  // LPC frames are 64×64 with anchor (ax, ay) marking the character's feet.
  // Render characters at 2× cellSize height so a 24-px tile fits a ~48-px
  // tall character — feels proportional, matches typical LPC tilemap scale.
  const scale = (cellSize * 2) / 64;
  actor.sprite.scale.set(scale);
  const anchorX = ax ?? fw / 2;
  const anchorY = ay ?? fh - 4;
  actor.container.x = px + cellSize / 2 - anchorX * scale;
  actor.container.y = py + cellSize - anchorY * scale;
}

function firstWalkable(collision, cols, rows) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!collision[y * cols + x]) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function oppositeDir(dir) {
  switch (dir) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
    default: return 'down';
  }
}
