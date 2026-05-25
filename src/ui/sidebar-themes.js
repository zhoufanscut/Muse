import { getState, setState, subscribe } from '../state.js';
import { getKnownTheme, ensureCustomTheme } from '../themes.js';
import { fuzzyScore, nextVisiblePill, prevVisiblePill } from './search.js';
import { fetchJson } from '../util.js';
import { createRemoveButton } from './sidebar-fonts.js';
import { removeCustomTheme } from './uploaders.js';

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
  // Luminance heuristic on editor.background; unknown/non-hex bg defaults to dark
  // rather than the old false "LIGHT" (e.g. "transparent" or a named color).
  const bg = theme.colors?.['editor.background'];
  if (typeof bg !== 'string' || !/^#[0-9a-fA-F]{6}/.test(bg)) return true;
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

// State is captured per-mount in this closure (no module singleton).
export async function mountThemesSidebar({ container, builtinThemes = null, customThemes = [] }) {
  const builtinList = builtinThemes || await fetchJson('./data/themes/_builtin.json');

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  ul.setAttribute('aria-label', 'Themes');

  const pills = new Map();
  let searchQuery = '';

  function applyFilter() {
    for (const [id, pill] of pills) {
      const matches = !searchQuery || fuzzyScore(searchQuery, id) > 0;
      pill.style.display = matches ? '' : 'none';
    }
  }

  function removeTheme(id) {
    const pill = pills.get(id);
    if (pill) { pill.remove(); pills.delete(id); }
    removeCustomTheme(id);
    if (getState().theme === id) {
      const fallback = [...pills.keys()][0];
      if (fallback) setState({ theme: fallback });
    }
  }

  function createThemePill(id, isCustom) {
    if (pills.has(id)) return;

    const li = document.createElement('li');
    li.className = 'pill pill-theme';
    li.setAttribute('role', 'option');
    li.setAttribute('tabindex', '0');
    li.dataset.id = id;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = id;
    li.appendChild(nameSpan);

    const pillMeta = document.createElement('div');
    pillMeta.className = 'pill-meta';

    const badge = document.createElement('span');
    badge.className = isCustom ? 'badge-installed' : 'badge-web';
    badge.textContent = '...';
    pillMeta.appendChild(badge);

    const swatchStrip = document.createElement('div');
    swatchStrip.className = 'swatch-strip';
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      span.style.backgroundColor = 'transparent';
      swatchStrip.appendChild(span);
    }
    pillMeta.appendChild(swatchStrip);

    // Custom uploads (custom- prefix, stored in muse:custom-themes) are removable.
    if (isCustom) {
      pillMeta.appendChild(createRemoveButton(
        `Remove custom theme "${id}"?`,
        `Remove ${id}`,
        () => removeTheme(id),
      ));
    }

    li.appendChild(pillMeta);

    ul.appendChild(li);
    pills.set(id, li);

    li.addEventListener('click', () => {
      setState({ theme: id });
    });

    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setState({ theme: id });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextVisiblePill(li)?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevVisiblePill(li)?.focus();
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

  function addCustomThemePill(id) {
    if (pills.has(id)) return;
    createThemePill(id, true);

    // Insert at correct alphabetical position among all pills
    const pill = pills.get(id);
    const sortedIds = [...pills.keys()].sort((a, b) => a.localeCompare(b));
    const idx = sortedIds.indexOf(id);
    if (idx < sortedIds.length - 1) {
      const afterPill = pills.get(sortedIds[idx + 1]);
      ul.insertBefore(pill, afterPill);
    }

    applyFilter();
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search-wrap';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search themes…';
  searchInput.className = 'sidebar-search';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'sidebar-search-clear';
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.tabIndex = -1;
  clearBtn.textContent = '×';
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  });

  searchWrap.append(searchInput, clearBtn);
  container.appendChild(searchWrap);

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    searchWrap.classList.toggle('has-value', searchQuery.length > 0);
    applyFilter();
  });

  const sortedBuiltins = [...builtinList].sort((a, b) => a.localeCompare(b));
  for (const builtin of sortedBuiltins) {
    createThemePill(builtin, false);
  }
  [...customThemes].sort((a, b) => a.localeCompare(b)).forEach(id => createThemePill(id, true));

  container.appendChild(ul);

  const addButton = document.createElement('button');
  addButton.className = 'pill';
  addButton.id = 'add-theme-btn';
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

  return { addCustomThemePill };
}
