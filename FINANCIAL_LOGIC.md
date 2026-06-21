# Retirement Planner — Financial Logic Documentation

## Overview

The retirement planner is a year-by-year simulation engine that models portfolio accumulation (pre-retirement) and drawdown (retirement) for a couple. It accounts for UK tax rules, multiple account wrappers, state pensions, and inflation.

---

## 1. Simulation Engine (`runDrawdownSimulation`)

### 1.1 Phases

The simulation runs two distinct phases:

**Phase 1: Pre-Retirement (Accumulation)**
- Starts at current portfolio value (sum of all account values)
- Each year: grows at `preRetReturn` rate, adds monthly contributions × 12
- SIPP accounts grow in the `uncrystallised` sub-pot
- **Cash accounts earn 4% interest annually (taxable with PSA)**
- No withdrawals, no tax on other accounts
- Continues until Person 1 reaches `p1RetirementAge`

**Phase 2: Retirement (Drawdown)**
- Each year: grows at `postRetReturn` rate
- Withdrawal need = `targetAnnualIncome` inflated by `inflationRate` compounding
- State pension kicks in at each person's `statePensionAge` (separate from retirement age)
- Net withdrawal = gross need − state pension
- Tax is calculated on the net withdrawal using the optimal drawdown order
- Portfolio value = sum of all account values after growth and withdrawal

### 1.2 Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `p1CurrentAge` | 35 | Person 1's current age |
| `p1RetirementAge` | 65 | Age Person 1 wants to retire |
| `p1LifeExpectancy` | 90 | Used to determine simulation end |
| `p1StatePension` | £11,500/yr | Full new state pension (2024/25) |
| `p1StatePensionAge` | 67 | Auto-calculated from DOB |
| `preRetReturn` | 6% | Annual growth during accumulation |
| `postRetReturn` | 4% | Annual growth during drawdown (conservative) |
| `inflationRate` | 3% | Annual inflation for withdrawal increases |
| `targetAnnualIncome` | £45,000 | Desired annual retirement income (today's money) |

### 1.3 Simulation End Conditions

- Portfolio depleted (value ≤ 0) → stops immediately
- Person 1 reaches `p1LifeExpectancy` → stops
- Person 2's life expectancy is also considered for the simulation length

---

## 2. Account Wrappers

### 2.1 ISA (Individual Savings Account)
- **Growth**: Tax-free (no CGT, no income tax on dividends/interest)
- **Withdrawal**: Completely tax-free
- **Drawdown order**: First (most tax-efficient)
- **Access age**: Any age
- **Modelled**: ✅ Full tax-free treatment

### 2.2 SIPP (Self-Invested Personal Pension)
- **Growth**: Tax-free inside wrapper
- **Sub-pots tracked**:
  - `uncrystallised`: Not yet accessed, grows tax-free
  - `crystallised`: 75% of previously crystallised amount, available for taxable drawdown
- **Withdrawal method**: Drawdown (PCLS — Pension Commencement Lump Sum)
  - 25% of crystallised amount = tax-free PCLS
  - 75% = moves to crystallised pot, taxed as income when drawn
- **Drawdown order**: Last (least tax-efficient)
- **Access age**: 55+ (owner's age, based on `owner` field: p1/p2/joint)
- **Modelled**: ✅ Two sub-pots, 25/75 split, age 55+ restriction

### 2.3 GIA (General Investment Account)
- **Growth**: Taxed (CGT on gains when realised)
- **Withdrawal**: CGT on gains above annual exempt amount
- **Drawdown order**: Third (after ISA and Cash)
- **CGT calculation**: Assumes 60% of withdrawn value is gain
- **Annual exempt amount**: £3,000 (2024/25)
- **CGT rates: 18% (basic rate taxpayer), 24% (higher/additional rate taxpayer)
- **Modelled**: ✅ Simplified 60% gain assumption, CGT annual exemption

### 2.4 Cash / Savings
- **Growth**: 4% interest annually (taxable)
- **Withdrawal**: Interest uses Personal Savings Allowance, then taxed as income
- **Drawdown order**: Second (after ISA)
- **Assumed yield**: 4% per year
- **Personal Savings Allowance**: £1,000 per person (basic rate), £500 per person (higher rate)
  - Joint accounts: £2,000 PSA (£1,000 per person)
  - Individual accounts: £1,000 PSA
- **Modelled**: ✅ 4% yield, per-person PSA, income tax on interest above allowance

---

## 3. Optimal Drawdown Order

The calculator uses this sequence to minimise lifetime tax:

1. **ISA** — tax-free, no impact on Personal Allowance
2. **Cash** — uses PSA (£1k/£500), then fills Personal Allowance
3. **GIA** — uses CGT annual exemption (£3k gains/year)
4. **SIPP** — 25% tax-free PCLS, remainder fills Personal Allowance, then basic rate band

This order is hardcoded in `calcAfterTaxWithdrawal()`:
```js
const order = { 'ISA': 0, 'Cash': 1, 'GIA': 2, 'SIPP': 3 };
```

---

## 4. Tax Engine

### 4.1 Income Tax (2024/25)

Implemented in `calcIncomeTax(taxableIncome)`:

| Band | Income Range | Rate |
|------|-------------|------|
| Personal Allowance | £0 – £12,570 | 0% |
| Basic Rate | £12,571 – £50,270 | 20% |
| Higher Rate | £50,271 – £125,140 | 40% |
| Additional Rate | Over £125,140 | 45% |

**Personal Allowance taper**: Reduced by £1 for every £2 over £100,000. Fully eliminated at £125,140.

**Marginal tax calculation**: The calculator uses marginal tax (tax on the next £1 of income) to compute the tax impact of each withdrawal source. This is done by:
```js
marginalTax = calcIncomeTax(otherIncome + withdrawal).tax - calcIncomeTax(otherIncome).tax
```

### 4.2 Capital Gains Tax (2024/25)

Implemented in `calcCGT(gain, otherTaxableIncome)`:

- **Annual Exempt Amount**: £3,000 per person per tax year
- **Rates: 18% (basic rate taxpayer), 24% (higher rate taxpayer) for shares/funds rate taxpayer) for shares/funds
- **Rate determination**: Based on total income (other income + taxable gain) relative to basic rate threshold (£50,270)

### 4.3 Savings Tax (2024/25)

Implemented in `calcSavingsTax(interest, otherTaxableIncome)`:

- **Personal Savings Allowance (PSA)**:
  - Basic rate taxpayer: £1,000 interest tax-free
  - Higher rate taxpayer: £500 interest tax-free
  - Additional rate taxpayer: £0
- **Tax rates on excess**: 20% (basic), 40% (higher), 45% (additional)

### 4.4 SIPP Tax Treatment

- **25% PCLS**: Tax-free, does NOT use Personal Allowance
- **75% taxable portion**: Taxed as income, uses Personal Allowance first
- **Marginal calculation**: Tax on SIPP withdrawal = tax(otherIncome + taxablePortion) − tax(otherIncome)

---

## 5. State Pension

### 5.1 State Pension Age Calculation

Implemented in `calcStatePensionAge(dobString)`:

| Date of Birth | State Pension Age |
|---------------|-------------------|
| Before 6 Dec 1953 | 65 |
| 6 Dec 1953 – 5 Oct 1954 | 65–66 (gradual) |
| 6 Oct 1954 – 5 Apr 1960 | 66 |
| 6 Apr 1960 – 5 Mar 1961 | 66–67 (gradual) |
| 6 Mar 1961 – 5 Apr 1977 | 67 |
| 6 Apr 1977 – 5 Apr 1978 | 67–68 (gradual) |
| After 5 Apr 1978 | 68 |

### 5.2 State Pension Amount

- **Default**: £11,500/year (full new state pension, 2024/25)
- **Inflation**: Compounded at `inflationRate` each year
- **Taxable**: Yes, counts as income for income tax
- **Separate from retirement age**: State pension starts at `statePensionAge`, not `retirementAge`

---

## 6. Inflation Adjustment

All monetary values in the simulation are in "today's money" except:

- **Withdrawals**: Inflation-adjusted each year: `targetAnnualIncome × (1 + inflationRate)^yearsSinceRetirement`
- **State pensions**: Inflation-adjusted from retirement year (not from state pension age)
- **Portfolio values**: Nominal (not inflation-adjusted)

---

## 7. Lifestyle Scenarios

Three scenarios are calculated (`calculateLifestyleScenarios`):

| Level | Default Income | Description |
|-------|---------------|-------------|
| Low | £25,000/yr | Essential |
| Medium | £45,000/yr | Comfortable |
| High | £70,000/yr | Luxury |

For each scenario:
- Run full simulation with that target income
- Check if portfolio depletes before life expectancy
- Calculate Safe Withdrawal Rate (SWR) = target / portfolioAtRetirement
- Report years lasted and depletion age (if applicable)

---

## 8. Safe Withdrawal Rate (SWR)

```js
SWR = (annualWithdrawal / portfolioAtRetirement) × 100
```

Where `portfolioAtRetirement` is the actual simulated value at the year Person 1 reaches retirement age (not a projection).

---

## 9. Maximum Sustainable Income

Uses binary search (`findMaxSustainableIncome`):
- Search range: 0 to 3× target income
- Tolerance: £100
- Max iterations: 50
- Finds the highest income where portfolio doesn't deplete before life expectancy

---

## 10. What's Simplified / Not Modelled

| Feature | Status | Notes |
|---------|--------|-------|
| ISA contribution limits | ❌ Not modelled | £20k/year per person |
| SIPP contribution limits | ❌ Not modelled | £60k/year, taper for high earners |
| SIPP tax relief on contributions | ❌ Not modelled | 20%/40%/45% relief |
| CGT on GIA | ⚠️ Simplified | 60% of withdrawal assumed to be gain |
| Dividend tax on GIA | ❌ Not modelled | £500 dividend allowance |
| Bed & ISA / CGT harvesting | ❌ Not modelled | Annual tax-loss/gain harvesting |
| National Insurance | ❌ Not modelled | Complex, age-dependent |
| Inheritance Tax | ❌ Not modelled | ISA loses tax-free status on death |
| State Pension deferral | ❌ Not modelled | Can defer for higher payments |
| Personal Allowance taper | ⚠️ Partially | Implemented in calcIncomeTax but not in withdrawal sequencing |
| MPAA (Money Purchase Annual Allowance) | ❌ Not modelled | £10k limit after UFPLS/flexible drawdown |
| Couple-level tax planning | ❌ Not modelled | Each person's allowances not separately tracked |
| Drawdown UFPLS method | ❌ Not modelled | Only PCLS (Method A) is modelled |

---

## 11. Data Flow

```
User Input (formState)
    ↓
init() → bindInputs() → auto-populate from portfolio
    ↓
renderAll() → renderSummary() + renderScenarioCards() + renderDrawdownSchedule()
    ↓
renderDrawdownSchedule() → generateDrawdownChartData() → runDrawdownSimulation()
    ↓
For each year:
  1. Apply growth (preRetR or postRetR)
  2. Calculate withdrawal need (inflation-adjusted)
  3. Subtract state pension
  4. calcAfterTaxWithdrawal() → optimal drawdown order
  5. Update account values
  6. Record result
    ↓
Results → Chart.js chart + Year-by-year table + Scenario cards + KPIs
```

---

## 12. Key Functions Reference

| Function | File | Purpose |
|----------|------|---------|
| `runDrawdownSimulation()` | retirement.js | Main simulation engine |
| `calcAfterTaxWithdrawal()` | retirement.js | Tax-optimal drawdown with SIPP sub-pots |
| `calcIncomeTax()` | retirement.js | UK income tax with Personal Allowance taper |
| `calcCGT()` | retirement.js | Capital gains tax with annual exemption |
| `calcSavingsTax()` | retirement.js | Savings interest tax with PSA |
| `calcStatePensionAge()` | retirement.js | SPA from DOB |
| `projectPortfolioValue()` | retirement.js | Compound growth projection |
| `calculateLifestyleScenarios()` | retirement.js | Low/med/high scenario analysis |
| `generateDrawdownChartData()` | retirement.js | Chart data from simulation |
| `safeWithdrawalRate()` | retirement.js | SWR calculation |
| `findMaxSustainableIncome()` | retirement.js | Binary search for max income |
| `renderSummary()` | retirement-setup.js | KPI display |
| `renderScheduleTable()` | retirement-setup.js | Year-by-year table |
| `syncFromPortfolio()` | retirement-setup.js | Sync accounts from main portfolio |
| `init()` | retirement-setup.js | Initialisation, auto-populate |

---

## 13. Tax Year Constants (2024/25)

Update these annually in `retirement.js`:

```js
const INCOME_TAX = {
  personalAllowance: 12570,
  basicRate: { threshold: 50270, rate: 0.20 },
  higherRate: { threshold: 125140, rate: 0.40 },
  additionalRate: { rate: 0.45 },
  taperThreshold: 100000,
};

const CGT = {
  annualExempt: 3000,
  basicRate: 0.10,
  higherRate: 0.20,
};

const SAVINGS = {
  personalSavingsAllowance: { basic: 1000, higher: 500, additional: 0 },
};
```

State pension default: £11,500/year (update with Triple Lock).
