import { isDark, setDark, saveState } from './state.js';
import { $ } from './utils.js';

export function applyDark() {
  document.documentElement.classList.toggle('dark', isDark());
}

export function initDark(updateCharts) {
  $('#btn-dark').addEventListener('click', () => {
    setDark(!isDark());
    applyDark();
    saveState();
    updateCharts();
  });
}
