// muse/preview — preview block renderer with race-condition guard
//
// Size-only optimization: when only `size` changes and font/theme/lang are unchanged,
// the caller should update container.style.fontSize directly instead of re-invoking
// renderPreview. This avoids redundant highlight tokenization for a pure-CSS change.

import { highlight, ensureLang, ensureCustomTheme, ensureCommentStyleTheme, getKnownTheme } from './themes.js';
import { loadWebFont } from './fonts.js';
import { loadSample } from './languages.js';

let renderToken = 0;

export async function renderPreview({ font, theme, lang, langManifest, size, ligatures, italic, container, builtinThemes }) {
  const token = ++renderToken;

  applyFontStyles({ container, font, size, ligatures, italic });

  // Do not block the visible font switch on CDN font loading. Applying the
  // font-family stack immediately lets installed fonts update instantly and lets
  // browsers show fallback text until a web font finishes decoding.
  const fontReady = loadWebFont(font);

  // Load custom theme if needed (built-in themes are already in Shiki at bootstrap)
  if (builtinThemes && !builtinThemes.has(theme)) {
    try { await ensureCustomTheme(theme); } catch (e) { console.error(e); }
  }

  await ensureLang(lang);

  let renderTheme = theme;
  try {
    renderTheme = await ensureCommentStyleTheme(theme, italic);
  } catch (e) {
    console.error(e);
  }

  // Apply the theme's actual background color to the page chrome,
  // and set light/dark mode based on the theme author's declared type.
  // Runs after theme is loaded (ensureCommentStyleTheme guarantees that)
  // but before highlighting.
  try {
    const themeObj = await getKnownTheme(theme);
    document.documentElement.style.setProperty('--theme-bg', themeObj?.bg || '#1a1a2e');
    document.documentElement.dataset.theme = themeObj?.type === 'light' ? 'light' : 'dark';
  } catch { /* keep defaults */ }

  let code;
  try {
    code = await loadSample(langManifest);
  } catch (e) {
    console.error(e);
    code = '// Sample unavailable';
  }

  let html;
  try {
    html = await highlight(code, lang, renderTheme);
  } catch (e) {
    // Fallback: plain <pre> with banner — font still applies
    console.error(e);
    html = `<div style="color:#ff8080;padding:8px">⚠ syntax highlighting unavailable</div><pre>${escapeHtml(code)}</pre>`;
  }

  // Race-condition guard: bail if a newer render has started
  if (token !== renderToken) return;

  container.innerHTML = html;
  applyFontStyles({ container, font, size, ligatures, italic });

  fontReady.then(() => {
    if (token !== renderToken) return;
    applyFontStyles({ container, font, size, ligatures, italic });
  });
}

function applyFontStyles({ container, font, size, ligatures, italic }) {
  if (!container || !font) return;

  const targets = [
    container,
    container.querySelector('.shiki'),
    container.querySelector('.shiki code'),
    container.querySelector('pre'),
    container.querySelector('code'),
  ].filter(Boolean);

  for (const target of targets) {
    target.style.fontFamily = font.stack;
    target.style.fontSize = size + 'px';
  }

  container.classList.toggle('no-liga', !ligatures);
  container.classList.toggle('italic-comments', italic);

}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
