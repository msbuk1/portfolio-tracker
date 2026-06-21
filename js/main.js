import { applyDark, initDark } from './dark.js';
import { initCharts, updateCharts } from './charts.js';
import { updateMetrics } from './metrics.js';
import { initAssets, renderAssets } from './assets.js';
import { initTransactions, renderTransactions } from './transactions.js';
import { initParser } from './parser.js';
import { initExportImport } from './export-import.js';

function renderAll() {
  updateMetrics();
  renderAssets(renderAll);
  renderTransactions();
  updateCharts();
}

// Init
applyDark();
initCharts();
initDark(updateCharts);
initAssets(renderAll);
initTransactions(renderAll);
initParser(renderAll);
initExportImport(renderAll);

document.getElementById('proj-rate').addEventListener('input', () => {
  localStorage.setItem('pf_proj_rate', document.getElementById('proj-rate').value);
  updateCharts();
});

renderAll();
