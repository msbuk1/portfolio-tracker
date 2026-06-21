import { getTransactions, clearTransactions, saveState } from './state.js';
import { $, fmt, esc, showToast } from './utils.js';

export function renderTransactions() {
  const txns = getTransactions();
  const sec = $('#section-txn');
  if (!txns.length) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');

  const sorted = [...txns].sort((a, b) => new Date(b.date) - new Date(a.date));
  $('#tbody-txn').innerHTML = sorted.map(t => {
    const amtColor = t.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
    return `<tr class="border-b border-slate-100 dark:border-slate-700/50">
      <td class="py-1.5">${esc(t.date)}</td>
      <td class="py-1.5"><span class="px-1.5 py-0.5 rounded text-xs ${t.type === 'credit' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}">${esc(t.type)}</span></td>
      <td class="py-1.5">${esc(t.description || '—')}</td>
      <td class="py-1.5 text-right ${amtColor}">${fmt(t.amount)}</td>
      <td class="py-1.5 text-right text-slate-500">${t.balance != null ? fmt(t.balance) : '—'}</td>
    </tr>`;
  }).join('');
}

export function initTransactions(renderAll) {
  $('#btn-clear-txn').addEventListener('click', () => {
    if (!confirm('Clear all imported transactions?')) return;
    clearTransactions();
    saveState(); renderAll();
    showToast('Transactions cleared');
  });
}
