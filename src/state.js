// muse/state — selection store with localStorage persistence, URL hash sync, and pub/sub

const KEY = 'muse:state';

const DEFAULTS = {
  font: 'jetbrains-mono',
  theme: 'one-dark-pro',
  lang: 'python',
  size: 14,
  ligatures: true,
  italic: true,
};

const subs = new Set();

let catalog = null;

function parseHash(hash) {
  if (!hash || hash === '#') return null;
  const p = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const out = {};
  for (const [k, v] of p) {
    if (k === 'size') out.size = Number(v);
    else if (k === 'liga') out.ligatures = v === '1';
    else if (k === 'italic') out.italic = v === '1';
    else out[k] = v;
  }
  return out;
}

function writeHash(s) {
  const p = new URLSearchParams({
    font: s.font,
    theme: s.theme,
    lang: s.lang,
    size: String(s.size),
    liga: s.ligatures ? '1' : '0',
    italic: s.italic ? '1' : '0',
  });
  history.replaceState(null, '', '#' + p.toString());
}

function load() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {}
  return { ...DEFAULTS, ...(stored || {}), ...(parseHash(location.hash) || {}) };
}

// Captured before any write so we can tell a genuine first visit (no saved
// prefs) from a return visit that happens to land on a hashless URL.
let hadStoredState = false;
try { hadStoredState = localStorage.getItem(KEY) != null; } catch {}

let state = load();

function validateAgainstCatalog(s) {
  if (!catalog) return s;
  const patched = { ...s };
  if (catalog.fonts && !catalog.fonts.includes(patched.font)) {
    console.error(`muse: unknown font "${patched.font}", falling back to default`);
    patched.font = DEFAULTS.font;
  }
  if (catalog.themes && !catalog.themes.includes(patched.theme)) {
    console.error(`muse: unknown theme "${patched.theme}", falling back to default`);
    patched.theme = DEFAULTS.theme;
  }
  if (catalog.languages && !catalog.languages.includes(patched.lang)) {
    console.error(`muse: unknown language "${patched.lang}", falling back to default`);
    patched.lang = DEFAULTS.lang;
  }
  return patched;
}

let persistTimer = null;

function persistNow() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { console.error(e); }
  writeHash(state);
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 200);
}

export function setCatalog(c) {
  catalog = c;
  state = validateAgainstCatalog(state);

  if (!hadStoredState && (!location.hash || location.hash === '#')) {
    if (c.fonts && c.fonts.length > 0) {
      state.font = c.fonts[Math.floor(Math.random() * c.fonts.length)];
    }
    if (c.themes && c.themes.length > 0) {
      state.theme = c.themes[Math.floor(Math.random() * c.themes.length)];
    }
  }

  persistNow();
  for (const fn of subs) fn(state);
}

export function getState() {
  return { ...state };
}

export function setState(patch) {
  state = { ...state, ...patch };
  // Size fires rapidly during slider drags — debounce its persistence. Every
  // other change persists immediately so a copied URL hash is never stale.
  if (Object.keys(patch).length === 1 && 'size' in patch) schedulePersist();
  else persistNow();
  for (const fn of subs) fn(state);
}

export function subscribe(fn) {
  subs.add(fn);
  fn(state);
  return () => subs.delete(fn);
}
