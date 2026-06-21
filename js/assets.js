import { getAssets, addAsset, removeAsset, findAsset, saveState } from './state.js';
import { $, fmt, uid, esc, showToast } from './utils.js';

function renderAssets(renderAll) {
  const q = ($('#search-assets').value || '').toLowerCase();
  const assets = getAssets();
  const filtered = assets.filter(a => a.name.toLowerCase().includes(q) || (a.taxWrapper || 'GIA').toLowerCase().includes(q));
  const tbody = $('#tbody-assets');
  const empty = $('#empty-msg');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const totalVal = assets.reduce((s, a) => s + a.currentValue, 0) || 1;

  tbody.innerHTML = filtered.map(a => {
  const gl = a.currentValue - a.costBasis;
  const alloc = (a.currentValue / totalVal * 100).toFixed(1);
  const color = gl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const monthly = a.monthlyAdd || 0;
  const wrapper = a.taxWrapper || 'GIA';
  const wrapperColor = wrapper === 'ISA' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
    wrapper === 'SIPP' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
    wrapper === 'Cash' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' :
    'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  return `<tr class="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
    <td class="py-2.5 font-medium">${esc(a.name)}</td>
    <td class="py-2.5"><span class="px-2 py-0.5 rounded-full text-xs ${wrapperColor}">${wrapper}</span></td>
    <td class="py-2.5 text-right">${fmt(a.costBasis)}</td>
    <td class="py-2.5 text-right font-medium">${fmt(a.currentValue)}</td>
    <td class="py-2.5 text-right text-slate-500 dark:text-slate-400">${monthly ? fmt(monthly) + '/mo' : '—'}</td>
    <td class="py-2.5 text-right ${color}">${fmt(gl)}</td>
    <td class="py-2.5 text-right text-slate-500 dark:text-slate-400">${alloc}%</td>
    <td class="py-2.5 text-right whitespace-nowrap">
      <button data-edit="${a.id}" class="text-slate-400 hover:text-brand-500 transition mr-1" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
      <button data-del="${a.id}" class="text-slate-400 hover:text-red-500 transition" title="Remove"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </td>
  </tr>`;
  }).join('');
}

function openEditModal(id) {
  const a = findAsset(id);
  if (!a) return;
  $('#e-id').value = a.id;
  $('#e-name').value = a.name;
  $('#e-wrapper').value = a.taxWrapper || 'GIA';
  $('#e-cost').value = a.costBasis;
  $('#e-value').value = a.currentValue;
  $('#e-monthly').value = a.monthlyAdd || 0;
  $('#edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  $('#edit-modal').classList.add('hidden');
}

export function initAssets(renderAll) {
  // Add form
  $('#form-add').addEventListener('submit', e => {
    e.preventDefault();
    const costBasis = parseFloat($('#f-cost').value);
    const currentValue = parseFloat($('#f-value').value);
    const monthlyAdd = parseFloat($('#f-monthly').value) || 0;
    if (isNaN(costBasis) || isNaN(currentValue)) return;
    addAsset({
      id: uid(),
      name: $('#f-name').value.trim().toUpperCase(),
      taxWrapper: $('#f-wrapper').value,
      costBasis,
      currentValue,
      monthlyAdd,
    });
    saveState();
    renderAll();
    e.target.reset();
    showToast(`Added asset`);
  });

  // Table delegation (edit + delete)
  $('#tbody-assets').addEventListener('click', e => {
    const delBtn = e.target.closest('[data-del]');
    const editBtn = e.target.closest('[data-edit]');
    if (delBtn) {
      removeAsset(delBtn.dataset.del);
      saveState(); renderAll();
      showToast('Asset removed');
    } else if (editBtn) {
      openEditModal(editBtn.dataset.edit);
    }
  });

  // Search
  $('#search-assets').addEventListener('input', () => renderAssets(renderAll));

  // Edit modal
  $('#edit-modal').addEventListener('click', e => {
    if (e.target.hasAttribute('data-close-modal') || e.target.closest('[data-close-modal]')) closeEditModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditModal(); });

  $('#form-edit').addEventListener('submit', e => {
    e.preventDefault();
    const a = findAsset($('#e-id').value);
    if (!a) return;
    const costBasis = parseFloat($('#e-cost').value);
    const currentValue = parseFloat($('#e-value').value);
    if (isNaN(costBasis) || isNaN(currentValue)) return;
    a.name = $('#e-name').value.trim().toUpperCase();
    a.taxWrapper = $('#e-wrapper').value;
    a.costBasis = costBasis;
    a.currentValue = currentValue;
    a.monthlyAdd = parseFloat($('#e-monthly').value) || 0;
    saveState(); renderAll(); closeEditModal();
    showToast(`Updated ${a.name}`);
  });
}

export { renderAssets };
