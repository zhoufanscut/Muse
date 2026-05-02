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

// Font-ready signal: document.fonts.load, NOT the stylesheet <link> load event.
// link.load fires when CSS arrives; document.fonts.load waits for the font to be decoded.
export async function loadWebFont(font) {
  if (font.cssUrl) {
    const existing = document.querySelector(
      `link[rel="stylesheet"][href="${font.cssUrl}"]`
    );
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = font.cssUrl;
      document.head.appendChild(link);
    }
  }
  try {
    await document.fonts.load(`16px "${font.name}"`);
    return true;
  } catch {
    return false;
  }
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
