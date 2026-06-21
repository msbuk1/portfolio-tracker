import { getState } from './state.js';
import { fmt } from './utils.js';

let drawdownChart = null;

const COLORS = {
  portfolio: '#6366f1',
  withdrawal: '#ef4444',
  pension: '#10b981',
  depleted: '#f59e0b',
  retirement: '#8b5cf6',
};

function gridColor() {
  return getState().dark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.06)';
}
function tickColor() {
  return getState().dark ? '#94a3b8' : '#64748b';
}

function fmtK(v) {
  return v >= 1e6 ? '£' + (v / 1e6).toFixed(1) + 'M' : '£' + (v / 1000).toFixed(0) + 'k';
}

export function initDrawdownChart() {
  const ctx = document.getElementById('chart-drawdown');
  if (!ctx) return;

  drawdownChart = new window.Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor(), font: { size: 10 }, maxRotation: 45 },
          title: { display: true, text: 'Year', color: tickColor(), font: { size: 11 } },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor(), font: { size: 10 }, callback: fmtK },
          title: { display: true, text: 'Value (£)', color: tickColor(), font: { size: 11 } },
        },
      },
      plugins: {
        legend: { labels: { color: tickColor(), boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

export function updateDrawdownChart(chartData) {
  if (!drawdownChart || !chartData) return;

  const { labels, portfolioData, withdrawalData, pensionData, taxData, retirementYear, sim } = chartData;

  // Guard against empty data
  if (!labels || labels.length === 0) {
    drawdownChart.data.labels = [];
    drawdownChart.data.datasets = [];
    drawdownChart.update();
    return;
  }

  // Find retirement index
  const retirementIdx = retirementYear ? labels.indexOf(retirementYear.toString()) : -1;

  drawdownChart.data.labels = labels;
  drawdownChart.data.datasets = [
    {
      label: 'Portfolio Value',
      data: portfolioData,
      borderColor: COLORS.portfolio,
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: 'Annual Withdrawal (need)',
      data: withdrawalData,
      borderColor: COLORS.withdrawal,
      borderDash: [5, 3],
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 1.5,
    },
    {
      label: 'State Pension Income',
      data: pensionData,
      borderColor: COLORS.pension,
      borderDash: [3, 3],
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 1.5,
    },
    {
      label: 'Tax on Withdrawals',
      data: taxData,
      borderColor: COLORS.depleted,
      borderDash: [2, 2],
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 1.5,
    },
  ];

  // Add retirement marker annotation line
  if (retirementIdx >= 0) {
    drawdownChart.options.plugins.annotation = {
      annotations: {
        retirementLine: {
          type: 'line',
          xMin: retirementIdx,
          xMax: retirementIdx,
          borderColor: COLORS.retirement,
          borderWidth: 1.5,
          borderDash: [4, 4],
          label: {
            display: true,
            content: 'Retirement',
            position: 'start',
            color: COLORS.retirement,
            font: { size: 10 },
          },
        },
      },
    };
  }

  drawdownChart.options.scales.x.ticks.color = tickColor();
  drawdownChart.options.scales.y.ticks.color = tickColor();
  drawdownChart.options.scales.x.grid.color = gridColor();
  drawdownChart.options.scales.y.grid.color = gridColor();
  drawdownChart.options.plugins.legend.labels.color = tickColor();
  drawdownChart.update();
}
