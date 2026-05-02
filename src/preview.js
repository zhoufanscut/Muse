// muse/preview — preview block renderer with race-condition guard
//
// Size-only optimization: when only `size` changes and font/theme/lang are unchanged,
// the caller should update container.style.fontSize directly instead of re-invoking
// renderPreview. This avoids redundant highlight tokenization for a pure-CSS change.

import { highlight, ensureLang, ensureCustomTheme } from './themes.js';
import { loadSample } from './languages.js';

let renderToken = 0;

export async function renderPreview({ font, theme, lang, langManifest, size, ligatures, italic, container, builtinThemes }) {
  const token = ++renderToken;

  // Load custom theme if needed (built-in themes are already in Shiki at bootstrap)
  if (builtinThemes && !builtinThemes.has(theme)) {
    try { await ensureCustomTheme(theme); } catch (e) { console.error(e); }
  }

  await ensureLang(lang);

  let code;
  try {
    code = await loadSample(langManifest);
  } catch (e) {
    console.error(e);
    code = '// Sample unavailable';
  }

  let html;
  try {
    html = await highlight(code, lang, theme);
  } catch (e) {
    // Fallback: plain <pre> with banner — font still applies
    console.error(e);
    html = `<div style="color:#ff8080;padding:8px">⚠ syntax highlighting unavailable</div><pre>${escapeHtml(code)}</pre>`;
  }

  // Race-condition guard: bail if a newer render has started
  if (token !== renderToken) return;

  container.innerHTML = html;
  container.style.fontFamily = font.stack;
  container.style.fontSize = size + 'px';
  container.classList.toggle('no-liga', !ligatures);
  container.classList.toggle('italic-comments', italic);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
