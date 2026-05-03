import { createHighlighter } from 'https://esm.sh/shiki@1.24.0';

let highlighterPromise = null;
const loadedLangs = new Set();
const loadedThemes = new Set();

const COMMENT_STYLE_SCOPES = [
  'comment',
  'comment.line',
  'comment.line.double-slash',
  'comment.line.number-sign',
  'comment.block',
  'comment.block.documentation',
  'punctuation.definition.comment',
];

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

export async function ensureCommentStyleTheme(id, italic) {
  const variant = `${id}__muse-comments-${italic ? 'italic' : 'normal'}`;
  if (loadedThemes.has(variant)) return variant;

  if (!loadedThemes.has(id)) {
    await ensureCustomTheme(id);
  }

  const base = await getKnownTheme(id);
  const theme = withCommentStyle(base, variant, italic);
  const h = await getHighlighter();
  await h.loadTheme(theme);
  loadedThemes.add(variant);
  return variant;
}

function withCommentStyle(base, name, italic) {
  const theme = { ...base, name };
  const commentRule = {
    scope: COMMENT_STYLE_SCOPES,
    settings: { fontStyle: italic ? 'italic' : '' },
  };

  if (Array.isArray(base.tokenColors)) {
    theme.tokenColors = cloneThemeRules(base.tokenColors).concat(commentRule);
  }
  if (Array.isArray(base.settings)) {
    theme.settings = cloneThemeRules(base.settings).concat(commentRule);
  }
  if (!Array.isArray(theme.tokenColors) && !Array.isArray(theme.settings)) {
    theme.tokenColors = [commentRule];
  }

  return theme;
}

function cloneThemeRules(rules) {
  return rules.map(rule => ({
    ...rule,
    settings: rule.settings ? { ...rule.settings } : rule.settings,
  }));
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
