import { getState, setState, subscribe } from '../state.js';

export function mountControls({ controlsBar, langTabsContainer, langManifests, onExport, previewId }) {
  const state = getState();

  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'Size';
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = '10';
  sizeSlider.max = '22';
  sizeSlider.step = '1';
  sizeSlider.value = String(state.size);
  sizeSlider.setAttribute('aria-valuetext', state.size + 'px');
  // The readout duplicates the slider's value for sighted users; keep it out of
  // the accessible name (which the <label> text "Size" provides) so screen
  // readers announce "Size, 14px" rather than "Size 14px, 14".
  const sizeReadout = document.createElement('span');
  sizeReadout.setAttribute('aria-hidden', 'true');
  sizeReadout.textContent = state.size + 'px';

  sizeSlider.addEventListener('input', () => {
    const v = Number(sizeSlider.value);
    sizeReadout.textContent = v + 'px';
    sizeSlider.setAttribute('aria-valuetext', v + 'px');
    setState({ size: v });
  });
  sizeLabel.append(sizeSlider, sizeReadout);

  const ligaLabel = document.createElement('label');
  ligaLabel.textContent = 'Ligatures';
  const ligaCheck = document.createElement('input');
  ligaCheck.type = 'checkbox';
  ligaCheck.checked = state.ligatures;
  ligaCheck.addEventListener('change', () => setState({ ligatures: ligaCheck.checked }));
  ligaLabel.prepend(ligaCheck);

  const italicLabel = document.createElement('label');
  italicLabel.textContent = 'Italic comments';
  const italicCheck = document.createElement('input');
  italicCheck.type = 'checkbox';
  italicCheck.checked = state.italic;
  italicCheck.addEventListener('change', () => setState({ italic: italicCheck.checked }));
  italicLabel.prepend(italicCheck);

  controlsBar.append(sizeLabel, ligaLabel, italicLabel);

  if (onExport) {
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'export-btn';
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Use this font + theme in VS Code';
    exportBtn.addEventListener('click', onExport);
    controlsBar.appendChild(exportBtn);
  }

  // Language tabs: roving tabindex (the selected tab is the single Tab stop),
  // Arrow/Home/End move focus, Enter/Space activate (native button behavior).
  const tabMap = new Map();
  const tabs = [];
  for (const manifest of langManifests) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'pill lang-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', manifest.id === state.lang ? 'true' : 'false');
    if (previewId) tab.setAttribute('aria-controls', previewId);
    tab.textContent = manifest.label;
    if (typeof manifest.summary === 'string') tab.title = manifest.summary;
    tab.dataset.langId = manifest.id;
    tab.addEventListener('click', () => setState({ lang: manifest.id }));
    langTabsContainer.appendChild(tab);
    tabMap.set(manifest.id, tab);
    tabs.push(tab);

    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      let target = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') target = tabs[0];
      else if (e.key === 'End') target = tabs[tabs.length - 1];
      if (!target) return;
      e.preventDefault();
      target.focus();
    });
  }

  subscribe((s) => {
    sizeSlider.value = String(s.size);
    sizeSlider.setAttribute('aria-valuetext', s.size + 'px');
    sizeReadout.textContent = s.size + 'px';
    ligaCheck.checked = s.ligatures;
    italicCheck.checked = s.italic;
    for (const [id, tab] of tabMap) {
      const selected = id === s.lang;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    }
  });
}
