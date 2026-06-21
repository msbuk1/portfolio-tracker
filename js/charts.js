import { getState, getAssets, getSnapshots } from './state.js';
import { fmt } from './utils.js';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];
const gridColor = () => getState().dark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.06)';
const tickColor = () => getState().dark ? '#94a3b8' : '#64748b';

let allocChart, perfChart, projChart;

export function projectedFV(pv, annualRate, years, monthlyPmt) {
  const r = annualRate / 100;
  const n = years;
  const pmt = monthlyPmt * 12;
  if (r === 0) return pv + pmt * n;
  return pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);
}

function fmtAxisGBP(v) {
  return v >= 1e6 ? '£' + (v / 1e6).toFixed(1) + 'M' : '£' + (v / 1000).toFixed(0) + 'k';
}

export function initCharts() {
  const Chart = window.Chart;

  // Restore saved projection rate
  const savedRate = localStorage.getItem('pf_proj_rate');
  const rateInput = document.getElementById('proj-rate');
  if (rateInput && savedRate) rateInput.value = savedRate;

  const allocCtx = document.getElementById('chart-alloc').getContext('2d');
  allocChart = new Chart(allocCtx, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORS, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: tickColor(), boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
      }
    }
  });

  const perfCtx = document.getElementById('chart-perf').getContext('2d');
  perfChart = new Chart(perfCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor(), font: { size: 10 }, maxRotation: 45 } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor(), font: { size: 10 }, callback: v => '£' + (v / 1000).toFixed(0) + 'k' } }
      },
      plugins: { legend: { labels: { color: tickColor(), boxWidth: 12, font: { size: 11 } } } }
    }
  });

  const projCtx = document.getElementById('chart-proj').getContext('2d');
  projChart = new Chart(projCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor(), font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor(), font: { size: 11 }, callback: fmtAxisGBP } }
      },
      plugins: { legend: { labels: { color: tickColor(), boxWidth: 12, font: { size: 11 } } } }
    }
  });
}

export function updateCharts() {
  const assets = getAssets();
  const snaps = getSnapshots();

  // Allocation
  allocChart.data.labels = assets.map(a => a.name);
  allocChart.data.datasets[0].data = assets.map(a => a.currentValue);
  allocChart.data.datasets[0].backgroundColor = COLORS.slice(0, assets.length);
  allocChart.update();

  // Performance
  const placeholder = document.getElementById('perf-placeholder');
  if (snaps.length) {
    placeholder.classList.add('hidden');
    perfChart.data.labels = snaps.map(s => s.date);
    perfChart.data.datasets = [{
      label: 'Portfolio Value',
      data: snaps.map(s => s.value),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2,
    }];
  } else {
    placeholder.classList.remove('hidden');
    perfChart.data.labels = [];
    perfChart.data.datasets = [];
  }
  perfChart.options.scales.x.ticks.color = tickColor();
  perfChart.options.scales.y.ticks.color = tickColor();
  perfChart.options.scales.x.grid.color = gridColor();
  perfChart.options.scales.y.grid.color = gridColor();
  perfChart.options.plugins.legend.labels.color = tickColor();
  perfChart.update();

  // Projections — linear x-axis, 15 years max
  const rate = parseFloat(document.getElementById('proj-rate').value) || 7;
  const pmt = assets.reduce((s, a) => s + (a.monthlyAdd || 0), 0);
  document.getElementById('proj-pmt-label').textContent = `${fmt(pmt)}/mo from holdings`;
  const totalPV = assets.reduce((s, a) => s + a.currentValue, 0);
  const years = Array.from({length: 16}, (_, i) => i); // [0, 1, 2, ..., 15]
  const fvData = years.map(y => projectedFV(totalPV, rate, y, pmt));

  projChart.data.labels = years.map(y => y === 0 ? 'Now' : y === 1 ? '1 yr' : `${y} yrs`);
  projChart.data.datasets = [
    {
      label: 'Projected Value',
      data: fvData,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.1)',
      fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2,
    },
    {
      label: 'Contributions Only',
      data: years.map(y => totalPV + pmt * 12 * y),
      borderColor: '#94a3b8',
      borderDash: [4, 4],
      fill: false, tension: 0.3, pointRadius: 2, borderWidth: 1.5,
    }
  ];
  projChart.options.scales.x.ticks.color = tickColor();
  projChart.options.scales.y.ticks.color = tickColor();
  projChart.options.scales.x.grid.color = gridColor();
  projChart.options.scales.y.grid.color = gridColor();
  projChart.options.plugins.legend.labels.color = tickColor();
  projChart.update();
}
