import { createHighlighter } from 'https://esm.sh/shiki@1.24.0';

let highlighterPromise = null;
const loadedLangs = new Set();
const loadedThemes = new Set();

async function bootstrap() {
  const builtin = await fetch('./data/themes/_builtin.json').then(r => r.json());
  const h = await createHighlighter({ themes: builtin, langs: [] });
  for (const name of builtin) loadedThemes.add(name);
  return h;
}

export function getHighlighter() {
  if (!highlighterPromise) highlighterPromise = bootstrap();
  return highlighterPromise;
}

export async function ensureLang(shikiLang) {
  if (loadedLangs.has(shikiLang)) return;
  const h = await getHighlighter();
  await h.loadLanguage(shikiLang);
  loadedLangs.add(shikiLang);
}

export async function ensureCustomTheme(id) {
  if (loadedThemes.has(id)) return;
  const raw = await fetch(`./data/themes/${id}.json`).then(r => r.json());
  // CRITICAL: filename stem is canonical. Override the embedded "name" so URL
  // state, localStorage, and Shiki all agree on the same id.
  const theme = { ...raw, name: id };
  const h = await getHighlighter();
  await h.loadTheme(theme);
  loadedThemes.add(id);
}

export async function highlight(code, lang, theme) {
  await ensureLang(lang);
  // Caller is responsible for awaiting ensureCustomTheme(theme) when theme is custom.
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang, theme });
}

export async function getKnownTheme(name) {
  const h = await getHighlighter();
  return h.getTheme(name);
}

export function markThemeLoaded(id) { loadedThemes.add(id); }
export function isThemeLoaded(id) { return loadedThemes.has(id); }
