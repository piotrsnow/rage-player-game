const SCRIPT_URLS = [
  '/vendor/dice-lib/libs/three.min.js',
  '/vendor/dice-lib/libs/cannon.min.js',
  '/vendor/dice-lib/libs/teal.js',
  '/vendor/dice-lib/dice.js',
];

let diceLibraryPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dice-lib="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.diceLib = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// Resolves to `window.DICE` once the vendored three.js / cannon.js / teal / dice.js
// scripts are loaded in order. The promise is cached at module scope so multiple
// callers share a single load.
export function ensureDiceLibrary() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.DICE) return Promise.resolve(window.DICE);
  if (!diceLibraryPromise) {
    diceLibraryPromise = SCRIPT_URLS.reduce(
      (promise, src) => promise.then(() => loadScript(src)),
      Promise.resolve()
    ).then(() => window.DICE);
  }
  return diceLibraryPromise;
}
