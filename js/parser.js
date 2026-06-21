import { getState, addTransactions, addSnapshot, addSnapshots, saveState } from './state.js';
import { $, uid, fmt, showToast } from './utils.js';

// ─── Helpers ────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += c; }
  }
  result.push(current);
  return result;
}

function cleanField(s) { return (s || '').replace(/^["'\s]+|["'\s]+$/g, ''); }

function parseMoney(s) {
  if (!s) return 0;
  s = cleanField(s).replace(/[£$,\s]/g, '');
  if (/^\(.*\)$/.test(s)) s = '-' + s.replace(/[()]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(s) {
  s = cleanField(s);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    return `${yr}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  return s;
}

function buildPerformanceFromTxns(txns, source) {
  const state = getState();
  const byMonth = {};
  for (const t of txns) {
    const month = t.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = 0;
    byMonth[month] += t.amount;
  }
  const months = Object.keys(byMonth).sort();
  if (months.length < 2) return;
  let cumulative = 0;
  const existing = new Set(state.performanceSnapshots.map(s => s.date.slice(0, 7)));
  for (const m of months) {
    cumulative += byMonth[m];
    if (!existing.has(m)) {
      addSnapshot({ date: m + '-01', value: cumulative, source });
    }
  }
}

// ─── CSV Parser ─────────────────────────────────────────────
function parseCSV(text, filename) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('File too short');

  const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const dateIdx = header.findIndex(h => /date|trade.?date|settlement/.test(h));
  const descIdx = header.findIndex(h => /description|memo|name|narrative|details?|payee/.test(h));
  const amtIdx = header.findIndex(h => /amount|total|value|debit|credit|net/.test(h));
  const balIdx = header.findIndex(h => /balance|running/.test(h));
  const typeIdx = header.findIndex(h => /^type$|transaction.?type/.test(h));

  if (dateIdx === -1 && amtIdx === -1) throw new Error('Cannot detect date/amount columns');

  const newTxns = [];
  let runningBalance = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const dateStr = dateIdx >= 0 ? cleanField(cols[dateIdx]) : '';
    const desc = descIdx >= 0 ? cleanField(cols[descIdx]) : '';
    let amount = amtIdx >= 0 ? parseMoney(cols[amtIdx]) : 0;
    const balance = balIdx >= 0 ? parseMoney(cols[balIdx]) : null;
    const rawType = typeIdx >= 0 ? cleanField(cols[typeIdx]).toLowerCase() : '';

    let type = 'debit';
    if (rawType.includes('credit') || rawType.includes('deposit') || rawType.includes('div') || amount > 0) type = 'credit';
    if (rawType.includes('debit') || rawType.includes('withdrawal') || rawType.includes('purchase')) type = 'debit';

    if (balance != null) runningBalance = balance;

    if (dateStr && amount !== 0) {
      newTxns.push({
        id: uid(), date: normalizeDate(dateStr), description: desc,
        amount, balance: runningBalance, type, source: filename,
      });
    }
  }

  addTransactions(newTxns);
  buildPerformanceFromTxns(newTxns, filename);
  saveState();
}

// ─── OFX Parser ─────────────────────────────────────────────
function parseOFX(text) {
  const newTxns = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];
    const dtag = block.match(/<DTPOSTED>(\d{8})/);
    const amtTag = block.match(/<TRNAMT>([-\d.]+)/);
    const nameTag = block.match(/<NAME>(.*?)(?:\r|\n|<)/);
    const memoTag = block.match(/<MEMO>(.*?)(?:\r|\n|<)/);

    if (dtag && amtTag) {
      const raw = dtag[1];
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const amount = parseFloat(amtTag[1]);
      const desc = (nameTag ? nameTag[1] : '') + (memoTag && memoTag[1] ? ' ' + memoTag[1] : '');
      newTxns.push({
        id: uid(), date, description: desc.trim() || 'OFX Transaction',
        amount, balance: null, type: amount >= 0 ? 'credit' : 'debit', source: 'OFX Import',
      });
    }
  }

  if (!newTxns.length) {
    const balMatch = text.match(/<BALAMT>([-\d.]+)/);
    if (balMatch) {
      addSnapshot({ date: new Date().toISOString().slice(0, 10), value: parseFloat(balMatch[1]), source: 'OFX Balance' });
    }
  }

  if (!newTxns.length && !getState().performanceSnapshots.length) throw new Error('No transactions found in OFX file');

  addTransactions(newTxns);
  buildPerformanceFromTxns(newTxns, 'OFX');
  saveState();
}

// ─── PDF Parser ─────────────────────────────────────────────
function extractPDFText(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(bytes);

  const textMatches = raw.match(/BT[\s\S]*?ET/g);
  if (textMatches) {
    for (const block of textMatches) {
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
      if (tjMatches) {
        for (const m of tjMatches) text += m.match(/\(([^)]*)\)/)[1] + ' ';
      }
      const tjArray = block.match(/\[(.*?)\]\s*TJ/g);
      if (tjArray) {
        for (const m of tjArray) {
          const parts = m.match(/\(([^)]*)\)/g);
          if (parts) text += parts.map(p => p.slice(1, -1)).join('') + ' ';
        }
      }
    }
  }

  if (text.length < 50) {
    const asciiRuns = raw.match(/[\x20-\x7E]{20,}/g);
    if (asciiRuns) text = asciiRuns.join('\n');
  }
  return text;
}

function extractTxnsFromText(text, source) {
  const txns = [];
  const lineRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+[£$]?([-\d,]+\.?\d*)/g;
  let m;
  while ((m = lineRegex.exec(text)) !== null) {
    const amount = parseFloat(m[3].replace(/,/g, ''));
    if (isNaN(amount) || amount === 0) continue;
    txns.push({
      id: uid(), date: normalizeDate(m[1]), description: m[2].trim(),
      amount, balance: null, type: amount >= 0 ? 'credit' : 'debit', source,
    });
  }
  return txns;
}

async function parsePDF(file, statusEl) {
  statusEl.textContent = 'Reading PDF (basic text extraction)…';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const text = extractPDFText(arrayBuffer);

    if (!text.trim()) {
      statusEl.textContent = '⚠ Could not extract text from PDF. Try exporting as CSV.';
      return;
    }

    const newTxns = extractTxnsFromText(text, file.name);
    if (newTxns.length) {
      addTransactions(newTxns);
      buildPerformanceFromTxns(newTxns, file.name);
      saveState();
      statusEl.textContent = `✓ Extracted ${newTxns.length} entries from PDF`;
      showToast('PDF imported');
    } else {
      const totalMatch = text.match(/(?:total|portfolio|account)\s*(?:value|balance)?[:\s]*[£$]?([\d,]+\.?\d*)/i);
      if (totalMatch) {
        const val = parseFloat(totalMatch[1].replace(/,/g, ''));
        addSnapshot({ date: new Date().toISOString().slice(0, 10), value: val, source: file.name });
        saveState();
        statusEl.textContent = `✓ Found portfolio value: ${fmt(val)}. For better parsing, export as CSV.`;
        showToast('Balance captured');
      } else {
        statusEl.textContent = '⚠ Could not parse transactions from PDF. Export as CSV for best results.';
      }
    }
  } catch (err) {
    statusEl.textContent = `⚠ PDF error: ${err.message}`;
  }
}

// ─── File Handler ───────────────────────────────────────────
function handleFile(file, renderAll) {
  const ext = file.name.split('.').pop().toLowerCase();
  const status = $('#stmt-status');
  status.classList.remove('hidden');
  status.textContent = `Processing ${file.name}…`;

  const afterImport = () => {
    status.textContent = `✓ Imported ${getState().transactions.length} transactions from ${file.name}`;
    showToast('Statement imported');
    renderAll();
  };

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
      try { parseCSV(e.target.result, file.name); afterImport(); }
      catch (err) { status.textContent = `⚠ Could not parse: ${err.message}`; }
    };
    reader.readAsText(file);
  } else if (ext === 'ofx' || ext === 'qfx') {
    const reader = new FileReader();
    reader.onload = e => {
      try { parseOFX(e.target.result); afterImport(); }
      catch (err) { status.textContent = `⚠ Could not parse OFX: ${err.message}`; }
    };
    reader.readAsText(file);
  } else if (ext === 'pdf') {
    parsePDF(file, status).then(() => renderAll());
  } else {
    status.textContent = `⚠ Unsupported file type: .${ext}`;
  }
}

export function initParser(renderAll) {
  const dropZone = $('#drop-zone');
  const fileInput = $('#stmt-file');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], renderAll);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0], renderAll);
    e.target.value = '';
  });
}
