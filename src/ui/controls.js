import { getState, setState, subscribe } from '../state.js';

export function mountControls({ controlsBar, langTabsContainer, previewPane, langManifests }) {
  const state = getState();
  
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'Size';
  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.min = '10';
  sizeSlider.max = '22';
  sizeSlider.step = '1';
  sizeSlider.value = String(state.size);
  const sizeReadout = document.createElement('span');
  sizeReadout.textContent = state.size + 'px';
  
  sizeSlider.addEventListener('input', () => {
    const v = Number(sizeSlider.value);
    sizeReadout.textContent = v + 'px';
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
  
  const tabMap = new Map();
  for (const manifest of langManifests) {
    const tab = document.createElement('button');
    tab.className = 'pill lang-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', manifest.id === state.lang ? 'true' : 'false');
    tab.textContent = manifest.label;
    tab.title = manifest.summary;
    tab.dataset.langId = manifest.id;
    tab.addEventListener('click', () => setState({ lang: manifest.id }));
    langTabsContainer.appendChild(tab);
    tabMap.set(manifest.id, tab);
    
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        tab.nextElementSibling?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        tab.previousElementSibling?.focus();
      }
    });
  }
  
  const disambig = document.createElement('div');
  disambig.className = 'disambig';
  disambig.textContent = '0O oO  1lI |  {} [] ()  ;: ,.  -> =>  != ==  \'\' ""  ``';
  previewPane.after(disambig);
  
  subscribe((s) => {
    sizeSlider.value = String(s.size);
    sizeReadout.textContent = s.size + 'px';
    ligaCheck.checked = s.ligatures;
    italicCheck.checked = s.italic;
    for (const [id, tab] of tabMap) {
      tab.setAttribute('aria-selected', id === s.lang ? 'true' : 'false');
    }
  });
}
