export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);
export const fmt = n => {
  if (n === undefined || n === null) return '£0';
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
};
export const pct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function showToast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('translate-y-20', 'opacity-0');
  t.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    t.classList.add('translate-y-20', 'opacity-0');
    t.classList.remove('translate-y-0', 'opacity-100');
  }, ms);
}

export function camelToWords(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
