import { getState, setState, subscribe } from '../state.js';
import { loadWebFont, removeCustomFont, removeFoundFont } from '../fonts.js';
import { fuzzyScore, nextVisiblePill, prevVisiblePill } from './search.js';

// State is captured per-mount in this closure (no module singleton) so a second
// sidebar could be mounted without clobbering the first.
export function mountFontsSidebar({ container, manifests, installedFonts }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const allFonts = [...installedFonts.sort(byName), ...manifests.sort(byName)];

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  ul.style.margin = '0';
  ul.style.display = 'flex';
  ul.style.flexDirection = 'column';
  ul.style.gap = '8px';

  const entryMap = new Map();

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const fontId = entry.target.dataset.fontId;
        const font = allFonts.find(f => f.id === fontId);
        const isInstalled = font && (font.installed || !font.cssUrl);
        if (font && !isInstalled) {
          const { statusBadge } = entryMap.get(fontId) || {};
          if (statusBadge && statusBadge.style.display === 'none') {
            statusBadge.style.display = 'inline-block';
            statusBadge.className = 'spinner';
            statusBadge.textContent = '';

            loadWebFont(font).then(success => {
              statusBadge.className = success ? 'badge-installed' : 'badge-error';
              statusBadge.textContent = success ? '✓' : 'could not load';
            });
          }
        }
        observer.unobserve(entry.target);
      }
    }
  }, { root: container, rootMargin: '50px' });

  let searchQuery = '';

  function applyFilter() {
    for (const [id, { li }] of entryMap) {
      const font = allFonts.find(f => f.id === id);
      const matches = !searchQuery ||
        fuzzyScore(searchQuery, font.name) > 0 ||
        fuzzyScore(searchQuery, font.id) > 0;
      li.style.display = matches ? '' : 'none';
    }
  }

  function removeFont(id) {
    const entry = entryMap.get(id);
    if (entry) {
      observer.unobserve(entry.li);
      entry.li.remove();
      entryMap.delete(id);
    }
    const idx = allFonts.findIndex(f => f.id === id);
    if (idx >= 0) allFonts.splice(idx, 1);
    // custom- uploads live in muse:custom-fonts; user-added installed fonts in
    // muse:found-fonts. Route to the right store so removal actually persists.
    if (id.startsWith('custom-')) removeCustomFont(id);
    else removeFoundFont(id);
    if (getState().font === id && allFonts[0]) setState({ font: allFonts[0].id });
  }

  function createFontPill(font) {
    if (entryMap.has(font.id)) return;
    if (!allFonts.some(f => f.id === font.id)) allFonts.push(font);

    const li = document.createElement('li');
    li.className = 'pill';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', font.id === getState().font ? 'true' : 'false');
    li.dataset.fontId = font.id;
    li.tabIndex = 0;
    li.style.display = 'flex';
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';
    topRow.style.width = '100%';

    const name = document.createElement('span');
    name.textContent = font.name;
    name.style.fontWeight = '600';

    const badgeContainer = document.createElement('div');
    badgeContainer.style.display = 'flex';
    badgeContainer.style.alignItems = 'center';
    badgeContainer.style.gap = '6px';

    const isInstalled = font.installed || !font.cssUrl;
    const typeBadge = document.createElement('span');
    typeBadge.className = isInstalled ? 'badge-installed' : 'badge-web';
    typeBadge.textContent = isInstalled ? 'installed' : 'web';

    const statusBadge = document.createElement('span');
    statusBadge.style.display = 'none';

    badgeContainer.append(statusBadge, typeBadge);

    // Anything the user added is removable: custom- uploads (muse:custom-fonts)
    // and fonts added via the Installed tab (muse:found-fonts, flagged userAdded).
    // Repo fonts and auto-detected system fonts are not.
    if (font.id.startsWith('custom-') || font.userAdded) {
      badgeContainer.appendChild(createRemoveButton(
        `Remove "${font.name}" from your fonts?`,
        `Remove ${font.name}`,
        () => removeFont(font.id),
      ));
    }

    topRow.append(name, badgeContainer);

    const preview = document.createElement('div');
    preview.style.fontFamily = font.stack;
    preview.style.fontSize = '1.1em';
    preview.style.opacity = '0.7';
    preview.style.marginTop = '4px';
    preview.style.whiteSpace = 'nowrap';
    preview.style.overflow = 'hidden';
    preview.style.textOverflow = 'ellipsis';
    preview.style.width = '100%';
    preview.textContent = font.name;

    li.append(topRow, preview);
    ul.appendChild(li);
    entryMap.set(font.id, { li, statusBadge });
    if (ul.isConnected) observer.observe(li);

    const handleSelect = async () => {
      setState({ font: font.id });

      if (!isInstalled) {
        statusBadge.style.display = 'inline-block';
        statusBadge.className = 'spinner';
        statusBadge.textContent = '';

        const success = await loadWebFont(font);

        statusBadge.className = success ? 'badge-installed' : 'badge-error';
        statusBadge.textContent = success ? '✓' : 'could not load';
      }
    };

    li.addEventListener('click', handleSelect);

    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextVisiblePill(li)?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevVisiblePill(li)?.focus();
      }
    });
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search-wrap';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search fonts…';
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

  container.appendChild(ul);

  for (const font of allFonts) {
    createFontPill(font);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'sidebar-add-btn';
  addBtn.id = 'add-font-btn';
  const addIcon = document.createElement('span');
  addIcon.className = 'add-btn-icon';
  addIcon.textContent = '+';
  addIcon.setAttribute('aria-hidden', 'true');
  addBtn.append(addIcon, document.createTextNode('Add font'));

  const addWrap = document.createElement('div');
  addWrap.className = 'sidebar-add-wrap';
  addWrap.appendChild(addBtn);
  container.appendChild(addWrap);

  subscribe((state) => {
    for (const [id, { li }] of entryMap) {
      li.setAttribute('aria-selected', id === state.font ? 'true' : 'false');
    }
  });

  function addCustomFontPill(font) {
    if (entryMap.has(font.id)) return;
    createFontPill(font);
    applyFilter();
  }

  return { addCustomFontPill };
}

// Small "×" used to delete a user-added pill (hover/focus-revealed on pointer
// devices, always shown on touch — see .pill-remove in style.css).
export function createRemoveButton(confirmMsg, ariaLabel, onRemove) {
  const btn = document.createElement('button');
  btn.className = 'pill-remove';
  btn.textContent = '×';
  btn.title = 'Remove';
  btn.setAttribute('aria-label', ariaLabel);
  btn.tabIndex = -1;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(confirmMsg)) onRemove();
  });
  return btn;
}
