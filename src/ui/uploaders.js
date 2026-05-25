import { registerCustomFont, installFont, registerFoundFont, sanitizeFontFace } from '../fonts.js';
import { getHighlighter, markThemeLoaded } from '../themes.js';

const FONT_KEY = 'muse:custom-fonts';
const THEME_KEY = 'muse:custom-themes';

function slugify(name) {
  return 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Reject anything that isn't a hex color or empty. Shiki splats these straight
// into inline style attributes; a value like `red;background:url(...)` would
// CSS-inject. Real VSCode themes only ever use hex.
const COLOR_RE = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))?$/;

const FONT_STYLE_TOKENS = new Set(['italic', 'bold', 'underline', 'strikethrough']);

function validateThemeColors(theme) {
  const bad = (val, where) => {
    if (val == null) return null;
    if (typeof val !== 'string') return `${where}: must be a string`;
    if (!COLOR_RE.test(val)) return `${where}: invalid color "${val}"`;
    return null;
  };

  // fontStyle is a space-separated subset of italic/bold/underline/strikethrough
  // (or '' to clear). Shiki maps known tokens into inline styles; reject the rest.
  const badFontStyle = (val, where) => {
    if (val == null) return null;
    if (typeof val !== 'string') return `${where}: must be a string`;
    const trimmed = val.trim();
    if (trimmed === '') return null;
    for (const tok of trimmed.split(/\s+/)) {
      if (!FONT_STYLE_TOKENS.has(tok)) return `${where}: invalid fontStyle "${val}"`;
    }
    return null;
  };

  // Shiki copies these top-level values straight into the <pre> style attribute,
  // the same injection surface as colors.* — so they must be validated too.
  for (const key of ['bg', 'fg', 'background', 'foreground']) {
    const err = bad(theme[key], key);
    if (err) return err;
  }

  if (theme.colors && typeof theme.colors === 'object') {
    for (const [k, v] of Object.entries(theme.colors)) {
      const err = bad(v, `colors.${k}`);
      if (err) return err;
    }
  }

  const checkRules = (rules, label) => {
    if (!Array.isArray(rules)) return null;
    for (let i = 0; i < rules.length; i++) {
      const s = rules[i]?.settings;
      if (!s) continue;
      const fg = bad(s.foreground, `${label}[${i}].settings.foreground`);
      if (fg) return fg;
      const bg = bad(s.background, `${label}[${i}].settings.background`);
      if (bg) return bg;
      const fs = badFontStyle(s.fontStyle, `${label}[${i}].settings.fontStyle`);
      if (fs) return fs;
    }
    return null;
  };

  return checkRules(theme.tokenColors, 'tokenColors')
      || checkRules(theme.settings, 'settings');
}

function createDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'upload-dialog';

  const header = document.createElement('div');
  header.className = 'upload-dialog-header';

  const title = document.createElement('h2');
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'upload-dialog-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => dialog.close());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'upload-dialog-body';

  const footer = document.createElement('div');
  footer.className = 'upload-dialog-footer';

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  return { dialog, title, body, footer };
}

function showFontDialog({ onFontAdded, onStatus }) {
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Add Custom Font';

  const checkSection = document.createElement('details');
  checkSection.className = 'font-check-section';
  const checkSummary = document.createElement('summary');
  checkSummary.textContent = 'Already installed? Check if a font is on your system';
  checkSection.appendChild(checkSummary);

  const checkInner = document.createElement('div');
  checkInner.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;';

  const checkInput = document.createElement('input');
  checkInput.type = 'text';
  checkInput.placeholder = 'e.g. Fira Code, JetBrains Mono';
  checkInput.style.cssText = 'flex:1;min-width:180px;';
  checkInner.appendChild(checkInput);

  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'Check';
  checkInner.appendChild(checkBtn);

  const checkResult = document.createElement('div');
  checkResult.style.cssText = 'width:100%;font-size:0.85rem;min-height:1.5em;margin-top:4px;';
  checkInner.appendChild(checkResult);

  const addFoundBtn = document.createElement('button');
  addFoundBtn.textContent = 'Add this font';
  addFoundBtn.className = 'btn-primary';
  addFoundBtn.style.display = 'none';
  addFoundBtn.style.marginTop = '8px';
  addFoundBtn.style.width = '100%';
  checkInner.appendChild(addFoundBtn);

  let foundFont = null;

  checkBtn.addEventListener('click', () => {
    const name = checkInput.value.trim();
    if (!name) {
      checkResult.textContent = 'Enter a font name to check.';
      checkResult.style.color = 'var(--text-muted)';
      addFoundBtn.style.display = 'none';
      foundFont = null;
      return;
    }
    const font = registerFoundFont(name);
    if (font) {
      checkResult.textContent = `"${font.name}" is installed.`;
      checkResult.style.color = '#4caf50';
      addFoundBtn.style.display = '';
      foundFont = font;
    } else {
      checkResult.textContent = `"${name}" not found on this system.`;
      checkResult.style.color = '#ff8080';
      addFoundBtn.style.display = 'none';
      foundFont = null;
    }
  });

  checkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checkBtn.click();
    }
  });

  addFoundBtn.addEventListener('click', () => {
    if (!foundFont) return;
    onFontAdded?.(foundFont);
    dialog.close();
  });

  checkSection.appendChild(checkInner);
  body.appendChild(checkSection);

  const separator = document.createElement('hr');
  separator.style.cssText = 'border:none;border-top:1px solid var(--border);margin:16px 0;';
  body.appendChild(separator);

  const cssLabel = document.createElement('label');
  const cssSpan = document.createElement('span');
  cssSpan.textContent = 'Font CSS URL or @font-face snippet';
  cssLabel.appendChild(cssSpan);
  const cssInput = document.createElement('textarea');
  cssInput.placeholder = 'https://fonts.googleapis.com/css2?family=Example&display=swap\n\n— or —\n\n@font-face {\n  font-family: "Example";\n  src: url("...");\n}';
  cssInput.rows = 5;
  cssLabel.appendChild(cssInput);
  body.appendChild(cssLabel);

  const nameLabel = document.createElement('label');
  const nameSpan = document.createElement('span');
  nameSpan.textContent = 'Display name';
  nameLabel.appendChild(nameSpan);
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'My Font';
  nameLabel.appendChild(nameInput);
  body.appendChild(nameLabel);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());
  footer.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add Font';
  submitBtn.addEventListener('click', () => {
    const input = cssInput.value.trim();
    const name = nameInput.value.trim();

    if (!input) {
      onStatus?.('Please enter a font URL or @font-face CSS.');
      return;
    }
    if (!name) {
      onStatus?.('Please enter a display name.');
      return;
    }

    let spec;
    if (input.includes('@font-face')) {
      const safe = sanitizeFontFace(input);
      if (!safe) {
        onStatus?.('No usable @font-face rule found in the pasted CSS.');
        return;
      }
      spec = { name, fontFaceCss: safe };
    } else {
      if (!/^https:\/\//i.test(input)) {
        onStatus?.('Font URL must start with https:// (got an http or non-URL value).');
        return;
      }
      spec = { name, cssUrl: input };
    }
    // custom- prefix so a name like "JetBrains Mono" can't shadow a repo font id.
    spec.id = slugify(name);

    try {
      const { font, persisted } = registerCustomFont(spec); // single writer
      onFontAdded?.(font);
      dialog.close();
      onStatus?.(persisted
        ? 'Font added. Note: Custom fonts are stored locally and will fall back to defaults if this URL is shared to another device.'
        : 'Font added for this session, but it could not be saved (browser storage may be full).');
    } catch (e) {
      onStatus?.('Failed to register font: ' + e.message);
    }
  });
  footer.appendChild(submitBtn);

  document.body.appendChild(dialog);
  dialog.showModal();
  cssInput.focus();

  dialog.addEventListener('close', () => dialog.remove());
}

function showThemeDialog({ onThemeAdded, onStatus }) {
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Add Custom Theme';

  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.textContent = 'Drop a .json theme file here, or paste JSON below';
  body.appendChild(dropZone);

  const jsonLabel = document.createElement('label');
  const jsonSpan = document.createElement('span');
  jsonSpan.textContent = 'Theme JSON';
  jsonLabel.appendChild(jsonSpan);
  const jsonInput = document.createElement('textarea');
  jsonInput.placeholder = 'Paste VSCode theme JSON here…';
  jsonInput.rows = 8;
  jsonLabel.appendChild(jsonInput);
  body.appendChild(jsonLabel);

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      onStatus?.('Only .json files are accepted.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      jsonInput.value = reader.result;
    };
    reader.onerror = () => {
      onStatus?.('Failed to read file.');
    };
    reader.readAsText(file);
  });
  dropZone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        jsonInput.value = reader.result;
      };
      reader.readAsText(file);
    });
    input.click();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());
  footer.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add Theme';
  submitBtn.addEventListener('click', () => {
    const json = jsonInput.value.trim();
    if (!json) {
      onStatus?.('Please paste or drop a theme JSON file.');
      return;
    }
    try {
      const theme = JSON.parse(json);
      if (!theme.colors && !theme.tokenColors && !theme.settings) {
        onStatus?.('Not a valid VSCode theme: missing colors, tokenColors, or settings.');
        return;
      }
      const colorErr = validateThemeColors(theme);
      if (colorErr) {
        onStatus?.('Theme rejected — ' + colorErr);
        return;
      }
      const id = slugify(theme.name || 'unnamed');

      const persisted = storeCustomTheme(id, theme);
      registerRuntimeTheme(id, theme).then(() => {
        onThemeAdded?.({ id, name: theme.name || id, type: theme.type || 'dark' });
        dialog.close();
        onStatus?.(persisted
          ? 'Theme added. Note: Custom themes are stored locally and will fall back to defaults if this URL is shared to another device.'
          : 'Theme added for this session, but it could not be saved (browser storage may be full).');
      }).catch(e => {
        onStatus?.('Failed to load theme: ' + e.message);
      });
    } catch (e) {
      onStatus?.('Invalid JSON: ' + e.message);
    }
  });
  footer.appendChild(submitBtn);

  document.body.appendChild(dialog);
  dialog.showModal();

  dialog.addEventListener('close', () => dialog.remove());
}

export function mountUploaders({ addFontBtn, addThemeBtn, onFontAdded, onThemeAdded }) {
  let statusEl = null;

  function ensureStatusEl() {
    if (statusEl) return;
    statusEl = document.createElement('div');
    statusEl.className = 'upload-status';
    document.body.appendChild(statusEl);
  }

  function onStatus(msg) {
    ensureStatusEl();
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    setTimeout(() => {
      if (statusEl.textContent === msg) {
        statusEl.style.display = 'none';
      }
    }, 6000);
  }

  addFontBtn?.addEventListener('click', () => {
    if (document.querySelector('.upload-dialog')) return; // one dialog at a time
    showFontDialog({ onFontAdded, onStatus });
  });

  addThemeBtn?.addEventListener('click', () => {
    if (document.querySelector('.upload-dialog')) return; // one dialog at a time
    showThemeDialog({ onThemeAdded, onStatus });
  });
}

const runtimeThemes = new Map();

function storeCustomTheme(id, theme) {
  const themeObj = { ...theme, name: id };
  runtimeThemes.set(id, themeObj);
  try {
    const existing = JSON.parse(localStorage.getItem(THEME_KEY) || '[]');
    if (!existing.find(t => t.id === id)) {
      existing.push({ id, theme: themeObj });
      localStorage.setItem(THEME_KEY, JSON.stringify(existing));
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function getRuntimeTheme(id) {
  return runtimeThemes.get(id);
}

export function removeCustomTheme(id) {
  runtimeThemes.delete(id);
  try {
    const existing = JSON.parse(localStorage.getItem(THEME_KEY) || '[]');
    localStorage.setItem(THEME_KEY, JSON.stringify(existing.filter(t => t.id !== id)));
  } catch (e) {
    console.error(e);
  }
}

async function registerRuntimeTheme(id, themeObj) {
  const h = await getHighlighter();
  const theme = { ...themeObj, name: id };
  await h.loadTheme(theme);
  markThemeLoaded(id);
}

export async function restoreCustom({ onFontAdded, onThemeAdded }) {
  try {
    const fonts = JSON.parse(localStorage.getItem(FONT_KEY) || '[]');
    for (const font of fonts) {
      const fontObj = installFont(font);
      onFontAdded?.(fontObj);
    }
  } catch (e) { console.error(e); }

  try {
    const themes = JSON.parse(localStorage.getItem(THEME_KEY) || '[]');
    for (const { id, theme } of themes) {
      runtimeThemes.set(id, theme);
      await registerRuntimeTheme(id, theme);
      onThemeAdded?.({ id, name: theme.name || id, type: theme.type || 'dark' });
    }
  } catch (e) { console.error(e); }
}
