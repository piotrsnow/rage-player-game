// Pixi helper — a tiny "!" bubble above an NPC for 1.5s on player bump.
//
// Usage:
//   const bubble = createBubble(parentContainer);
//   bubble.show({ text: '!', x, y, now });      // triggers fade-in
//   bubble.tick(now);                            // call each frame
//   bubble.destroy();

import { Container, Graphics, Text } from 'pixi.js';

const SHOW_MS = 1500;
const FADE_MS = 200;

export function createBubble(parent, { text = '!' } = {}) {
  const c = new Container();
  c.alpha = 0;
  c.visible = false;
  parent.addChild(c);

  const bg = new Graphics();
  c.addChild(bg);

  let label = null;
  try {
    label = new Text({
      text,
      style: { fill: 0x0a0a0a, fontSize: 18, fontWeight: '900' },
    });
    label.anchor.set(0.5, 0.5);
    c.addChild(label);
  } catch { /* text can fail on exotic runtimes; ignore */ }

  drawBg(bg, 26, 22, label?.text || text);
  if (label) {
    label.x = 0;
    label.y = -2;
  }

  let startedAt = 0;
  let endsAt = 0;

  function show({ x, y, now }) {
    c.visible = true;
    c.x = x;
    c.y = y;
    startedAt = now;
    endsAt = now + SHOW_MS;
  }

  function tick(now) {
    if (!c.visible) return;
    if (now >= endsAt + FADE_MS) {
      c.visible = false;
      c.alpha = 0;
      return;
    }
    if (now < startedAt + FADE_MS) {
      c.alpha = (now - startedAt) / FADE_MS;
    } else if (now > endsAt) {
      c.alpha = 1 - (now - endsAt) / FADE_MS;
    } else {
      c.alpha = 1;
    }
  }

  function destroy() {
    try { parent.removeChild(c); c.destroy({ children: true }); } catch { /* ignore */ }
  }

  return { show, tick, destroy, container: c };
}

function drawBg(g, w, h, _label) {
  g.clear();
  g.roundRect(-w / 2, -h / 2, w, h, 5);
  g.fill({ color: 0xfef3c7, alpha: 1 });
  g.stroke({ color: 0x111111, width: 2, alpha: 0.9 });
  // Tail
  g.moveTo(-4, h / 2 - 1);
  g.lineTo(0, h / 2 + 6);
  g.lineTo(4, h / 2 - 1);
  g.fill({ color: 0xfef3c7, alpha: 1 });
  g.stroke({ color: 0x111111, width: 2, alpha: 0.9 });
}
