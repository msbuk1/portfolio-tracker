import { getAssets } from './state.js';
import { $, fmt, pct } from './utils.js';

export function updateMetrics() {
  const assets = getAssets();
  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalCost = assets.reduce((s, a) => s + a.costBasis, 0);
  const gl = totalValue - totalCost;
  const glPct = totalCost > 0 ? (gl / totalCost) * 100 : 0;

  $('#m-value').textContent = fmt(totalValue);
  $('#m-value-sub').textContent = assets.length ? `${assets.length} holding${assets.length > 1 ? 's' : ''}` : '—';
  $('#m-cost').textContent = fmt(totalCost);
  $('#m-count').textContent = `${assets.length} asset${assets.length !== 1 ? 's' : ''}`;

  const glEl = $('#m-gl');
  glEl.textContent = fmt(gl);
  glEl.className = `text-2xl font-bold mt-1 ${gl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`;
  const pctEl = $('#m-gl-pct');
  pctEl.textContent = assets.length ? pct(glPct) : '\u00a0';
  pctEl.className = `text-xs mt-1 ${gl >= 0 ? 'text-emerald-500' : 'text-red-500'}`;
}
