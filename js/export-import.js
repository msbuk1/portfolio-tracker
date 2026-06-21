import { getState, importData, saveState } from './state.js';
import { $, showToast } from './utils.js';

export function initExportImport(renderAll) {
  $('#btn-export').addEventListener('click', () => {
    const state = getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported');
  });

  $('#import-json').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        importData(JSON.parse(evt.target.result));
        saveState(); renderAll();
        showToast('Data imported');
      } catch { showToast('Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}
