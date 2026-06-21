# Portfolio Tracker

A privacy-first, browser-based portfolio tracker. All data stays on your machine — no servers, no accounts, no tracking.

## Quick Start

ES modules require HTTP — `file://` won't work. Any static server is fine.

### Python (all platforms)

**Linux / macOS:**
```bash
cd ~/Documents/portfolio-tracker
python3 -m http.server 8099
```

**Windows (Command Prompt):**
```cmd
cd C:\Users\YourName\Documents\portfolio-tracker
python -m http.server 8099
```

**Windows (PowerShell):**
```powershell
cd ~\Documents\portfolio-tracker
python -m http.server 8099
```

Then open **http://localhost:8099** in your browser.

### Node.js (all platforms)

**With npx (no install needed):**
```bash
cd ~/Documents/portfolio-tracker
npx serve .
```

**With http-server (global install):**
```bash
npm install -g http-server
cd ~/Documents/portfolio-tracker
http-server -p 8099
```

### Python not installed?

Download from https://www.python.org/downloads/ (Windows/Mac/Linux all supported). Check "Add Python to PATH" during Windows install.

### Mac alternatives

```bash
# Using PHP (pre-installed on Mac)
cd ~/Documents/portfolio-tracker
php -S localhost:8099

# Using Ruby (pre-installed on Mac)
cd ~/Documents/portfolio-tracker
ruby -run -e httpd . -p 8099
```

## Features

### Holdings Management
- **Add** assets with name/ticker, tax wrapper (ISA/SIPP/GIA/Cash), cost basis, current value, and monthly contribution
- **Edit** any holding inline via the pencil icon — all fields editable
- **Delete** holdings via the ✕ button
- **Search/filter** the holdings table by name or tax wrapper
- All values in **GBP (£)**

### Dashboard Metrics
- **Total Value** — sum of all current holdings
- **Gain/Loss** — total and percentage, colour-coded green/red
- **Cost Basis** — total invested

### Charts
- **Allocation** — doughnut chart showing portfolio weights by holding
- **Performance Timeline** — line chart built from imported financial statements
- **Projected Growth** — compound interest projection over 1–15 years
  - Uses each holding's monthly contribution automatically
  - Adjustable annual growth rate
  - Shows projected value vs contributions-only baseline

### Retirement Planner
- **Year-by-year drawdown simulation** — shows ISA, SIPP, GIA, Cash values each year
- **Per-person tax allowances** — Personal Allowance, PSA, CGT applied per person
- **SIPP 25% tax-free PCLS** — UFPLS model (25% tax-free, 75% taxable)
- **State pension age** — auto-calculated from DOB, separate from retirement age
- **Lifestyle scenarios** — Minimum, Moderate, Comfortable income targets
- **Drawdown chart** — visual portfolio depletion over time
- **CSV export** — download full year-by-year schedule

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
- **Dark mode** — toggle via the moon/sun icon, preference persisted across pages

## File Structure

```
portfolio-tracker/
├── index.html              Main portfolio page
├── retirement.html         Retirement planner page
├── FINANCIAL_LOGIC.md      Complete financial logic documentation
├── js/
│   ├── main.js              Entry point, wires modules
│   ├── state.js             Singleton state, localStorage load/save
│   ├── utils.js             $, fmt, pct, uid, esc, showToast
│   ├── metrics.js           Dashboard card updates
│   ├── assets.js            Holdings table, add/edit/delete, edit modal
│   ├── charts.js            Chart.js init + update (allocation, performance, projection)
│   ├── transactions.js      Transaction log rendering + clear
│   ├── parser.js            CSV/OFX/PDF statement ingestion
│   ├── export-import.js     JSON export/import
│   ├── dark.js              Dark mode toggle
│   ├── retirement.js        Tax engine, drawdown simulation, state pension
│   ├── retirement-setup.js  Retirement planner UI, accounts, scenarios
│   └── drawdown-chart.js    Drawdown chart with retirement marker
└── README.md
```

## Module Architecture

Uses **native ES modules** (`import`/`export`) — no bundler, no build step.

- `state.js` exports a singleton object + accessor/mutator functions
- All modules import state from the same source
- `main.js` passes `renderAll` as a callback to each module's `init()` to avoid circular imports
- `retirement.js` is the tax engine — all calculations live here
- `retirement-setup.js` wires the UI and calls the simulation

## Tax Engine

See `FINANCIAL_LOGIC.md` for complete documentation. Summary:

| Wrapper | Growth Tax | Withdrawal Tax | Drawdown Order |
|---------|-----------|----------------|----------------|
| ISA | Tax-free | Tax-free | 1st |
| Cash | 4% interest (PSA) | PSA + income tax | 2nd |
| GIA | CGT on gains | CGT (18%/24%) | 3rd |
| SIPP | Tax-free | 25% PCLS + income tax | 4th |

### Per-Person Allowances (2026/27)
- **Personal Allowance**: £12,570
- **PSA**: £1,000 per person (basic rate)
- **CGT Exemption**: £3,000 per person
- **SIPP Access Age**: 55+

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
- **chartjs-plugin-annotation** — retirement marker line
- **Vanilla JS (ES6+)** — no frameworks

## Privacy

All calculations, state, and data persistence happen **100% locally** in the browser. Nothing is sent to any server. Financial statements are parsed entirely client-side.
