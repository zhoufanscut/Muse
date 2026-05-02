import { getState, setState, subscribe } from '../state.js';
import { loadWebFont } from '../fonts.js';

let mountState = null;

function createFontPill(font) {
  if (!mountState || mountState.entryMap.has(font.id)) return;
  if (!mountState.allFonts.some(f => f.id === font.id)) {
    mountState.allFonts.push(font);
  }

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
  mountState.ul.appendChild(li);
  mountState.entryMap.set(font.id, { li, statusBadge });
  if (mountState.ul.isConnected) mountState.observer.observe(li);

  const handleSelect = async () => {
    setState({ font: font.id });

    if (!isInstalled) {
      statusBadge.style.display = 'inline-block';
      statusBadge.className = 'spinner';
      statusBadge.textContent = '';

      const success = await loadWebFont(font);

      statusBadge.className = success ? 'badge-installed' : 'badge-error';
      statusBadge.textContent = success ? '\u2713' : 'could not load';
    }
  };

  li.addEventListener('click', handleSelect);

  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      li.nextElementSibling?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      li.previousElementSibling?.focus();
    }
  });
}

export function mountFontsSidebar({ container, manifests, installedFonts }) {
  const allFonts = [...manifests, ...installedFonts];

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
              statusBadge.textContent = success ? '\u2713' : 'could not load';
            });
          }
        }
        observer.unobserve(entry.target);
      }
    }
  }, { root: container, rootMargin: '50px' });

  mountState = { ul, entryMap, container, observer, allFonts };

  container.appendChild(ul);

  for (const font of allFonts) {
    createFontPill(font);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'pill';
  addBtn.textContent = '+ Add font';
  addBtn.id = 'add-font-btn';
  addBtn.style.marginTop = '16px';
  addBtn.style.width = '100%';
  addBtn.style.justifyContent = 'center';

  container.appendChild(addBtn);

  subscribe((state) => {
    for (const [id, { li }] of entryMap) {
      li.setAttribute('aria-selected', id === state.font ? 'true' : 'false');
    }
  });
}

export function addCustomFontPill(font) {
  if (!mountState || mountState.entryMap.has(font.id)) return;
  createFontPill(font);
}
