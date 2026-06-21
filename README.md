# Portfolio Tracker

A privacy-first, browser-based portfolio tracker. All data stays on your machine — no servers, no accounts, no tracking.

## Quick Start

```bash
cd ~/Documents/portfolio-tracker
python3 -m http.server 8099
```

Then open **http://localhost:8099** in your browser.

> ES modules require HTTP — `file://` won't work. Any static server is fine (Python, Node, nginx, etc).

## Features

### Holdings Management
- **Add** assets with name/ticker, asset class, cost basis, current value, and monthly contribution
- **Edit** any holding inline via the pencil icon — all fields editable
- **Delete** holdings via the ✕ button
- **Search/filter** the holdings table by name or asset class
- All values in **GBP (£)**

### Dashboard Metrics
- **Total Value** — sum of all current holdings
- **Gain/Loss** — total and percentage, colour-coded green/red
- **Cost Basis** — total invested

### Charts
- **Allocation** — doughnut chart showing portfolio weights by holding
- **Performance Timeline** — line chart built from imported financial statements
- **Projected Growth** — compound interest projection over 1–30 years
  - Uses each holding's monthly contribution automatically
  - Adjustable annual growth rate
  - Shows projected value vs contributions-only baseline

### Financial Statement Import
Drag-and-drop or browse to import:
- **CSV** — auto-detects date/description/amount/balance columns from most bank/broker exports
- **OFX/QFX** — parses `<STMTTRN>` transaction blocks
- **PDF** — basic text extraction; finds dates+amounts or portfolio totals

Imported transactions appear in a log table and build a performance timeline chart.

### Data Management
- **Export** — downloads all holdings, transactions, and snapshots as JSON
- **Import** — restores from a previously exported JSON file
- **Persistence** — everything saved to `localStorage` automatically
- **Dark mode** — toggle via the moon/sun icon, preference persisted

## File Structure

```
portfolio-tracker/
├── index.html              HTML shell (no inline JS)
└── js/
    ├── main.js              Entry point, wires modules, defines renderAll()
    ├── state.js             Singleton state, localStorage load/save
    ├── utils.js             $, fmt, pct, uid, esc, showToast
    ├── metrics.js           Dashboard card updates
    ├── assets.js            Holdings table, add/edit/delete, edit modal
    ├── charts.js            Chart.js init + update (allocation, performance, projection)
    ├── transactions.js      Transaction log rendering + clear
    ├── parser.js            CSV/OFX/PDF statement ingestion
    ├── export-import.js     JSON export/import
    └── dark.js              Dark mode toggle
```

## Module Architecture

Uses **native ES modules** (`import`/`export`) — no bundler, no build step.

- `state.js` exports a singleton object + accessor/mutator functions
- All modules import state from the same source
- `main.js` passes `renderAll` as a callback to each module's `init()` to avoid circular imports
- `parser.js` is the largest module (~275 lines) — could be split into `csv.js`/`ofx.js`/`pdf.js` if needed

## Projection Formula

Compound interest with annualised monthly contributions:

```
FV = PV × (1 + r)^n + PMT × ((1 + r)^n - 1) / r
```

| Variable | Meaning |
|----------|---------|
| PV       | Current portfolio value |
| r        | Annual growth rate (decimal) |
| n        | Years |
| PMT      | Sum of all holdings' monthly contributions × 12 |

## Tech Stack

- **HTML5** — semantic markup
- **Tailwind CSS** — via CDN (`cdn.tailwindcss.com`)
- **Chart.js 4** — via CDN for charts
- **Vanilla JS (ES6+)** — no frameworks

## Privacy

All calculations, state, and data persistence happen **100% locally** in the browser. Nothing is sent to any server. Financial statements are parsed entirely client-side.
