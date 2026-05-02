const LOCAL_STORAGE_KEY = 'muse:custom-fonts';

const LOCAL_FONTS = [
  { id: 'menlo', name: 'Menlo', stack: "'Menlo', monospace" },
  { id: 'monaco', name: 'Monaco', stack: "'Monaco', monospace" },
  { id: 'sf-mono', name: 'SF Mono', stack: "'SF Mono', monospace" },
  { id: 'consolas', name: 'Consolas', stack: "'Consolas', monospace" },
  { id: 'andale-mono', name: 'Andale Mono', stack: "'Andale Mono', monospace" },
  { id: 'courier-new', name: 'Courier New', stack: "'Courier New', monospace" },
  { id: 'pt-mono', name: 'PT Mono', stack: "'PT Mono', monospace" },
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
      const res = await fetch(`./data/fonts/${id}.json`);
      const manifest = await res.json();
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

export function installFont(spec) {
  const id = spec.name.toLowerCase().replace(/\s+/g, '-');
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
    installed: false,
  };
}

export function registerCustomFont(spec) {
  const fontObject = installFont(spec);

  try {
    const existing = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEY) || '[]'
    );
    if (!existing.find(f => f.id === fontObject.id)) {
      existing.push(fontObject);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.error(e);
  }

  return fontObject;
}
