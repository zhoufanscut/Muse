import { setState, subscribe } from '../state.js';
import { getKnownTheme, ensureCustomTheme } from '../themes.js';

async function extractSwatches(themeName) {
  try {
    const theme = await getKnownTheme(themeName);
    const colors = [];
    const seen = new Set();
    const rules = theme.tokenColors || theme.settings || [];
    for (const rule of rules) {
      const fg = rule.settings?.foreground;
      if (fg && !seen.has(fg)) {
        colors.push(fg);
        seen.add(fg);
      }
      if (colors.length >= 6) break;
    }
    return colors;
  } catch {
    return [];
  }
}

function isDarkTheme(theme) {
  if (theme.type) return theme.type === 'dark';
  // Luminance heuristic on editor.background
  const bg = theme.colors?.['editor.background'] || '#000';
  const r = parseInt(bg.slice(1,3), 16);
  const g = parseInt(bg.slice(3,5), 16);
  const b = parseInt(bg.slice(5,7), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

let mountState = null;

function createThemePill(id, isCustom) {
  if (!mountState || mountState.pills.has(id)) return;

  const li = document.createElement('li');
  li.className = 'pill';
  li.setAttribute('role', 'option');
  li.setAttribute('tabindex', '0');
  li.dataset.id = id;

  const nameSpan = document.createElement('span');
  nameSpan.textContent = id;
  li.appendChild(nameSpan);

  const badge = document.createElement('span');
  badge.className = isCustom ? 'badge-installed' : 'badge-web';
  badge.textContent = '...';
  li.appendChild(badge);

  const swatchStrip = document.createElement('div');
  swatchStrip.className = 'swatch-strip';
  for (let i = 0; i < 6; i++) {
    const span = document.createElement('span');
    span.style.backgroundColor = 'transparent';
    swatchStrip.appendChild(span);
  }
  li.appendChild(swatchStrip);

  mountState.ul.appendChild(li);
  mountState.pills.set(id, li);

  li.addEventListener('click', () => {
    setState({ theme: id });
  });

  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setState({ theme: id });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = li.nextElementSibling;
      if (next && next.classList.contains('pill')) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = li.previousElementSibling;
      if (prev && prev.classList.contains('pill')) prev.focus();
    }
  });

  // Load theme data asynchronously
  (async () => {
    try {
      if (isCustom) {
        await ensureCustomTheme(id);
      }
      const theme = await getKnownTheme(id);
      const dark = isDarkTheme(theme);
      badge.textContent = dark ? 'DARK' : 'LIGHT';

      const swatches = await extractSwatches(id);
      const spans = swatchStrip.querySelectorAll('span');
      swatches.forEach((color, i) => {
        if (spans[i]) spans[i].style.backgroundColor = color;
      });
    } catch (err) {
      badge.className = 'badge-error';
      badge.textContent = 'ERR';
    }
  })();
}

export async function mountThemesSidebar({ container, customThemes = [] }) {
  const builtinThemes = await fetch('./data/themes/_builtin.json').then(r => r.json());

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  ul.setAttribute('aria-label', 'Themes');

  const pills = new Map();
  mountState = { ul, pills, container };

  for (const builtin of builtinThemes) {
    createThemePill(builtin, false);
  }
  for (const id of customThemes) {
    createThemePill(id, true);
  }

  container.appendChild(ul);

  const addButton = document.createElement('button');
  addButton.className = 'pill';
  addButton.style.marginTop = '16px';
  addButton.style.justifyContent = 'center';
  addButton.textContent = '+ Add theme';
  container.appendChild(addButton);

  subscribe((state) => {
    for (const [id, pill] of pills.entries()) {
      const selected = state.theme === id;
      pill.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
  });
}

export function addCustomThemePill(id) {
  if (!mountState || mountState.pills.has(id)) return;
  createThemePill(id, true);
}
