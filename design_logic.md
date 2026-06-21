# UK Retirement Tax Logic — Design Document

## Tax Year: 2025/26 (update annually)

---

## 1. Account Wrapper Tax Treatment

### ISA (Individual Savings Account)
- **Annual contribution limit**: £20,000 per person per tax year
- **Growth inside wrapper**: Completely tax-free (no CGT, no income tax on dividends/interest)
- **Withdrawals**: Completely tax-free, no impact on Personal Allowance
- **Inheritance**: ISA loses tax-free status on death (forms part of estate for IHT)
- **Key rule**: Best account to draw from first in retirement — zero tax impact

### SIPP (Self-Invested Personal Pension)
- **Annual contribution limit**: £60,000 (or annual earnings, whichever is lower) with taper for high earners
- **Growth inside wrapper**: Completely tax-free (no CGT, no income tax)
- **Access age**: Currently 55, rising to 57 from April 2028
- **On withdrawal** — TWO methods with different tax treatment:

  #### Method A: Drawdown (PCLS — Pension Commencement Lump Sum)
  - "Crystallise" a portion of the pension pot
  - **25% of the crystallised amount is paid out completely tax-free** (PCLS)
  - The remaining 75% moves into a drawdown fund (invested, growing tax-free)
  - The 75% is only taxed as income when you actually withdraw it from the drawdown fund
  - **Key benefit**: You can take ONLY the 25% tax-free cash now, and leave the 75% untouched to grow
  - **Does NOT trigger MPAA** (Money Purchase Annual Allowance) — you can still contribute up to £60k/year

  #### Method B: UFPLS (Uncrystallised Funds Pension Lump Sum)
  - Direct withdrawal from an untouched ("uncrystallised") pension pot
  - **Every withdrawal is automatically split: 25% tax-free, 75% taxable income**
  - Cannot opt out of the split — every UFPLS withdrawal is 25/75
  - **Triggers MPAA**: Future pension contributions restricted to £10,000/year
  - **Example**: Request £4,000 UFPLS → £1,000 tax-free, £3,000 taxed as income

  #### Which method to use?
  - **Drawdown (PCLS)** is better when you want tax-free cash now but don't need taxable income yet
  - **UFPLS** is simpler for ad-hoc withdrawals but triggers MPAA and forces taxable income
  - **Calculator models Method A (Drawdown/PCLS)** — user controls when taxable portion is drawn

- **MPAA (Money Purchase Annual Allowance)**: Triggered by UFPLS or flexible drawdown income. Reduces future SIPP contribution limit from £60,000 to £10,000/year. Taking only the 25% PCLS does NOT trigger it.
- **Key rule**: Draw SIPP last in retirement — use up Personal Allowance from other sources first, then SIPP fills remaining allowance tax-free

### GIA (General Investment Account) — Taxable
- **No contribution limit**
- **CGT Annual Exempt Amount (AEA)**: £3,000 per person per tax year (2025/26)
  - Gains above £3,000 are taxed
  - CGT rates: 10% (basic rate taxpayer), 20% (higher rate taxpayer) for shares/funds
  - CGT rates: 18%/24% for residential property
- **Dividend Allowance**: £500 per person per tax year (2025/26)
  - Dividends above £500 taxed at 8.75% (basic), 33.75% (higher), 39.35% (additional)
- **Bed & ISA**: Can sell and rebuy inside ISA each year to reset cost basis (CGT harvesting)
- **Key rule**: Use annual CGT exemption by realising gains up to £3k/year tax-free. Harvest gains into ISA when possible.

### Cash / Savings
- **Personal Savings Allowance (PSA)**:
  - Basic rate taxpayer (income ≤ £50,270): £1,000 interest tax-free
  - Higher rate taxpayer (income £50,271–£125,140): £500 interest tax-free
  - Additional rate taxpayer (income > £125,140): £0
- **Starter Rate for Savings**: 0% on first £5,000 of savings income (if non-savings income ≤ £17,570)
- **Interest taxed as income** (not savings income separately — it's just income tax on interest)
- **Key rule**: Cash interest is taxed as income. Use ISA wrapper for cash to make interest tax-free.

---

## 2. Income Tax Bands (2025/26)

| Band | Taxable Income | Rate |
|------|---------------|------|
| Personal Allowance | £0 – £12,570 | 0% |
| Basic Rate | £12,571 – £50,270 | 20% |
| Higher Rate | £50,271 – £125,140 | 40% |
| Additional Rate | Over £125,140 | 45% |

**Personal Allowance taper**: Reduced by £1 for every £2 of income over £100,000. Fully eliminated at £125,140.

**National Insurance**: Not modelled in this calculator (complex, age-dependent, stops at State Pension Age).

---

## 3. Optimal Drawdown Order (Tax-Efficient)

The calculator uses this drawdown sequence to minimise lifetime tax:

### Phase 1: Pre-State Pension Age (e.g., retire at 60, SPA at 67)
1. **ISA** — tax-free, no impact on Personal Allowance
2. **Cash** — interest uses PSA (£1k/£500), then taxed as income
3. **GIA** — use annual CGT exemption (£3k gains/year), sell and rebed into ISA
4. **SIPP** — 25% tax-free, 75% uses Personal Allowance first (tax-free up to £12,570)

### Phase 2: Post-State Pension Age (SPA+)
1. **State Pension** — taxable income, uses part of Personal Allowance
2. **ISA** — still tax-free
3. **Cash** — PSA first, then income tax
4. **GIA** — CGT exemption harvesting
5. **SIPP** — 25% tax-free, remainder fills remaining Personal Allowance, then basic rate band

### Key Strategy
- **Never waste Personal Allowance**: If state pension + other income < £12,570, top up from SIPP (tax-free within allowance)
- **CGT harvesting**: Realise £3k gains/year from GIA tax-free
- **ISA first**: Always draw ISA before taxable accounts (no tax drag)
- **SIPP last**: Defer SIPP as long as possible (tax-free growth inside), use to fill basic rate band

---

## 4. State Pension (2025/26)

- **Full new State Pension**: £11,502.40/year (£221.20/week)
- **State Pension Age**: Depends on DOB (66–68, see `calcStatePensionAge()`)
- **Taxable**: Yes, counts as income for income tax purposes
- **Triple Lock**: Increases by highest of CPI, earnings growth, or 2.5%
- **Deferral**: Can defer State Pension for higher payments (extra 1% per 9 weeks deferred)

---

## 5. Annual Allowances Summary (Per Person)

| Allowance | Amount | Applies To |
|-----------|--------|------------|
| Personal Allowance | £12,570 | All income (SIPP drawdown, cash interest, state pension, GIA dividends) |
| CGT Annual Exempt | £3,000 | GIA capital gains only |
| Dividend Allowance | £500 | GIA dividends only |
| Personal Savings Allowance | £1,000 / £500 / £0 | Cash interest (depends on tax band) |
| ISA Contribution | £20,000 | ISA wrapper |
| SIPP Contribution | £60,000 | Pension wrapper |
| SIPP Tax-Free Lump Sum | 25% of pot | SIPP withdrawals |

---

## 6. Calculator Implementation Notes

### What's Modelled
- ✅ Income tax on SIPP drawdown (25% tax-free, 75% taxable)
- ✅ Personal Allowance usage across income sources
- ✅ State Pension as taxable income starting at SPA
- ✅ ISA withdrawals tax-free
- ✅ Age 55+ SIPP access restriction
- ✅ Per-person account ownership (p1/p2/joint)
- ✅ Optimal drawdown order (ISA → Cash → GIA → SIPP)

### What's Simplified / Not Yet Modelled
- ❌ CGT on GIA (assumes 60% of withdrawal is gain, uses AEA)
- ❌ Dividend tax on GIA
- ❌ Personal Savings Allowance on cash interest (assumes 4% yield, taxed as income)
- ❌ ISA contribution limits during accumulation
- ❌ SIPP contribution limits and tax relief
- ❌ Bed & ISA / CGT harvesting strategy
- ❌ National Insurance contributions
- ❌ Inheritance Tax
- ❌ State Pension deferral
- ❌ Personal Allowance taper over £100k
- ❌ Couple-level tax planning (each person has own allowances)

### Tax Year Updates
These values should be updated each April:
- Personal Allowance: £12,570 (frozen until 2028)
- CGT Annual Exempt: £3,000 (frozen)
- Dividend Allowance: £500 (frozen)
- PSA: £1,000 / £500 / £0 (frozen)
- ISA limit: £20,000 (frozen)
- Income tax bands: frozen until 2028
- State Pension: increases by Triple Lock

---

## 7. References
- [GOV.UK — Tax on Pension](https://www.gov.uk/tax-on-pension/tax-free)
- [GOV.UK — CGT Allowances](https://www.gov.uk/capital-gains-tax/allowances)
- [GOV.UK — ISA Overview](https://www.gov.uk/individual-savings-accounts)
- [GOV.UK — Understanding Tax and Your Pension](https://www.gov.uk/guidance/understanding-tax-and-your-pension)
- [MoneySavingExpert — Personal Savings Allowance](https://www.moneysavingexpert.com/savings/personal-savings-allowance/)
