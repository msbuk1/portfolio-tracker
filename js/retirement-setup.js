import { getAssets } from './state.js';
import { fmt, uid, esc, showToast, $ } from './utils.js';
import {
  DEFAULTS,
  calcStatePensionAge,
  totalMonthlyContributions,
  projectPortfolioValue,
  runDrawdownSimulation,
  calculateLifestyleScenarios,
  generateDrawdownChartData,
  safeWithdrawalRate,
  findMaxSustainableIncome,
  calcIncomeTax,
  calcAfterTaxWithdrawal,
} from './retirement.js';
import { initDrawdownChart, updateDrawdownChart } from './drawdown-chart.js';

// ─── State ─────────────────────────────────────────────────────
let formState = loadFormState();

function defaultFormState() {
  return {
    // Person 1
    p1DOB: '',
    p1CurrentAge: DEFAULTS.p1CurrentAge,
    p1RetirementAge: DEFAULTS.p1RetirementAge,
    p1LifeExpectancy: DEFAULTS.p1LifeExpectancy,
    p1StatePension: DEFAULTS.p1StatePension,
    p1StatePensionAge: 67,
    // Person 2 (partner)
    p2DOB: '',
    p2CurrentAge: DEFAULTS.p2CurrentAge,
    p2RetirementAge: DEFAULTS.p2RetirementAge,
    p2LifeExpectancy: DEFAULTS.p2LifeExpectancy,
    p2StatePension: DEFAULTS.p2StatePension,
    p2StatePensionAge: 67,
    // Accounts (multiple: GIA, SIPP, ISA, Cash, Other)
    accounts: [
      { id: uid(), name: 'ISA', value: 0, monthlyContrib: 0, taxFree: true, owner: 'joint', useTaxFree25: true },
      { id: uid(), name: 'SIPP', value: 0, monthlyContrib: 0, taxFree: false, owner: 'joint', useTaxFree25: true },
      { id: uid(), name: 'GIA', value: 0, monthlyContrib: 0, taxFree: false, owner: 'joint', useTaxFree25: true },
      { id: uid(), name: 'Cash', value: 0, monthlyContrib: 0, taxFree: true, owner: 'joint', useTaxFree25: true },
    ],
    // Household expenses (annual, today's money)
    // Based on BBC/Pensions UK 2026 retirement standards
    householdExpenses: {
      low: 25000,    // minimum
      med: 45400,    // moderate (couple)
      high: 62700,   // comfortable (couple)
    },
    // Assumptions
    inflationRate: DEFAULTS.inflationRate,
    preRetReturn: DEFAULTS.preRetReturn,
    postRetReturn: DEFAULTS.postRetReturn,
    // Target selection
    selectedLifestyle: 'med',
  };
}

function loadFormState() {
  try {
    const raw = localStorage.getItem('pf_retirement_planner');
    if (!raw) return defaultFormState();
    const s = JSON.parse(raw);
    // Merge with defaults for any new fields
    const defs = defaultFormState();
    return { ...defs, ...s, householdExpenses: { ...defs.householdExpenses, ...(s.householdExpenses || {}) } };
  } catch {
    return defaultFormState();
  }
}

function saveFormState() {
  localStorage.setItem('pf_retirement_planner', JSON.stringify(formState));
}

// ─── DOB Helpers ───────────────────────────────────────────────

function calcAge(dobString) {
  if (!dobString) return null;
  const dob = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function handleDOBChange(person, dobString) {
  formState[person + 'DOB'] = dobString;
  const age = calcAge(dobString);
  if (age !== null) {
    formState[person + 'CurrentAge'] = age;
    const spa = Math.round(calcStatePensionAge(dobString));
    formState[person + 'StatePensionAge'] = spa;
    // Update SPA display text and input field
    const spaEl = $(person === 'p1' ? 'p1-spa-display' : 'p2-spa-display');
    if (spaEl) spaEl.textContent = `State Pension Age: ${spa}`;
    const spaInput = $(person === 'p1' ? '[data-model="p1StatePensionAge"]' : '[data-model="p2StatePensionAge"]');
    if (spaInput) spaInput.value = spa;
    // Only auto-set retirement age if it's still the default
    const defaultRetAge = person === 'p1' ? DEFAULTS.p1RetirementAge : DEFAULTS.p2RetirementAge;
    if (formState[person + 'RetirementAge'] === defaultRetAge) {
      formState[person + 'RetirementAge'] = Math.max(spa, 65);
    }
  }
  saveFormState();
  renderAll();
}

// ─── Build Assets from Retirement Accounts Only ─────────────────
function getAllAssets() {
  // Use only the planner's own account data — not the main portfolio assets.
  // The sync button copies portfolio values INTO accounts, so accounts are
  // the single source of truth for the retirement planner.
  return formState.accounts.map(a => ({
    name: a.name,
    currentValue: a.value || 0,
    monthlyAdd: a.monthlyContrib || 0,
    taxWrapper: a.name, // ISA, SIPP, GIA, Cash
  })).filter(a => a.currentValue > 0 || a.monthlyAdd > 0);
}

// ─── Render Functions ──────────────────────────────────────────

function renderAccounts() {
  const tbody = $('#tbody-accounts');
  if (!tbody) return;

  if (!formState.accounts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-xs text-slate-400 py-3">No accounts added</td></tr>';
    return;
  }

  tbody.innerHTML = formState.accounts.map((acc, i) => `
    <tr class="border-b border-slate-100 dark:border-slate-700/50">
      <td class="py-2">
        <input type="text" value="${esc(acc.name)}"
          class="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm"
          onchange="window.retirementApp.updateAccount(${i}, 'name', this.value)">
      </td>
      <td class="py-2">
        <select onchange="window.retirementApp.updateAccount(${i}, 'owner', this.value)"
          class="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-xs">
          <option value="p1" ${acc.owner === 'p1' ? 'selected' : ''}>P1</option>
          <option value="p2" ${acc.owner === 'p2' ? 'selected' : ''}>P2</option>
          <option value="joint" ${acc.owner === 'joint' || !acc.owner ? 'selected' : ''}>Joint</option>
        </select>
      </td>
      <td class="py-2 text-right">
        <input type="number" value="${acc.value}" min="0" step="100"
          class="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-right"
          onchange="window.retirementApp.updateAccount(${i}, 'value', parseFloat(this.value)||0)">
      </td>
      <td class="py-2 text-right">
        <input type="number" value="${acc.monthlyContrib}" min="0" step="10"
          class="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-right"
          onchange="window.retirementApp.updateAccount(${i}, 'monthlyContrib', parseFloat(this.value)||0)">
      </td>
      <td class="py-2 text-center">
        <input type="checkbox" ${acc.useTaxFree25 !== false ? 'checked' : ''}
          onchange="window.retirementApp.updateAccount(${i}, 'useTaxFree25', this.checked)"
          title="Apply 25% tax-free lump sum (SIPP only)">
      </td>
      <td class="py-2 text-center">
        <button onclick="window.retirementApp.removeAccount(${i})" class="text-slate-400 hover:text-red-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderSummary() {
  // Read directly from formState.accounts (don't filter — show zeros if empty)
  const totalPV = formState.accounts.reduce((s, a) => s + (a.value || 0), 0);
  const totalMonthly = formState.accounts.reduce((s, a) => s + (a.monthlyContrib || 0), 0);
  const yearsToRet = formState.p1RetirementAge - formState.p1CurrentAge;

  // Build assets array for projection (include all accounts even if zero)
  const allAssets = formState.accounts.map(a => ({
    name: a.name,
    currentValue: a.value || 0,
    monthlyAdd: a.monthlyContrib || 0,
    taxWrapper: a.name,
  }));
  const projectedAtRet = projectPortfolioValue(allAssets, formState.preRetReturn, Math.max(yearsToRet, 0), totalMonthly);

  // Tax-free proportion (ISA + Cash)
  const taxFreeTotal = formState.accounts
    .filter(a => a.name === 'ISA' || a.name === 'Cash')
    .reduce((s, a) => s + (a.value || 0), 0);
  const tfPct = totalPV > 0 ? ((taxFreeTotal / totalPV) * 100).toFixed(0) : 0;

  // Use getElementById directly
  const pvEl = document.getElementById('ret-total-pv');
  const monthlyEl = document.getElementById('ret-total-monthly');
  const yearsEl = document.getElementById('ret-years-to-ret');
  const atRetEl = document.getElementById('ret-portfolio-at-ret');
  const tfEl = document.getElementById('ret-tax-free-pct');

  if (pvEl) pvEl.textContent = fmt(totalPV);
  if (monthlyEl) monthlyEl.textContent = fmt(totalMonthly) + '/mo';
  if (yearsEl) yearsEl.textContent = Math.max(yearsToRet, 0);
  if (atRetEl) atRetEl.textContent = fmt(projectedAtRet);
  if (tfEl) tfEl.textContent = tfPct + '%';
}

function renderScenarioCards() {
  const allAssets = getAllAssets();
  const scenarios = calculateLifestyleScenarios({
    assets: allAssets,
    ...formState,
    targetAnnualIncome: formState.householdExpenses[formState.selectedLifestyle],
  });

  const container = $('#scenario-cards');
  if (!container) return;

  const labels = { low: 'Minimum', med: 'Moderate', high: 'Comfortable' };
  const emojis = { low: '🏠', med: '✨', high: '🌟' };
  const colors = {
    low: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300' },
    med: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300' },
    high: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300' },
  };

  container.innerHTML = scenarios.map(s => {
    const c = colors[s.level];
    const isActive = formState.selectedLifestyle === s.level;
    const gapWarning = s.incomeGap > 0 ? `<p class="text-amber-600 dark:text-amber-400 font-medium">⚠ After-tax: ${fmt(s.afterTaxIncome)}/yr (gap: ${fmt(s.incomeGap)})</p>` : '';
    return `
      <div class="rounded-xl border-2 ${isActive ? c.border : 'border-slate-200 dark:border-slate-700'} ${c.bg} p-4 cursor-pointer transition hover:shadow-md"
        onclick="window.retirementApp.selectLifestyle('${s.level}')">
        <div class="flex items-center justify-between mb-2">
          <span class="text-lg">${emojis[s.level]}</span>
          ${isActive ? '<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/20">Selected</span>' : ''}
        </div>
        <p class="text-sm font-semibold ${c.text}">${labels[s.level]}</p>
        <p class="text-lg font-bold mt-1">${fmt(s.target)}/yr</p>
        <div class="mt-3 space-y-1 text-xs">
          <p class="${s.affordable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} font-medium">
            ${s.affordable
              ? `✓ Lasts to age ${formState.p1LifeExpectancy}`
              : `✗ Runs out at age ${s.depletedAge}`}
          </p>
          ${gapWarning}
          <p class="text-slate-500 dark:text-slate-400">Withdrawal rate: ${s.swr.toFixed(1)}%</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderDrawdownSchedule() {
  const allAssets = getAllAssets();
  const targetIncome = formState.householdExpenses[formState.selectedLifestyle];

  const chartData = generateDrawdownChartData({
    assets: allAssets,
    accounts: formState.accounts,
    ...formState,
    targetAnnualIncome: targetIncome,
  });

  updateDrawdownChart(chartData);

  // Summary stats
  const sim = chartData.sim;
  const depleted = sim.find(s => s.depleted);
  const yearsLasted = depleted ? depleted.age1 - formState.p1CurrentAge : formState.p1LifeExpectancy - formState.p1CurrentAge;
  const retRow = sim.find(s => s.age1 >= formState.p1RetirementAge);
  const portfolioAtRet = retRow ? retRow.portfolioValue : 0;
  const swr = safeWithdrawalRate(portfolioAtRet, targetIncome);

  // Tax summary (first retirement year)
  const firstRetYear = sim.find(s => s.age1 === formState.p1RetirementAge) || sim[0];
  const taxInfo = firstRetYear ? {
    tax: firstRetYear.taxOnWithdrawal || 0,
    rate: firstRetYear.effectiveTaxRate || 0,
    breakdown: firstRetYear.taxBreakdown || {},
  } : { tax: 0, rate: 0, breakdown: {} };

  const el = (id) => $(id);
  if (el('drawdown-status')) {
    if (depleted) {
      el('drawdown-status').innerHTML = `<span class="text-red-600 dark:text-red-400 font-medium">Portfolio depleted at age ${depleted.age1}</span>`;
    } else {
      el('drawdown-status').innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-medium">Portfolio lasts to age ${formState.p1LifeExpectancy}+</span>`;
    }
  }
  if (el('drawdown-swr')) el('drawdown-swr').textContent = swr.toFixed(2) + '%';
  if (el('drawdown-years')) el('drawdown-years').textContent = yearsLasted;

  // Tax summary
  if (el('drawdown-tax')) {
    const tb = taxInfo.breakdown;
    const parts = [];
    if (tb.sipp > 0) parts.push(`SIPP: ${fmt(tb.sipp)}`);
    if (tb.gia > 0) parts.push(`CGT: ${fmt(tb.gia)}`);
    if (tb.cash > 0) parts.push(`Cash: ${fmt(tb.cash)}`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    el('drawdown-tax').innerHTML = taxInfo.tax > 0
      ? `<span class="text-amber-600 dark:text-amber-400">Tax: ${fmt(taxInfo.tax)}/yr (${taxInfo.rate.toFixed(1)}% eff)${detail}</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">No tax on withdrawals</span>`;
  }

  // After-tax income summary
  if (el('drawdown-aftertax')) {
    const afterTax = firstRetYear
      ? firstRetYear.statePension + firstRetYear.netFromPortfolio - firstRetYear.taxOnWithdrawal
      : 0;
    const gap = targetIncome - afterTax;
    el('drawdown-aftertax').innerHTML = gap > 0
      ? `<span class="text-amber-600 dark:text-amber-400">After-tax income: ${fmt(afterTax)}/yr — gap: ${fmt(gap)}</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">After-tax income: ${fmt(afterTax)}/yr ✓</span>`;
  }

  // Year-by-year table
  renderScheduleTable(sim);
}

function downloadScheduleCSV() {
  const allAssets = getAllAssets();
  const targetIncome = formState.householdExpenses[formState.selectedLifestyle];
  const chartData = generateDrawdownChartData({
    assets: allAssets,
    accounts: formState.accounts,
    ...formState,
    targetAnnualIncome: targetIncome,
  });
  const sim = chartData.sim;

  const header = 'Year,Age P1,Age P2,Need,State Pension,Tax,ISA,SIPP,GIA,Cash,Portfolio Value';
  const rows = sim.map(s =>
    `${s.year},${s.age1},${s.age2},${s.grossWithdrawal.toFixed(0)},${s.statePension.toFixed(0)},${s.taxOnWithdrawal.toFixed(0)},${(s.isaValue || 0).toFixed(0)},${(s.sippValue || 0).toFixed(0)},${(s.giaValue || 0).toFixed(0)},${(s.cashValue || 0).toFixed(0)},${s.portfolioValue.toFixed(0)}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `drawdown-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Schedule downloaded');
}

function renderScheduleTable(sim) {
  const tbody = $('#tbody-schedule');
  if (!tbody) return;

  tbody.innerHTML = sim.map(s => {
    const isRet = s.age1 === formState.p1RetirementAge;
    const rowClass = s.depleted ? 'text-red-600 dark:text-red-400' : isRet ? 'text-purple-600 dark:text-purple-400 font-medium' : '';
    return `
      <tr class="border-b border-slate-100 dark:border-slate-700/50 ${rowClass}">
        <td class="py-1.5">${s.year}</td>
        <td class="py-1.5">${s.age1}${s.age2 !== s.age1 ? '/' + s.age2 : ''}</td>
        <td class="py-1.5 text-right">${s.grossWithdrawal > 0 ? fmt(s.grossWithdrawal) : '—'}</td>
        <td class="py-1.5 text-right">${s.statePension > 0 ? fmt(s.statePension) : '—'}</td>
        <td class="py-1.5 text-right text-amber-600 dark:text-amber-400">${s.taxOnWithdrawal > 0 ? fmt(s.taxOnWithdrawal) : '—'}</td>
        <td class="py-1.5 text-right text-emerald-600 dark:text-emerald-400">${(s.isaValue || 0) > 0 ? fmt(s.isaValue) : '—'}</td>
        <td class="py-1.5 text-right text-purple-600 dark:text-purple-400">${(s.sippValue || 0) > 0 ? fmt(s.sippValue) : '—'}</td>
        <td class="py-1.5 text-right text-amber-600 dark:text-amber-400">${(s.giaValue || 0) > 0 ? fmt(s.giaValue) : '—'}</td>
        <td class="py-1.5 text-right text-sky-600 dark:text-sky-400">${(s.cashValue || 0) > 0 ? fmt(s.cashValue) : '—'}</td>
        <td class="py-1.5 text-right font-medium">${fmt(s.portfolioValue)}</td>
      </tr>
    `;
  }).join('');
}

// ─── Public API (exposed to window for inline handlers) ────────

function addAccount() {
  formState.accounts.push({
    id: uid(),
    name: 'New Account',
    value: 0,
    monthlyContrib: 0,
    taxFree: false,
    owner: 'joint',
    useTaxFree25: true,
  });
  saveFormState();
  renderAccounts();
  renderAll();
}

function removeAccount(i) {
  formState.accounts.splice(i, 1);
  saveFormState();
  renderAccounts();
  renderAll();
}

function updateAccount(i, field, value) {
  formState.accounts[i][field] = value;
  saveFormState();
  renderSummary();
  renderAll();
}

function selectLifestyle(level) {
  formState.selectedLifestyle = level;
  saveFormState();
  renderScenarioCards();
  renderDrawdownSchedule();
}

function updateField(key, value) {
  // Handle nested keys like householdExpenses.low
  if (key.includes('.')) {
    const [obj, prop] = key.split('.');
    formState[obj][prop] = value;
  } else {
    formState[key] = value;
  }
  saveFormState();
  renderAll();
}

function syncFromPortfolio() {
  try {
    const assets = getAssets();
    const totalPV = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const totalMonthly = assets.reduce((s, a) => s + (a.monthlyAdd || 0), 0);

    if (totalPV === 0 && totalMonthly === 0) {
      showToast('Portfolio is empty — add assets on the main page first');
      return;
    }

    // Group assets by tax wrapper
    const byWrapper = { GIA: 0, ISA: 0, SIPP: 0, Cash: 0 };
    const monthlyByWrapper = { GIA: 0, ISA: 0, SIPP: 0, Cash: 0 };
    for (const a of assets) {
      let w = a.taxWrapper || 'GIA';
      if (!byWrapper.hasOwnProperty(w)) w = 'GIA';
      byWrapper[w] += (a.currentValue || 0);
      monthlyByWrapper[w] += (a.monthlyAdd || 0);
    }

    const summary = Object.entries(byWrapper)
      .filter(([_, v]) => v > 0)
      .map(([w, v]) => `£${v.toLocaleString()} in ${w}`)
      .join(', ');

    if (confirm(`Sync portfolio to retirement accounts?\n\n${summary}\n\nTotal: £${totalPV.toLocaleString()}`)) {
      // Replace all retirement accounts with portfolio data — always create all 4 wrappers
      const newAccounts = [];
      for (const wrapper of ['GIA', 'ISA', 'SIPP', 'Cash']) {
        newAccounts.push({
          id: uid(),
          name: wrapper,
          value: byWrapper[wrapper] || 0,
          monthlyContrib: monthlyByWrapper[wrapper] || 0,
          taxFree: wrapper === 'ISA' || wrapper === 'Cash',
          owner: 'joint',
          useTaxFree25: true,
        });
      }
      formState.accounts = newAccounts;
      saveFormState();
      renderAccounts();
      renderAll();
      showToast('Synced from portfolio');
    }
  } catch (err) {
    console.error('[syncFromPortfolio] error:', err);
    showToast('Sync failed — check console for details');
  }
}

function renderAll() {
  renderSummary();
  renderScenarioCards();
  renderDrawdownSchedule();
}

// ─── Init ──────────────────────────────────────────────────────

function bindInputs() {
  // Bind all inputs with data-model attribute
  document.querySelectorAll('[data-model]').forEach(input => {
    const key = input.dataset.model;
    let val;
    if (key.includes('.')) {
      const [obj, prop] = key.split('.');
      val = formState[obj][prop];
    } else {
      val = formState[key];
    }

    if (input.type === 'checkbox') {
      input.checked = !!val;
    } else {
      input.value = val ?? '';
    }

    input.addEventListener('change', (e) => {
      // Special handling for DOB inputs
      if (key === 'p1DOB' || key === 'p2DOB') {
        const person = key.startsWith('p1') ? 'p1' : 'p2';
        handleDOBChange(person, input.value);
        return;
      }
      const value = input.type === 'checkbox' ? input.checked :
        input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
      updateField(key, value);
    });
  });
}

export function init() {
  renderAccounts();
  bindInputs();
  initDrawdownChart();

  // Auto-populate from portfolio if it has assets
  const portfolioAssets = getAssets();
  const hasPortfolioValue = portfolioAssets.reduce((s, a) => s + (a.currentValue || 0), 0) > 0;
  if (hasPortfolioValue) {
    // Group portfolio assets by tax wrapper
    const byWrapper = { GIA: 0, ISA: 0, SIPP: 0, Cash: 0 };
    const monthlyByWrapper = { GIA: 0, ISA: 0, SIPP: 0, Cash: 0 };
    for (const a of portfolioAssets) {
      let w = a.taxWrapper || 'GIA';
      if (!byWrapper.hasOwnProperty(w)) w = 'GIA';
      byWrapper[w] += (a.currentValue || 0);
      monthlyByWrapper[w] += (a.monthlyAdd || 0);
    }
    // Build new accounts: use portfolio values where available, keep zeros for missing
    const newAccounts = [];
    for (const wrapper of ['GIA', 'ISA', 'SIPP', 'Cash']) {
      newAccounts.push({
        id: uid(),
        name: wrapper,
        value: byWrapper[wrapper] || 0,
        monthlyContrib: monthlyByWrapper[wrapper] || 0,
        taxFree: wrapper === 'ISA' || wrapper === 'Cash',
        owner: 'joint',
        useTaxFree25: true,
      });
    }
    formState.accounts = newAccounts;
    saveFormState();
    renderAccounts();
  }

  // Render after auto-populate (or initial load)
  renderAll();

  // Expose to window for inline handlers
  window.retirementApp = {
    addAccount,
    removeAccount,
    updateAccount,
    selectLifestyle,
    syncFromPortfolio,
    handleDOBChange,
    downloadScheduleCSV,
  };

  // Wire up sync button
  const syncBtn = document.getElementById('btn-sync');
  if (syncBtn) syncBtn.addEventListener('click', () => syncFromPortfolio());
}
