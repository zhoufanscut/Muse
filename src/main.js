// muse/main — boot orchestrator

import { getState, subscribe, setCatalog } from './state.js';
import { getHighlighter } from './themes.js';
import { loadFontManifests, detectInstalledFonts, loadWebFont } from './fonts.js';
import { loadLanguageManifests } from './languages.js';
import { renderPreview } from './preview.js';
import { mountFontsSidebar, addCustomFontPill } from './ui/sidebar-fonts.js';
import { mountThemesSidebar, addCustomThemePill } from './ui/sidebar-themes.js';
import { mountControls } from './ui/controls.js';
import { mountUploaders, restoreCustom } from './ui/uploaders.js';

try {
  await getHighlighter();

  const index = await fetch('./data/_index.json').then(r => r.json());

  const [fontManifests, langManifests] = await Promise.all([
    loadFontManifests(index.fonts),
    loadLanguageManifests(index.languages),
  ]);

  const installedFonts = detectInstalledFonts();

  const builtinThemeIds = await fetch('./data/themes/_builtin.json').then(r => r.json());
  const builtinThemes = new Set(builtinThemeIds);

  // Read runtime-uploaded ids from localStorage BEFORE setCatalog validates state.
  // Otherwise, state.theme / state.font pointing to a runtime asset gets clobbered
  // to DEFAULTS before restoreCustom has a chance to register them.
  let runtimeThemeIds = [];
  let runtimeFontIds = [];
  try {
    runtimeThemeIds = JSON.parse(localStorage.getItem('muse:custom-themes') || '[]')
      .map(t => t.id).filter(Boolean);
  } catch {}
  try {
    runtimeFontIds = JSON.parse(localStorage.getItem('muse:custom-fonts') || '[]')
      .map(f => f.id || (f.name || '').toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);
  } catch {}

  setCatalog({
    fonts: [
      ...fontManifests.map(f => f.id),
      ...installedFonts.map(f => f.id),
      ...runtimeFontIds,
    ],
    themes: [...builtinThemeIds, ...index.themes, ...runtimeThemeIds],
    languages: langManifests.map(l => l.id),
  });

  const sidebarFonts = document.querySelector('.sidebar-fonts');
  const sidebarThemes = document.querySelector('.sidebar-themes');
  const controlsBar = document.querySelector('.controls-bar');
  const langTabs = document.querySelector('.lang-tabs');
  const previewPane = document.querySelector('.preview-pane');

  mountFontsSidebar({ container: sidebarFonts, manifests: fontManifests, installedFonts });

  await mountThemesSidebar({ container: sidebarThemes, customThemes: [] });

  mountControls({
    controlsBar,
    langTabsContainer: langTabs,
    previewPane,
    langManifests,
  });

  const addThemeBtn = sidebarThemes.querySelector('button');

  mountUploaders({
    addFontBtn: document.getElementById('add-font-btn'),
    addThemeBtn,
    onFontAdded: (font) => { addCustomFontPill(font); },
    onThemeAdded: ({ id }) => { addCustomThemePill(id); },
  });

  await restoreCustom({
    onFontAdded: (font) => { addCustomFontPill(font); },
    onThemeAdded: ({ id }) => { addCustomThemePill(id); },
  });

  function currentLangManifest() {
    const state = getState();
    return langManifests.find(m => m.id === state.lang) || langManifests[0];
  }

  function currentFontManifest() {
    const state = getState();
    const all = [...fontManifests, ...installedFonts];
    return all.find(f => f.id === state.font) || all[0];
  }

  let booted = false;

  subscribe(async (_state) => {
    const font = currentFontManifest();
    const langManifest = currentLangManifest();

    await renderPreview({
      font,
      theme: _state.theme,
      lang: _state.lang,
      langManifest,
      size: _state.size,
      ligatures: _state.ligatures,
      italic: _state.italic,
      container: previewPane,
      builtinThemes,
    });

    if (!booted) {
      booted = true;
      const overlay = document.getElementById('boot-overlay');
      if (overlay) overlay.remove();
    }
  });

  const initFont = currentFontManifest();
  await loadWebFont(initFont);
} catch (e) {
  console.error(e);
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    overlay.textContent = `Failed to start: ${e.message}`;
    overlay.style.color = '#ff8080';
  }
}
