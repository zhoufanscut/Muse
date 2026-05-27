import { fetchJson } from './util.js';

const LOCAL_STORAGE_KEY = 'muse:custom-fonts';
const FOUND_FONTS_KEY = 'muse:found-fonts';

const LOCAL_FONTS = [
  // macOS system
  { id: 'menlo', name: 'Menlo', stack: "'Menlo', monospace" },
  { id: 'monaco', name: 'Monaco', stack: "'Monaco', monospace" },
  { id: 'sf-mono', name: 'SF Mono', stack: "'SF Mono', monospace" },
  // Windows system
  { id: 'consolas', name: 'Consolas', stack: "'Consolas', monospace" },
  { id: 'courier-new', name: 'Courier New', stack: "'Courier New', monospace" },
  // Linux system
  { id: 'dejavu-sans-mono', name: 'DejaVu Sans Mono', stack: "'DejaVu Sans Mono', monospace" },
  { id: 'liberation-mono', name: 'Liberation Mono', stack: "'Liberation Mono', monospace" },
  // Common on multiple platforms
  { id: 'andale-mono', name: 'Andale Mono', stack: "'Andale Mono', monospace" },
  { id: 'pt-mono', name: 'PT Mono', stack: "'PT Mono', monospace" },
  // Popular manually-installed coding fonts
  { id: 'jetbrains-mono', name: 'JetBrains Mono', stack: "'JetBrains Mono', monospace" },
  { id: 'fira-code', name: 'Fira Code', stack: "'Fira Code', monospace" },
  { id: 'cascadia-code', name: 'Cascadia Code', stack: "'Cascadia Code', monospace" },
  { id: 'cascadia-mono', name: 'Cascadia Mono', stack: "'Cascadia Mono', monospace" },
  { id: 'source-code-pro', name: 'Source Code Pro', stack: "'Source Code Pro', monospace" },
  { id: 'hack', name: 'Hack', stack: "'Hack', monospace" },
  { id: 'iosevka', name: 'Iosevka', stack: "'Iosevka', monospace" },
  { id: 'ubuntu-mono', name: 'Ubuntu Mono', stack: "'Ubuntu Mono', monospace" },
  { id: 'inconsolata', name: 'Inconsolata', stack: "'Inconsolata', monospace" },
  { id: 'droid-sans-mono', name: 'Droid Sans Mono', stack: "'Droid Sans Mono', monospace" },
  { id: 'noto-sans-mono', name: 'Noto Sans Mono', stack: "'Noto Sans Mono', monospace" },
  { id: 'roboto-mono', name: 'Roboto Mono', stack: "'Roboto Mono', monospace" },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono', stack: "'IBM Plex Mono', monospace" },
  { id: 'anonymous-pro', name: 'Anonymous Pro', stack: "'Anonymous Pro', monospace" },
  { id: 'victor-mono', name: 'Victor Mono', stack: "'Victor Mono', monospace" },
  { id: 'fantasque-sans-mono', name: 'Fantasque Sans Mono', stack: "'Fantasque Sans Mono', monospace" },
  { id: 'monoid', name: 'Monoid', stack: "'Monoid', monospace" },
  { id: 'fira-mono', name: 'Fira Mono', stack: "'Fira Mono', monospace" },
  { id: 'cousine', name: 'Cousine', stack: "'Cousine', monospace" },
  { id: 'oxygen-mono', name: 'Oxygen Mono', stack: "'Oxygen Mono', monospace" },
  { id: 'space-mono', name: 'Space Mono', stack: "'Space Mono', monospace" },
  { id: 'cutive-mono', name: 'Cutive Mono', stack: "'Cutive Mono', monospace" },
  { id: 'nova-mono', name: 'Nova Mono', stack: "'Nova Mono', monospace" },
  { id: 'overpass-mono', name: 'Overpass Mono', stack: "'Overpass Mono', monospace" },
  { id: 'share-tech-mono', name: 'Share Tech Mono', stack: "'Share Tech Mono', monospace" },
  { id: 'major-mono-display', name: 'Major Mono Display', stack: "'Major Mono Display', monospace" },
  // Premium / niche coding fonts
  { id: 'input-mono', name: 'Input Mono', stack: "'Input Mono', monospace" },
  { id: 'dank-mono', name: 'Dank Mono', stack: "'Dank Mono', monospace" },
  { id: 'operator-mono', name: 'Operator Mono', stack: "'Operator Mono', monospace" },
  // CJK monospace
  { id: 'sarasa-mono-sc', name: 'Sarasa Mono SC', stack: "'Sarasa Mono SC', monospace" },
  { id: 'lxgw-wenkai-mono', name: 'LXGW WenKai Mono', stack: "'LXGW WenKai Mono', monospace" },
  { id: 'maple-mono', name: 'Maple Mono', stack: "'Maple Mono', monospace" },
];

const stylesheetPromises = new Map();
const fontPromises = new Map();

function findStylesheet(cssUrl) {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => link.getAttribute('href') === cssUrl || link.href === cssUrl);
}

function ensureStylesheet(cssUrl) {
  if (!cssUrl) return Promise.resolve(true);
  if (stylesheetPromises.has(cssUrl)) return stylesheetPromises.get(cssUrl);

  let link = findStylesheet(cssUrl);
  const promise = new Promise((resolve) => {
    const markReady = () => {
      link.dataset.museFontStylesheetReady = 'true';
      resolve(true);
    };
    const markFailed = () => {
      stylesheetPromises.delete(cssUrl);
      resolve(false);
    };

    if (link?.dataset.museFontStylesheetReady === 'true' || link?.sheet) {
      markReady();
      return;
    }

    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
    }

    link.addEventListener('load', markReady, { once: true });
    link.addEventListener('error', markFailed, { once: true });

    if (!link.isConnected) document.head.appendChild(link);
  });

  stylesheetPromises.set(cssUrl, promise);
  return promise;
}

// Font loading requires TWO waits when injecting a new stylesheet:
// 1. Wait for the CSS <link> to load — @font-face must be registered before
//    document.fonts.load() can find and wait for the font.
// 2. Then wait for the font file itself to be decoded. The second wait is the
//    important readiness signal; link load only means the @font-face CSS arrived.
export async function loadWebFont(font) {
  if (!font?.name) return false;

  const key = `${font.cssUrl || 'local'}::${font.name}`;
  if (fontPromises.has(key)) return fontPromises.get(key);

  const promise = (async () => {
    if (font.cssUrl) {
      const cssReady = await ensureStylesheet(font.cssUrl);
      if (!cssReady) {
        fontPromises.delete(key);
        return false;
      }
    }

    // document.fonts.load waits for the actual decoded font, unlike <link> load.
    await document.fonts.load(`16px "${font.name}"`);
    return true;
  })().catch(() => {
    fontPromises.delete(key);
    return false;
  });

  fontPromises.set(key, promise);
  return promise;
}

// Canvas trick: compare 16px serif baseline against 16px <candidate>, serif.
// If widths match, the candidate font is NOT installed.
export function isFontAvailable(fontName) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
  ctx.font = '16px serif';
  const fallbackWidth = ctx.measureText(testStr).width;
  ctx.font = `16px "${fontName}", serif`;
  return ctx.measureText(testStr).width !== fallbackWidth;
}

// Malformed JSON dropped silently with console.error — does NOT crash the caller.
export async function loadFontManifests(ids) {
  const results = [];
  for (const id of ids) {
    try {
      const manifest = await fetchJson(`./data/fonts/${id}.json`);
      results.push(manifest);
    } catch (e) {
      console.error(e);
    }
  }
  return results;
}

export function detectInstalledFonts() {
  return LOCAL_FONTS
    .filter((f) => isFontAvailable(f.name))
    .map((f) => ({ ...f, cssUrl: null, installed: true }));
}

// Keep ONLY @font-face rules from pasted CSS. Constructable stylesheets ignore
// @import, and every non-@font-face rule (selectors, background hacks) is dropped,
// so a paste can't smuggle tracking or layout CSS into the page. '' = nothing valid.
export function sanitizeFontFace(css) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return Array.from(sheet.cssRules)
      .filter((r) => r instanceof CSSFontFaceRule)
      .map((r) => r.cssText)
      .join('\n');
  } catch {
    return '';
  }
}

export function installFont(spec) {
  const id = spec.id || spec.name.toLowerCase().replace(/\s+/g, '-');
  const stack = `'${spec.name}', monospace`;

  if (spec.cssUrl) {
    const existing = document.querySelector(
      `link[rel="stylesheet"][href="${spec.cssUrl}"]`
    );
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = spec.cssUrl;
      document.head.appendChild(link);
    }
  } else if (spec.fontFaceCss) {
    const style = document.createElement('style');
    style.textContent = spec.fontFaceCss;
    document.head.appendChild(style);
  }

  return {
    id,
    name: spec.name,
    stack,
    cssUrl: spec.cssUrl || null,
    fontFaceCss: spec.fontFaceCss || null,
    installed: !!spec.installed,
  };
}

export function registerCustomFont(spec) {
  const fontObject = installFont(spec);

  let persisted = false;
  try {
    const existing = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEY) || '[]'
    );
    if (!existing.find(f => f.id === fontObject.id)) {
      existing.push(fontObject);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
    }
    persisted = true;
  } catch (e) {
    console.error(e);
  }

  return { font: fontObject, persisted };
}

export function removeCustomFont(id) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(existing.filter(f => f.id !== id))
    );
  } catch (e) {
    console.error(e);
  }
}

export function checkFontByName(fontName) {
  if (!fontName || typeof fontName !== 'string') return null;
  const trimmed = fontName.trim();
  if (!trimmed) return null;

  const available = isFontAvailable(trimmed);
  if (!available) return null;

  const id = trimmed.toLowerCase().replace(/\s+/g, '-');
  return {
    id,
    name: trimmed,
    stack: `'${trimmed}', monospace`,
    cssUrl: null,
    installed: true,
  };
}

function persistFoundFont(font) {
  try {
    const existing = JSON.parse(localStorage.getItem(FOUND_FONTS_KEY) || '[]');
    if (!existing.find(f => f.id === font.id)) {
      existing.push(font);
      localStorage.setItem(FOUND_FONTS_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.error(e);
  }
}

export function registerFoundFont(fontName) {
  const font = checkFontByName(fontName);
  if (!font) return null;
  persistFoundFont(font);
  return font;
}

export function restoreFoundFonts() {
  try {
    const stored = JSON.parse(localStorage.getItem(FOUND_FONTS_KEY) || '[]');
    return stored.filter(f => f && f.id && f.name);
  } catch {
    return [];
  }
}

export function removeFoundFont(id) {
  try {
    const existing = JSON.parse(localStorage.getItem(FOUND_FONTS_KEY) || '[]');
    localStorage.setItem(
      FOUND_FONTS_KEY,
      JSON.stringify(existing.filter(f => f.id !== id))
    );
  } catch (e) {
    console.error(e);
  }
}
