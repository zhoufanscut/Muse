// muse/main — boot orchestrator

import { getState, subscribe, setCatalog } from './state.js';
import { getHighlighter } from './themes.js';
import { fetchJson } from './util.js';
import { loadFontManifests, detectInstalledFonts, restoreFoundFonts } from './fonts.js';
import { loadLanguageManifests } from './languages.js';
import { renderPreview, updateFontSize } from './preview.js';
import { mountFontsSidebar } from './ui/sidebar-fonts.js';
import { mountThemesSidebar } from './ui/sidebar-themes.js';
import { mountControls } from './ui/controls.js';
import { mountUploaders, restoreCustom } from './ui/uploaders.js';

try {
  // Fetch the built-in theme list once and hand it to the highlighter; later
  // no-arg getHighlighter() / mountThemesSidebar reuse it instead of re-fetching.
  const builtinThemeIds = await fetchJson('./data/themes/_builtin.json');
  const builtinThemes = new Set(builtinThemeIds);

  await getHighlighter(builtinThemeIds);

  const index = await fetchJson('./data/_index.json', { cache: 'no-store' });

  const [fontManifests, langManifests] = await Promise.all([
    loadFontManifests(index.fonts),
    loadLanguageManifests(index.languages),
  ]);

  const installedFonts = detectInstalledFonts();
  const manifestIds = new Set(fontManifests.map(f => f.id));
  const foundFonts = restoreFoundFonts();
  for (const f of foundFonts) {
    // A found font is only "user-added" (removable) when no shipped source
    // already covers its id: not auto-detected from the hardcoded probe list,
    // and not a repo manifest. A shipped match supplies its own non-removable
    // pill and reappears on reload regardless, so a removable found-shadow would
    // both violate "shipped fonts stay" and be pointless to delete.
    if (installedFonts.some(inst => inst.id === f.id) || manifestIds.has(f.id)) continue;
    installedFonts.push({ ...f, userAdded: true });
  }
  const allFonts = [...installedFonts, ...fontManifests];

  function rememberFont(font) {
    if (font && !allFonts.some(f => f.id === font.id)) {
      allFonts.push(font);
    }
    return font;
  }

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

  const fontsSidebar = mountFontsSidebar({ container: sidebarFonts, manifests: fontManifests, installedFonts });

  const themesSidebar = await mountThemesSidebar({ container: sidebarThemes, builtinThemes: builtinThemeIds, customThemes: [] });

  mountControls({
    controlsBar,
    langTabsContainer: langTabs,
    langManifests,
  });

  const addThemeBtn = document.getElementById('add-theme-btn');

  mountUploaders({
    addFontBtn: document.getElementById('add-font-btn'),
    addThemeBtn,
    onFontAdded: (font) => { fontsSidebar.addCustomFontPill(rememberFont(font)); },
    onThemeAdded: ({ id }) => { themesSidebar.addCustomThemePill(id); },
  });

  await restoreCustom({
    onFontAdded: (font) => { fontsSidebar.addCustomFontPill(rememberFont(font)); },
    onThemeAdded: ({ id }) => { themesSidebar.addCustomThemePill(id); },
  });

  function currentLangManifest() {
    const state = getState();
    return langManifests.find(m => m.id === state.lang) || langManifests[0];
  }

  function currentFontManifest() {
    const state = getState();
    return allFonts.find(f => f.id === state.font) || allFonts[0];
  }

  let booted = false;
  let prev = null;
  let rendering = false;

  subscribe(async (_state) => {
    // Size-only fast path: when nothing but `size` changed and no full render is
    // in flight, update CSS font-size directly instead of re-tokenizing.
    if (booted && !rendering && prev &&
        _state.font === prev.font && _state.theme === prev.theme &&
        _state.lang === prev.lang && _state.ligatures === prev.ligatures &&
        _state.italic === prev.italic && _state.size !== prev.size) {
      updateFontSize(previewPane, _state.size);
      prev = _state;
      return;
    }
    prev = _state;

    const font = currentFontManifest();
    const langManifest = currentLangManifest();

    rendering = true;
    try {
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
    } finally {
      rendering = false;
    }

    if (!booted) {
      booted = true;
      const overlay = document.getElementById('boot-overlay');
      if (overlay) overlay.remove();
    }
  });
} catch (e) {
  console.error(e);
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    overlay.textContent = `Failed to start: ${e.message}`;
    overlay.style.color = '#ff8080';
  }
}
