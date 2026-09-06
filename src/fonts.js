import { fetchJson } from './util.js';
import { CUSTOM_FONTS_KEY, FOUND_FONTS_KEY } from './keys.js';

const LOCAL_FONTS = [
  // macOS system
  { id: 'menlo', name: 'Menlo' },
  { id: 'monaco', name: 'Monaco' },
  { id: 'sf-mono', name: 'SF Mono' },
  // Windows system
  { id: 'consolas', name: 'Consolas' },
  { id: 'courier-new', name: 'Courier New' },
  // Linux system
  { id: 'dejavu-sans-mono', name: 'DejaVu Sans Mono' },
  { id: 'liberation-mono', name: 'Liberation Mono' },
  // Common on multiple platforms
  { id: 'andale-mono', name: 'Andale Mono' },
  { id: 'pt-mono', name: 'PT Mono' },
  // Popular manually-installed coding fonts
  { id: 'jetbrains-mono', name: 'JetBrains Mono' },
  { id: 'fira-code', name: 'Fira Code' },
  { id: 'cascadia-code', name: 'Cascadia Code' },
  { id: 'cascadia-mono', name: 'Cascadia Mono' },
  { id: 'source-code-pro', name: 'Source Code Pro' },
  { id: 'hack', name: 'Hack' },
  { id: 'iosevka', name: 'Iosevka' },
  { id: 'ubuntu-mono', name: 'Ubuntu Mono' },
  { id: 'inconsolata', name: 'Inconsolata' },
  { id: 'droid-sans-mono', name: 'Droid Sans Mono' },
  { id: 'noto-sans-mono', name: 'Noto Sans Mono' },
  { id: 'roboto-mono', name: 'Roboto Mono' },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono' },
  { id: 'anonymous-pro', name: 'Anonymous Pro' },
  { id: 'victor-mono', name: 'Victor Mono' },
  { id: 'fantasque-sans-mono', name: 'Fantasque Sans Mono' },
  { id: 'monoid', name: 'Monoid' },
  { id: 'fira-mono', name: 'Fira Mono' },
  { id: 'cousine', name: 'Cousine' },
  { id: 'oxygen-mono', name: 'Oxygen Mono' },
  { id: 'space-mono', name: 'Space Mono' },
  { id: 'cutive-mono', name: 'Cutive Mono' },
  { id: 'nova-mono', name: 'Nova Mono' },
  { id: 'overpass-mono', name: 'Overpass Mono' },
  { id: 'share-tech-mono', name: 'Share Tech Mono' },
  { id: 'major-mono-display', name: 'Major Mono Display' },
  // Premium / niche coding fonts
  { id: 'input-mono', name: 'Input Mono' },
  { id: 'dank-mono', name: 'Dank Mono' },
  { id: 'operator-mono', name: 'Operator Mono' },
  // CJK monospace
  { id: 'sarasa-mono-sc', name: 'Sarasa Mono SC' },
  { id: 'lxgw-wenkai-mono', name: 'LXGW WenKai Mono' },
  { id: 'maple-mono', name: 'Maple Mono' },
];

const stylesheetPromises = new Map();
const fontPromises = new Map();
const fontFaceStyles = new Map(); // font id → <style> holding its pasted @font-face rules

// Quote a family name for CSS (font-family stacks, ctx.font, document.fonts.load).
// An unescaped quote in a name would make the whole declaration invalid, which
// the CSSOM silently drops.
function cssFamily(name) {
  return `'${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function fontStack(name) {
  return `${cssFamily(name)}, monospace`;
}

// Id derivation for fonts that predate `custom-` prefixes / stored ids.
export function legacyFontId(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

function findStylesheet(cssUrl) {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => link.getAttribute('href') === cssUrl || link.href === cssUrl);
}

// NOTE: a CSS URL loads as a full stylesheet, so unlike the @font-face paste
// path (sanitizeFontFace) it may carry rules beyond @font-face. That is
// deliberate: the URL never leaves the device, `connect-src` rules out a
// fetch-and-sanitize, and the only page it can restyle is the pasting user's.
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
      // Drop the dead <link>: its error event has already fired, so a retry
      // must inject a fresh element — re-listening on this one never settles.
      link.remove();
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

  // Key by source, not just name: an installed "Foo" and a pasted @font-face
  // "Foo" must not share a cached result, and re-pasting a *changed*
  // @font-face under the same display name must bypass the old entry.
  const key = font.cssUrl ? `url:${font.cssUrl}::${font.name}`
    : font.fontFaceCss ? `css:${font.fontFaceCss}::${font.name}`
    : `local::${font.name}`;
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
    // It resolves with the faces that matched — empty means no @font-face matched
    // the name (e.g. display name ≠ family in the CSS). System fonts legitimately
    // match nothing, so only web-sourced fonts require a match.
    const faces = await document.fonts.load(`16px ${cssFamily(font.name)}`);
    const ok = (font.cssUrl || font.fontFaceCss) ? faces.length > 0 : true;
    // A name mismatch can be fixed by re-uploading under the same display
    // name — don't pin the failure for the whole session.
    if (!ok) fontPromises.delete(key);
    return ok;
  })().catch(() => {
    fontPromises.delete(key);
    return false;
  });

  fontPromises.set(key, promise);
  return promise;
}

// Canvas trick: compare 16px serif baseline against 16px <candidate>, serif.
// If widths match, the candidate font is NOT installed.
let probeCtx = null;
export function isFontAvailable(fontName) {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
  const ctx = probeCtx;
  const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
  ctx.font = '16px serif';
  const fallbackWidth = ctx.measureText(testStr).width;
  ctx.font = `16px ${cssFamily(fontName)}, serif`;
  return ctx.measureText(testStr).width !== fallbackWidth;
}

function isFontManifest(m) {
  return !!m && typeof m === 'object'
    && typeof m.id === 'string' && m.id
    && typeof m.name === 'string' && m.name
    && typeof m.stack === 'string' && m.stack
    && (m.cssUrl == null || typeof m.cssUrl === 'string');
}

// Manifests are fetched in parallel. A missing/malformed one is dropped with a
// console.error — it must never take the whole app down.
export async function loadFontManifests(ids) {
  const settled = await Promise.allSettled(
    ids.map(id => fetchJson(`./data/fonts/${id}.json`)),
  );
  const results = [];
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(r.reason);
    } else if (!isFontManifest(r.value)) {
      console.error(`muse: ignoring malformed manifest data/fonts/${ids[i]}.json`);
    } else {
      results.push(r.value);
    }
  });
  return results;
}

export function detectInstalledFonts() {
  return LOCAL_FONTS
    .filter((f) => isFontAvailable(f.name))
    .map((f) => ({ ...f, stack: fontStack(f.name), cssUrl: null, installed: true }));
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
  if (!spec || typeof spec.name !== 'string' || !spec.name.trim()) {
    throw new Error('font spec needs a name');
  }
  const id = spec.id || legacyFontId(spec.name);

  if (spec.cssUrl) {
    // Inject via ensureStylesheet so load/error listeners attach at birth: a
    // bare <link> that failed would hang later loadWebFont calls forever.
    ensureStylesheet(spec.cssUrl);
  } else if (spec.fontFaceCss) {
    // Replace, don't pile up: a re-upload under the same id must not leave the
    // old @font-face rules competing with the new ones.
    fontFaceStyles.get(id)?.remove();
    const style = document.createElement('style');
    style.textContent = spec.fontFaceCss;
    document.head.appendChild(style);
    fontFaceStyles.set(id, style);
  }

  return {
    id,
    name: spec.name,
    stack: fontStack(spec.name),
    cssUrl: spec.cssUrl || null,
    fontFaceCss: spec.fontFaceCss || null,
    installed: !!spec.installed,
  };
}

function readJsonArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Validated specs from muse:custom-fonts. Malformed entries are dropped with a
// console.error instead of aborting the whole restore; entries stored before
// ids were persisted get the legacy name-derived id.
export function readStoredCustomFonts() {
  const out = [];
  for (const entry of readJsonArray(CUSTOM_FONTS_KEY)) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name.trim()) {
      console.error('muse: dropping malformed stored font', entry);
      continue;
    }
    const id = typeof entry.id === 'string' && entry.id ? entry.id : legacyFontId(entry.name);
    out.push({ ...entry, id });
  }
  return out;
}

export function registerCustomFont(spec) {
  const fontObject = installFont(spec);

  let persisted = false;
  try {
    const existing = readStoredCustomFonts();
    // Replace on re-upload (same id) so the stored spec can't go stale.
    const idx = existing.findIndex(f => f.id === fontObject.id);
    if (idx >= 0) existing[idx] = fontObject;
    else existing.push(fontObject);
    localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(existing));
    persisted = true;
  } catch (e) {
    console.error(e);
  }

  return { font: fontObject, persisted };
}

export function removeCustomFont(id) {
  fontFaceStyles.get(id)?.remove();
  fontFaceStyles.delete(id);
  try {
    const existing = readJsonArray(CUSTOM_FONTS_KEY);
    localStorage.setItem(
      CUSTOM_FONTS_KEY,
      JSON.stringify(existing.filter(f => f?.id !== id)),
    );
  } catch (e) {
    console.error(e);
  }
}

// Probe only — persisting is a separate step (persistFoundFont) so that
// checking a name in the dialog and then cancelling leaves nothing behind.
export function checkFontByName(fontName) {
  if (!fontName || typeof fontName !== 'string') return null;
  const trimmed = fontName.trim();
  if (!trimmed) return null;

  const available = isFontAvailable(trimmed);
  if (!available) return null;

  return {
    id: legacyFontId(trimmed),
    name: trimmed,
    stack: fontStack(trimmed),
    cssUrl: null,
    installed: true,
  };
}

export function persistFoundFont(font) {
  try {
    const existing = readJsonArray(FOUND_FONTS_KEY);
    if (!existing.find(f => f?.id === font.id)) {
      existing.push({ id: font.id, name: font.name, stack: font.stack, cssUrl: null, installed: true });
      localStorage.setItem(FOUND_FONTS_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.error(e);
  }
}

export function restoreFoundFonts() {
  return readJsonArray(FOUND_FONTS_KEY)
    .filter(f => f && typeof f.id === 'string' && f.id && typeof f.name === 'string' && f.name)
    .map(f => ({ id: f.id, name: f.name, stack: fontStack(f.name), cssUrl: null, installed: true }));
}

export function removeFoundFont(id) {
  try {
    const existing = readJsonArray(FOUND_FONTS_KEY);
    localStorage.setItem(
      FOUND_FONTS_KEY,
      JSON.stringify(existing.filter(f => f?.id !== id)),
    );
  } catch (e) {
    console.error(e);
  }
}
