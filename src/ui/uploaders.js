import { registerCustomFont, installFont } from '../fonts.js';
import { getHighlighter, markThemeLoaded } from '../themes.js';

const FONT_KEY = 'muse:custom-fonts';
const THEME_KEY = 'muse:custom-themes';

function slugify(name) {
  return 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
    const url = cssInput.value.trim();
    const name = nameInput.value.trim();

    if (!url) {
      onStatus?.('Please enter a font URL or @font-face CSS.');
      return;
    }
    if (!url.startsWith('http') && !url.includes('@font-face')) {
      onStatus?.('Input must be a URL or @font-face CSS.');
      return;
    }
    if (!name) {
      onStatus?.('Please enter a display name.');
      return;
    }

    try {
      const spec = url.includes('@font-face') ? { name, fontFaceCss: url } : { name, cssUrl: url };
      const font = registerCustomFont(spec); // persists via registerCustomFont (single writer)

      onFontAdded?.(font || spec);
      dialog.close();
      onStatus?.('Font added. Note: Custom fonts are stored locally and will fall back to defaults if this URL is shared to another device.');
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
      const id = slugify(theme.name || 'unnamed');

      storeCustomTheme(id, theme);
      registerRuntimeTheme(id, theme).then(() => {
        onThemeAdded?.({ id, name: theme.name || id, type: theme.type || 'dark' });
        dialog.close();
        onStatus?.('Theme added. Note: Custom themes are stored locally and will fall back to defaults if this URL is shared to another device.');
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

  function onStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    setTimeout(() => {
      if (statusEl.textContent === msg) {
        statusEl.style.display = 'none';
      }
    }, 6000);
  }

  addFontBtn?.addEventListener('click', () => {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.style.cssText = 'position:fixed;bottom:16px;right:16px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px 18px;font-size:0.85rem;max-width:380px;z-index:10000;display:none;';
      document.body.appendChild(statusEl);
    }
    showFontDialog({ onFontAdded, onStatus });
  });

  addThemeBtn?.addEventListener('click', () => {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.style.cssText = 'position:fixed;bottom:16px;right:16px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px 18px;font-size:0.85rem;max-width:380px;z-index:10000;display:none;';
      document.body.appendChild(statusEl);
    }
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
  } catch (e) {
    console.error(e);
  }
}

export function getRuntimeTheme(id) {
  return runtimeThemes.get(id);
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
