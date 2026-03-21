/**
 * Core animation engine that manages a canvas overlay and composes
 * multiple effect layers (particles, fog, weather, transitions, etc.).
 *
 * Each layer must implement: init(ctx, width, height), update(dt),
 * draw(ctx), and destroy().
 */
export default class EffectEngine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layers = [];
    this.running = false;
    this.rafId = null;
    this.lastTime = 0;
    this.intensity = 1;

    this._resizeObserver = new ResizeObserver(this._handleResize);
    this._resizeObserver.observe(canvas.parentElement ?? canvas);
    this._syncSize();
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Replace all active layers with a new set.
   * Destroys previous layers, initialises new ones, and starts the loop
   * if it isn't running already.
   *
   * @param {Array<{ init, update, draw, destroy }>} newLayers
   */
  setEffects(newLayers) {
    this._destroyLayers();
    this.layers = newLayers;

    const { width, height } = this.canvas;
    for (const layer of this.layers) {
      layer.init(this.ctx, width, height);
    }

    if (this.layers.length > 0 && !this.running) {
      this.start();
    } else if (this.layers.length === 0) {
      this.stop();
    }
  }

  /** Append a single layer without replacing the existing set. */
  addLayer(layer) {
    layer.init(this.ctx, this.canvas.width, this.canvas.height);
    this.layers.push(layer);
    if (!this.running) this.start();
  }

  /** Remove and destroy a specific layer instance. */
  removeLayer(layer) {
    const idx = this.layers.indexOf(layer);
    if (idx !== -1) {
      this.layers.splice(idx, 1);
      layer.destroy();
    }
    if (this.layers.length === 0) this.stop();
  }

  /**
   * Global intensity multiplier (0–1).
   * Layers may read `engine.intensity` to scale particle counts / opacity.
   */
  setIntensity(value) {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._clear();
  }

  /** Tear down everything — call when the host component unmounts. */
  dispose() {
    this.stop();
    this._destroyLayers();
    this._resizeObserver.disconnect();
    this.canvas = null;
    this.ctx = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                          */
  /* ------------------------------------------------------------------ */

  /** @private Main RAF callback (arrow fn to preserve `this`). */
  _tick = (now) => {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap to 100 ms
    this.lastTime = now;

    this._clear();

    let i = 0;
    while (i < this.layers.length) {
      const layer = this.layers[i];
      layer.update(dt, this.intensity);
      layer.draw(this.ctx, this.intensity);

      if (layer.finished) {
        this.layers.splice(i, 1);
        layer.destroy();
      } else {
        i++;
      }
    }

    if (this.layers.length === 0) {
      this.stop();
      return;
    }

    this.rafId = requestAnimationFrame(this._tick);
  };

  /** @private */
  _clear() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** @private */
  _handleResize = () => {
    this._syncSize();
  };

  /** @private Match canvas pixel size to its CSS layout size. */
  _syncSize() {
    if (!this.canvas) return;

    const parent = this.canvas.parentElement ?? this.canvas;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (const layer of this.layers) {
        if (typeof layer.resize === 'function') {
          layer.resize(w, h);
        }
      }
    }
  }

  /** @private */
  _destroyLayers() {
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers = [];
  }
}
