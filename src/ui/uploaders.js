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

const SVG_NS = 'http://www.w3.org/2000/svg';

// Build a stroke-based inline SVG icon (no external resource; CSP-safe).
function svgIcon(paths, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

// A labelled input/textarea field. Returns the wrapper, the control, and the
// label head row (so callers can append an example button to it).
function makeField({ label, placeholder = '', multiline = false, rows = 5 }) {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const head = document.createElement('div');
  head.className = 'field-head';
  const span = document.createElement('span');
  span.textContent = label;
  head.appendChild(span);

  const control = document.createElement(multiline ? 'textarea' : 'input');
  if (multiline) control.rows = rows;
  else control.type = 'text';
  control.placeholder = placeholder;

  wrap.append(head, control);
  return { wrap, control, head };
}

function addExampleButton(head, fill) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dialog-example-btn';
  btn.textContent = 'Use example';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    fill();
  });
  head.appendChild(btn);
}

function makePanel() {
  const panel = document.createElement('div');
  panel.className = 'dialog-panel';
  panel.setAttribute('role', 'tabpanel');
  return panel;
}

// A minimal but valid VSCode theme used by the theme dialog's "Use example".
const EXAMPLE_THEME_JSON = JSON.stringify({
  name: 'Example Midnight',
  type: 'dark',
  colors: {
    'editor.background': '#11131a',
    'editor.foreground': '#e6e6e6',
  },
  tokenColors: [
    { scope: 'comment', settings: { foreground: '#6b7280', fontStyle: 'italic' } },
    { scope: 'keyword', settings: { foreground: '#c792ea' } },
    { scope: 'string', settings: { foreground: '#c3e88d' } },
    { scope: 'function', settings: { foreground: '#82aaff' } },
  ],
}, null, 2);

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

  const status = document.createElement('div');
  status.className = 'dialog-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const setStatus = (msg, kind) => {
    status.className = 'dialog-status' + (kind ? ' is-' + kind : '');
    status.textContent = msg || '';
  };

  const TABS = [
    { id: 'url', label: 'From URL' },
    { id: 'fontface', label: 'Paste @font-face' },
    { id: 'installed', label: 'Installed' },
  ];

  // ── From URL ──────────────────────────────────────────────
  const urlPanel = makePanel();
  const urlField = makeField({
    label: 'Font CSS URL',
    placeholder: 'https://fonts.googleapis.com/css2?family=Example&display=swap',
  });
  const urlName = makeField({ label: 'Display name', placeholder: 'My Font' });
  addExampleButton(urlField.head, () => {
    urlField.control.value = 'https://fonts.googleapis.com/css2?family=Roboto+Mono&display=swap';
    urlName.control.value = 'Roboto Mono';
    setStatus('', null);
  });
  urlPanel.append(urlField.wrap, urlName.wrap);

  // ── Paste @font-face ──────────────────────────────────────
  const ffPanel = makePanel();
  const ffField = makeField({
    label: '@font-face CSS',
    placeholder: '@font-face {\n  font-family: "My Font";\n  src: url("https://.../my-font.woff2") format("woff2");\n}',
    multiline: true,
    rows: 6,
  });
  const ffName = makeField({ label: 'Display name', placeholder: 'My Font' });
  addExampleButton(ffField.head, () => {
    ffField.control.value = '@font-face {\n  font-family: "Example Mono";\n  font-weight: 400;\n  font-style: normal;\n  src: url("https://example.com/fonts/example-mono.woff2") format("woff2");\n}';
    ffName.control.value = 'Example Mono';
    setStatus('', null);
  });
  ffPanel.append(ffField.wrap, ffName.wrap);

  // ── Already installed ─────────────────────────────────────
  const instPanel = makePanel();
  const instField = makeField({ label: 'Font name', placeholder: 'e.g. Fira Code, JetBrains Mono' });
  const instActions = document.createElement('div');
  instActions.className = 'field-actions';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn-secondary';
  checkBtn.textContent = 'Check';
  const addFoundBtn = document.createElement('button');
  addFoundBtn.type = 'button';
  addFoundBtn.className = 'btn-primary';
  addFoundBtn.textContent = 'Add this font';
  addFoundBtn.hidden = true;
  instActions.append(checkBtn, addFoundBtn);
  instPanel.append(instField.wrap, instActions);

  let foundFont = null;
  const runCheck = () => {
    const name = instField.control.value.trim();
    if (!name) {
      setStatus('Enter a font name to check.', 'error');
      addFoundBtn.hidden = true;
      foundFont = null;
      return;
    }
    const font = registerFoundFont(name);
    if (font) {
      setStatus(`"${font.name}" is installed on this system.`, 'success');
      addFoundBtn.hidden = false;
      foundFont = font;
      addFoundBtn.focus();
    } else {
      setStatus(`"${name}" was not found on this system.`, 'error');
      addFoundBtn.hidden = true;
      foundFont = null;
    }
  };
  checkBtn.addEventListener('click', runCheck);
  instField.control.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runCheck(); }
  });
  addFoundBtn.addEventListener('click', () => {
    if (!foundFont) return;
    onFontAdded?.(foundFont);
    dialog.close();
  });

  const panels = { url: urlPanel, fontface: ffPanel, installed: instPanel };

  // ── Footer ────────────────────────────────────────────────
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add font';
  footer.append(cancelBtn, submitBtn);

  // ── Segmented control ─────────────────────────────────────
  const segments = document.createElement('div');
  segments.className = 'dialog-segments';
  segments.setAttribute('role', 'tablist');
  const segBtns = {};

  let active = null;
  const activate = (id) => {
    if (id === active) return;
    active = id;
    for (const t of TABS) {
      segBtns[t.id].setAttribute('aria-selected', t.id === id ? 'true' : 'false');
      panels[t.id].hidden = t.id !== id;
    }
    // The Installed panel manages its own Check → "Add this font" two-step.
    submitBtn.hidden = id === 'installed';
    addFoundBtn.hidden = true;
    foundFont = null;
    setStatus('', null);
  };

  for (const t of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dialog-segment';
    b.textContent = t.label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.addEventListener('click', () => activate(t.id));
    segBtns[t.id] = b;
    segments.appendChild(b);
  }

  const finishAdd = (spec) => {
    // custom- prefix so a name like "JetBrains Mono" can't shadow a repo font id.
    spec.id = slugify(spec.name);
    let result;
    try {
      result = registerCustomFont(spec); // single writer
    } catch (e) {
      setStatus('Failed to register font: ' + e.message, 'error');
      return;
    }
    onFontAdded?.(result.font);
    setStatus(result.persisted ? 'Font added ✓' : 'Font added for this session (could not save to local storage).', 'success');
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    const closeTimer = setTimeout(() => {
      dialog.close();
      if (result.persisted) {
        onStatus?.('Custom fonts are stored locally and will fall back to defaults if this URL is shared to another device.');
      }
    }, 900);
    // Cancel the deferred close+toast if the user dismisses the dialog first.
    dialog.addEventListener('close', () => clearTimeout(closeTimer), { once: true });
  };

  submitBtn.addEventListener('click', () => {
    if (active === 'url') {
      const url = urlField.control.value.trim();
      const name = urlName.control.value.trim();
      if (!url) return setStatus('Please enter a font CSS URL.', 'error');
      if (!/^https:\/\//i.test(url)) return setStatus('Font URL must start with https://', 'error');
      if (!name) return setStatus('Please enter a display name.', 'error');
      finishAdd({ name, cssUrl: url });
    } else if (active === 'fontface') {
      const css = ffField.control.value.trim();
      const name = ffName.control.value.trim();
      if (!css) return setStatus('Please paste an @font-face rule.', 'error');
      const safe = sanitizeFontFace(css);
      if (!safe) return setStatus('No usable @font-face rule found in the pasted CSS.', 'error');
      if (!name) return setStatus('Please enter a display name.', 'error');
      finishAdd({ name, fontFaceCss: safe });
    }
  });

  body.append(segments, urlPanel, ffPanel, instPanel, status);
  activate('url');

  document.body.appendChild(dialog);
  dialog.showModal();
  urlField.control.focus();

  dialog.addEventListener('close', () => dialog.remove());
}

function showThemeDialog({ onThemeAdded, onStatus }) {
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Add Custom Theme';

  const status = document.createElement('div');
  status.className = 'dialog-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const setStatus = (msg, kind) => {
    status.className = 'dialog-status' + (kind ? ' is-' + kind : '');
    status.textContent = msg || '';
  };

  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  const dropIcon = document.createElement('div');
  dropIcon.className = 'drop-zone-icon';
  dropIcon.appendChild(svgIcon(['M12 3v12', 'M7.5 10.5 12 15l4.5-4.5', 'M5 20h14'], 30));
  const dropText = document.createElement('div');
  dropText.textContent = 'Drop a .json theme file here, or click to browse';
  dropZone.append(dropIcon, dropText);
  body.appendChild(dropZone);

  const jsonField = makeField({ label: 'Theme JSON', placeholder: 'Paste VSCode theme JSON here…', multiline: true, rows: 8 });
  const jsonInput = jsonField.control;
  addExampleButton(jsonField.head, () => {
    jsonInput.value = EXAMPLE_THEME_JSON;
    setStatus('', null);
  });
  body.appendChild(jsonField.wrap);

  const readFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setStatus('Only .json files are accepted.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { jsonInput.value = reader.result; setStatus('', null); };
    reader.onerror = () => setStatus('Failed to read file.', 'error');
    reader.readAsText(file);
  };

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
    readFile(e.dataTransfer?.files?.[0]);
  });
  dropZone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => readFile(input.files?.[0]));
    input.click();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add theme';
  submitBtn.addEventListener('click', () => {
    const json = jsonInput.value.trim();
    if (!json) return setStatus('Please paste or drop a theme JSON file.', 'error');

    let theme;
    try {
      theme = JSON.parse(json);
    } catch (e) {
      return setStatus('Invalid JSON: ' + e.message, 'error');
    }
    if (!theme.colors && !theme.tokenColors && !theme.settings) {
      return setStatus('Not a valid VSCode theme: missing colors, tokenColors, or settings.', 'error');
    }
    const colorErr = validateThemeColors(theme);
    if (colorErr) return setStatus('Theme rejected — ' + colorErr, 'error');

    const id = slugify(theme.name || 'unnamed');
    const persisted = storeCustomTheme(id, theme);
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    registerRuntimeTheme(id, theme).then(() => {
      onThemeAdded?.({ id, name: theme.name || id, type: theme.type || 'dark' });
      setStatus(persisted ? 'Theme added ✓' : 'Theme added for this session (could not save to local storage).', 'success');
      const closeTimer = setTimeout(() => {
        dialog.close();
        if (persisted) {
          onStatus?.('Custom themes are stored locally and will fall back to defaults if this URL is shared to another device.');
        }
      }, 900);
      // Cancel the deferred close+toast if the user dismisses the dialog first.
      dialog.addEventListener('close', () => clearTimeout(closeTimer), { once: true });
    }).catch(e => {
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      setStatus('Failed to load theme: ' + e.message, 'error');
    });
  });
  footer.append(cancelBtn, submitBtn);

  body.appendChild(status);

  document.body.appendChild(dialog);
  dialog.showModal();
  jsonInput.focus();

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
