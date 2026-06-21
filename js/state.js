const STORAGE_KEY = 'pf_tracker_data';

function defaultState() {
  return { assets: [], transactions: [], performanceSnapshots: [], dark: false };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    s.assets = (s.assets || []).map(a => ({ taxWrapper: 'GIA', ...a }));
    s.transactions = s.transactions || [];
    s.performanceSnapshots = s.performanceSnapshots || [];
    s.dark = s.dark ?? false;
    return s;
  } catch {
    return defaultState();
  }
}

const state = loadState();

export function getState() { return state; }

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAssets() { return state.assets; }
export function getTransactions() { return state.transactions; }
export function getSnapshots() { return state.performanceSnapshots; }
export function isDark() { return state.dark; }
export function setDark(v) { state.dark = v; }

export function addAsset(asset) { state.assets.push(asset); }

export function removeAsset(id) {
  state.assets = state.assets.filter(a => a.id !== id);
}

export function findAsset(id) {
  return state.assets.find(a => a.id === id);
}

export function addTransactions(txns) { state.transactions.push(...txns); }
export function clearTransactions() { state.transactions = []; state.performanceSnapshots = []; }
export function addSnapshot(snap) { state.performanceSnapshots.push(snap); }
export function addSnapshots(snaps) { state.performanceSnapshots.push(...snaps); }

export function importData(data) {
  if (data.assets) state.assets = data.assets;
  if (data.transactions) state.transactions = data.transactions;
  if (data.performanceSnapshots) state.performanceSnapshots = data.performanceSnapshots;
}
