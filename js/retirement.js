import { getAssets } from './state.js';
import { fmt } from './utils.js';

// ─── UK State Pension Age Calculator ───────────────────────────
// Based on UK government rules: https://www.gov.uk/state-pension-age
export function calcStatePensionAge(dobString) {
  if (!dobString) return 67; // default
  const dob = new Date(dobString);
  const y = dob.getFullYear(), m = dob.getMonth() + 1, d = dob.getDate();

  // Men born before 6 Apr 1953: pension age 65
  // Women born before 6 Apr 1953: pension age 60 (equalised now)
  // Simplified: use the unified rules post-equalisation

  // Born before 6 Dec 1953 → pension age 65 (men) / 60-65 (women, equalised)
  // Born 6 Dec 1953 – 5 Oct 1954 → gradual increase 65–66
  // Born 6 Oct 1954 – 5 Apr 1960 → pension age 66
  // Born 6 Apr 1960 – 5 Mar 1961 → gradual increase 66–67
  // Born after 5 Mar 1961 → pension age 67
  // Future: rising to 68 between 2044–2046 (born after 6 Apr 1977)

  // Simplified calculation using date comparison
  if (dob < new Date(1953, 11, 6)) return 65; // before 6 Dec 1953
  if (dob < new Date(1954, 9, 6)) {
    // 6 Dec 1953 – 5 Oct 1954: gradual 65→66
    const monthsSince = (dob.getFullYear() - 1953) * 12 + (dob.getMonth() - 11);
    return 65 + Math.min(monthsSince / 12, 1);
  }
  if (dob < new Date(1960, 3, 6)) return 66; // 6 Oct 1954 – 5 Apr 1960
  if (dob < new Date(1961, 2, 6)) {
    // 6 Apr 1960 – 5 Mar 1961: gradual 66→67
    const monthsSince = (dob.getFullYear() - 1960) * 12 + (dob.getMonth() - 3);
    return 66 + Math.min(monthsSince / 12, 1);
  }
  if (dob < new Date(1977, 3, 6)) return 67; // 6 Mar 1961 – 5 Apr 1977
  if (dob < new Date(1978, 3, 6)) {
    // 6 Apr 1977 – 5 Apr 1978: gradual 67→68
    const monthsSince = (dob.getFullYear() - 1977) * 12 + (dob.getMonth() - 3);
    return 67 + Math.min(monthsSince / 12, 1);
  }
  return 68; // born after 5 Apr 1978
}

// ─── UK Tax Engine (2024/25) ───────────────────────────────────

// Income tax bands (2024/25)
const INCOME_TAX = {
  personalAllowance: 12570,
  basicRate: { threshold: 50270, rate: 0.20 },
  higherRate: { threshold: 125140, rate: 0.40 },
  additionalRate: { rate: 0.45 },
  // Personal allowance taper: reduced by £1 for every £2 over £100k
  taperThreshold: 100000,
};

// CGT (2026/27)
const CGT = {
  annualExempt: 3000,
  basicRate: 0.18,    // 18% for basic rate taxpayers
  higherRate: 0.24,   // 24% for higher/additional rate taxpayers
};

// Savings (2024/25)
const SAVINGS = {
  personalSavingsAllowance: {
    basic: 1000,   // basic rate taxpayers
    higher: 500,   // higher rate taxpayers
    additional: 0, // additional rate taxpayers
  },
  starterRate: { threshold: 5000, rate: 0 }, // 0% on first £5k savings income if income ≤ £17,570
};

/**
 * Calculate income tax on a given taxable income (2024/25).
 * Returns { tax, effectiveRate, marginalRate, breakdown }
 */
export function calcIncomeTax(taxableIncome) {
  if (taxableIncome <= 0) return { tax: 0, effectiveRate: 0, marginalRate: 0, breakdown: [] };

  // Personal allowance taper
  let pa = INCOME_TAX.personalAllowance;
  if (taxableIncome > INCOME_TAX.taperThreshold) {
    const reduction = Math.floor((taxableIncome - INCOME_TAX.taperThreshold) / 2);
    pa = Math.max(0, pa - reduction);
  }

  const breakdown = [];
  let remaining = taxableIncome;
  let tax = 0;

  // Personal allowance band
  const paBand = Math.min(remaining, pa);
  if (paBand > 0) {
    breakdown.push({ band: 'Personal Allowance', amount: paBand, rate: 0, tax: 0 });
    remaining -= paBand;
  }

  // Basic rate band
  const basicBand = Math.min(remaining, INCOME_TAX.basicRate.threshold - pa);
  if (basicBand > 0) {
    const t = basicBand * INCOME_TAX.basicRate.rate;
    breakdown.push({ band: 'Basic Rate (20%)', amount: basicBand, rate: 0.20, tax: t });
    tax += t;
    remaining -= basicBand;
  }

  // Higher rate band
  const higherBand = Math.min(remaining, INCOME_TAX.higherRate.threshold - INCOME_TAX.basicRate.threshold);
  if (higherBand > 0) {
    const t = higherBand * INCOME_TAX.higherRate.rate;
    breakdown.push({ band: 'Higher Rate (40%)', amount: higherBand, rate: 0.40, tax: t });
    tax += t;
    remaining -= higherBand;
  }

  // Additional rate
  if (remaining > 0) {
    const t = remaining * INCOME_TAX.additionalRate.rate;
    breakdown.push({ band: 'Additional Rate (45%)', amount: remaining, rate: 0.45, tax: t });
    tax += t;
  }

  const marginalRate = taxableIncome > INCOME_TAX.higherRate.threshold ? 0.45 :
    taxableIncome > INCOME_TAX.basicRate.threshold ? 0.40 :
    taxableIncome > pa ? 0.20 : 0;

  return {
    tax: Math.round(tax),
    effectiveRate: taxableIncome > 0 ? (tax / taxableIncome) * 100 : 0,
    marginalRate: marginalRate * 100,
    breakdown,
  };
}

/**
 * Calculate CGT on a capital gain (2024/25).
 * Takes into account the taxpayer's income to determine CGT rate.
 * Returns { tax, rate, exemptUsed }
 */
export function calcCGT(gain, otherTaxableIncome) {
  const exempt = Math.min(gain, CGT.annualExempt);
  const taxable = Math.max(0, gain - exempt);

  if (taxable <= 0) return { tax: 0, rate: 0, exemptUsed: exempt };

  // Determine CGT rate based on income + gain
  const totalIncome = otherTaxableIncome + taxable;
  const rate = totalIncome > INCOME_TAX.basicRate.threshold ? CGT.higherRate : CGT.basicRate;

  return {
    tax: Math.round(taxable * rate),
    rate: rate * 100,
    exemptUsed: exempt,
  };
}

/**
 * Calculate tax on savings interest (2024/25).
 * Returns { tax, rate, psaUsed }
 */
export function calcSavingsTax(interest, otherTaxableIncome) {
  if (interest <= 0) return { tax: 0, rate: 0, psaUsed: 0 };

  // Determine PSA level
  let psa;
  if (otherTaxableIncome <= INCOME_TAX.basicRate.threshold) psa = SAVINGS.personalSavingsAllowance.basic;
  else if (otherTaxableIncome <= INCOME_TAX.higherRate.threshold) psa = SAVINGS.personalSavingsAllowance.higher;
  else psa = SAVINGS.personalSavingsAllowance.additional;

  const psaUsed = Math.min(interest, psa);
  const taxable = Math.max(0, interest - psaUsed);

  if (taxable <= 0) return { tax: 0, rate: 0, psaUsed };

  // Tax rate on savings income
  const rate = otherTaxableIncome > INCOME_TAX.higherRate.threshold ? 0.45 :
    otherTaxableIncome > INCOME_TAX.basicRate.threshold ? 0.40 : 0.20;

  return {
    tax: Math.round(taxable * rate),
    rate: rate * 100,
    psaUsed,
  };
}

/**
 * Calculate the after-tax income from drawing down different account types.
 * Accounts: ISA (tax-free), SIPP (25% tax-free, 75% income tax), GIA (CGT), Cash (savings tax on interest)
 *
 * For drawdown modelling:
 * - ISA: fully tax-free
 * - SIPP: 25% tax-free lump sum if useTaxFree25=true, remaining 75% taxed as income
 * - GIA: CGT on gains above annual exempt amount (simplified: 60% of value is gain)
 * - Cash: savings interest taxed at 4% assumed yield
 *
 * Drawdown order is tax-optimised: ISA (tax-free) → Cash (PSA) → GIA (CGT allowance) → SIPP (25% free)
 * SIPP accounts are only accessible if their owner is 55+.
 *
 * Returns { afterTax, taxBreakdown: { isa, sipp, gia, cash } }
 */
export function calcAfterTaxWithdrawal(amount, accounts, sp1, sp2, p1Age, p2Age) {
  // Filter accessible accounts (SIPP requires owner age 55+)
  const accessible = accounts.filter(acc => {
    if (acc.name !== 'SIPP') return true;
    let ownerAge;
    if (acc.owner === 'p1') ownerAge = p1Age;
    else if (acc.owner === 'p2') ownerAge = p2Age;
    else ownerAge = Math.max(p1Age || 0, p2Age || 0); // joint: either can access
    return ownerAge >= 55;
  });

  if (accessible.length === 0) {
    return { afterTax: amount, tax: 0, taxBreakdown: { isa: 0, sipp: 0, gia: 0, cash: 0 }, effectiveRate: 0, drawnAccounts: [], sippCrystallised: 0, sippTaxFreeTaken: 0 };
  }

  // Sort: ISA (tax-free) → Cash (PSA) → GIA (CGT) → SIPP (drawdown)
  const sorted = [...accessible].sort((a, b) => {
    const order = { 'ISA': 0, 'Cash': 1, 'GIA': 2, 'SIPP': 3 };
    return (order[a.name] ?? 9) - (order[b.name] ?? 9);
  });

  let remaining = amount;
  let totalTax = 0;
  const drawnAccounts = [];
  const taxBreakdown = { isa: 0, sipp: 0, gia: 0, cash: 0 };
  let sippTaxFreeTaken = 0;
  // Track per-person allowances used
  const cgtExemptUsed = { p1: 0, p2: 0, joint: 0 };
  const psaUsed = { p1: 0, p2: 0, joint: 0 };

  for (const acc of sorted) {
    if (remaining <= 0) break;
    const draw = Math.min(remaining, acc.value || acc.currentValue || 0);
    if (draw <= 0) continue;
    drawnAccounts.push(acc);

    if (acc.name === 'SIPP') {
      // SIPP drawdown: withdraw from uncrystallised pot
      const fromUncrys = Math.min(draw, acc.uncrystallised || 0);
      acc.uncrystallised = (acc.uncrystallised || 0) - fromUncrys;
      
      // 25% is tax-free PCLS
      const pcls = fromUncrys * 0.25;
      sippTaxFreeTaken += pcls;
      
      // 75% is taxable income
      const taxable = fromUncrys * 0.75;
      
      // Tax: taxable amount minus Personal Allowance, at 20% basic rate
      const taxOnThis = Math.max(0, taxable - INCOME_TAX.personalAllowance) * INCOME_TAX.basicRate.rate;
      taxBreakdown.sipp += Math.round(taxOnThis);
      totalTax += taxOnThis;
    } else if (acc.name === 'GIA') {
      // CGT: assume 60% of withdrawn value is gain
      const gain = draw * 0.6;
      
      // Determine owner's income for CGT rate
      let ownerIncome = sp1 + sp2; // default to combined
      let ownerExemptUsed = cgtExemptUsed.joint;
      
      if (acc.owner === 'p1') {
        ownerIncome = sp1;
        ownerExemptUsed = cgtExemptUsed.p1;
      } else if (acc.owner === 'p2') {
        ownerIncome = sp2;
        ownerExemptUsed = cgtExemptUsed.p2;
      }
      
      // Apply per-person CGT exemption (£3,000 each)
      const exempt = Math.min(gain, CGT.annualExempt - ownerExemptUsed);
      const taxable = Math.max(0, gain - exempt);
      
      // Track exemption used
      if (acc.owner === 'p1') cgtExemptUsed.p1 += exempt;
      else if (acc.owner === 'p2') cgtExemptUsed.p2 += exempt;
      else cgtExemptUsed.joint += exempt;
      
      if (taxable > 0) {
        const totalIncome = ownerIncome + taxable;
        const rate = totalIncome > INCOME_TAX.basicRate.threshold ? CGT.higherRate : CGT.basicRate;
        const tax = Math.round(taxable * rate);
        taxBreakdown.gia += tax;
        totalTax += tax;
      }
    } else if (acc.name === 'Cash') {
      // Interest on cash (assume 4% yield)
      const interest = draw * 0.04;
      
      // Determine owner's income for PSA level
      let ownerIncome = sp1 + sp2; // default to combined
      let ownerPsaUsed = psaUsed.joint;
      
      if (acc.owner === 'p1') {
        ownerIncome = sp1;
        ownerPsaUsed = psaUsed.p1;
      } else if (acc.owner === 'p2') {
        ownerIncome = sp2;
        ownerPsaUsed = psaUsed.p2;
      }
      
      // Determine PSA level based on owner's income
      // Joint accounts: each person gets their own PSA (£1,000 basic, £500 higher)
      let psa;
      if (acc.owner === 'joint') {
        // For joint accounts, use combined PSA (£2,000 for basic rate)
        if (ownerIncome <= INCOME_TAX.basicRate.threshold) psa = SAVINGS.personalSavingsAllowance.basic * 2;
        else if (ownerIncome <= INCOME_TAX.higherRate.threshold) psa = SAVINGS.personalSavingsAllowance.higher * 2;
        else psa = 0;
      } else {
        // Individual accounts: use single PSA
        if (ownerIncome <= INCOME_TAX.basicRate.threshold) psa = SAVINGS.personalSavingsAllowance.basic;
        else if (ownerIncome <= INCOME_TAX.higherRate.threshold) psa = SAVINGS.personalSavingsAllowance.higher;
        else psa = SAVINGS.personalSavingsAllowance.additional;
      }
      
      // Apply per-person PSA
      const psaAvail = Math.max(0, psa - ownerPsaUsed);
      const psaUsedThis = Math.min(interest, psaAvail);
      const taxable = Math.max(0, interest - psaUsedThis);
      
      // Track PSA used
      if (acc.owner === 'p1') psaUsed.p1 += psaUsedThis;
      else if (acc.owner === 'p2') psaUsed.p2 += psaUsedThis;
      else psaUsed.joint += psaUsedThis;
      
      if (taxable > 0) {
        const rate = ownerIncome > INCOME_TAX.higherRate.threshold ? 0.45 :
          ownerIncome > INCOME_TAX.basicRate.threshold ? 0.40 : 0.20;
        const tax = Math.round(taxable * rate);
        taxBreakdown.cash += tax;
        totalTax += tax;
      }
    } else {
      // ISA or unknown — tax-free
    }
    remaining -= draw;
  }

  return {
    afterTax: amount - totalTax,
    tax: Math.round(totalTax),
    taxBreakdown,
    effectiveRate: amount > 0 ? (totalTax / amount) * 100 : 0,
    drawnAccounts,
    sippCrystallised: 0,
    sippTaxFreeTaken,
  };
}


// ─── UK Defaults ───────────────────────────────────────────────
export const DEFAULTS = {
  p2CurrentAge: 33,
  p2RetirementAge: 63,
  p2LifeExpectancy: 92,
  p2StatePension: 11500,
  // Household
  inflationRate: 3.0,
  preRetReturn: 6.0,         // accumulation phase
  postRetReturn: 4.0,        // drawdown phase (conservative)
  // Lifestyle targets (annual, today's money)
  // Based on BBC/Pensions UK 2026 retirement standards:
  //   Minimum:  ~£25,000 (essential only)
  //   Moderate:  £32,700 single / £45,400 couple
  //   Comfortable: £45,400 single / £62,700 couple
  lowIncome: 25000,
  medIncome: 45400,
  highIncome: 62700,
};

// ─── Core Calculations ─────────────────────────────────────────

/**
 * Project portfolio value at a given future year.
 * Accounts for monthly contributions and compound growth.
 */
export function projectPortfolioValue(assets, annualRate, years, monthlyContrib) {
  const r = annualRate / 100;
  const pv = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
  const pmt = (monthlyContrib || 0) * 12;
  if (r === 0) return pv + pmt * years;
  return pv * Math.pow(1 + r, years) + pmt * ((Math.pow(1 + r, years) - 1) / r);
}

/**
 * Calculate total monthly contributions from all assets.
 */
export function totalMonthlyContributions(assets) {
  return assets.reduce((s, a) => s + (a.monthlyAdd || 0), 0);
}

/**
 * Run a year-by-year drawdown simulation.
 * Returns array of { year, age1, age2, withdrawal, portfolioValue, statePension1, statePension2 }
 *
 * Withdrawals are inflation-adjusted each year.
 * State pensions start at respective retirement ages.
 */
export function runDrawdownSimulation(params) {
  const {
    assets,
    p1CurrentAge, p1RetirementAge, p1LifeExpectancy, p1StatePension, p1StatePensionAge,
    p2CurrentAge, p2RetirementAge, p2LifeExpectancy, p2StatePension, p2StatePensionAge,
    inflationRate, preRetReturn, postRetReturn,
    targetAnnualIncome,
    accounts,
  } = params;

  const monthlyContrib = totalMonthlyContributions(assets);
  const maxAge = Math.max(p1LifeExpectancy, p2LifeExpectancy);
  const yearsToSimulate = maxAge - Math.min(p1CurrentAge, p2CurrentAge);
  const yearsToRetirement = Math.max(0, p1RetirementAge - p1CurrentAge);

  const preRetR = preRetReturn / 100;
  const postRetR = postRetReturn / 100;
  const inf = inflationRate / 100;
  const results = [];

  // Start with current portfolio value — initialise SIPP sub-pots
  let accountValues = (accounts || []).map(a => {
    const acc = { ...a };
    if (acc.name === 'SIPP') {
      // SIPP starts fully uncrystallised
      acc.uncrystallised = acc.value || 0;
      acc.crystallised = 0;
    }
    return acc;
  });
  let portfolio = accountValues.reduce((s, a) => s + (a.value || 0), 0);

  for (let i = 0; i <= yearsToSimulate; i++) {
    const currentAge1 = p1CurrentAge + i;
    const currentAge2 = p2CurrentAge + i;
    const year = new Date().getFullYear() + i;
    const isRetired = currentAge1 >= p1RetirementAge;

    if (!isRetired) {
      // ── Pre-retirement: accumulate ──
      // Grow all accounts at pre-retirement rate, add monthly contributions
      const annualContrib = monthlyContrib * 12;
      for (const acc of accountValues) {
        if (acc.name === 'SIPP') {
          acc.uncrystallised = (acc.uncrystallised || 0) * (1 + preRetR);
          acc.value = acc.uncrystallised;
        } else if (acc.name === 'Cash') {
          // Cash earns 4% interest annually (not the general growth rate)
          acc.value = (acc.value || 0) * (1 + 0.04);
        } else {
          acc.value = (acc.value || 0) * (1 + preRetR);
        }
      }
      
      // Calculate tax on cash interest for the year (taxable every year)
      let cashInterestTax = 0;
      for (const acc of accountValues) {
        if (acc.name === 'Cash') {
          const interest = (acc.value || 0) * 0.04;
          const ownerIncome = acc.owner === 'p1' ? 0 : acc.owner === 'p2' ? 0 : 0; // No other income pre-retirement
          const cashTax = calcSavingsTax(interest, ownerIncome);
          cashInterestTax += cashTax.tax;
        }
      }
      
      portfolio = accountValues.reduce((s, a) => s + (a.value || 0), 0) + annualContrib - cashInterestTax;

      const sippAccounts = accountValues.filter(a => a.name === 'SIPP');
      const sippUncrystallised = sippAccounts.reduce((s, a) => s + (a.uncrystallised || 0), 0);
      const sippCrystallised = sippAccounts.reduce((s, a) => s + (a.crystallised || 0), 0);

      // Get all account values
      const isaVal = accountValues.filter(a => a.name === 'ISA').reduce((s, a) => s + (a.value || 0), 0);
      const giaVal = accountValues.filter(a => a.name === 'GIA').reduce((s, a) => s + (a.value || 0), 0);
      const cashVal = accountValues.filter(a => a.name === 'Cash').reduce((s, a) => s + (a.value || 0), 0);
      const sippVal = sippAccounts.reduce((s, a) => s + (a.value || 0), 0);

      results.push({
        year, age1: currentAge1, age2: currentAge2,
        grossWithdrawal: 0, statePension: 0,
        netFromPortfolio: 0, taxOnWithdrawal: cashInterestTax,
        taxBreakdown: { isa: 0, sipp: 0, gia: 0, cash: cashInterestTax },
        effectiveTaxRate: 0, grossPortfolioWithdrawal: 0,
        portfolioValue: Math.max(0, portfolio),
        depleted: false,
        isaValue: isaVal,
        sippValue: sippVal,
        giaValue: giaVal,
        cashValue: cashVal,
      });
    } else {
      // ── Retirement: drawdown ──
      // Years since retirement (for inflation compounding on withdrawal)
      const yearsSinceRet = i - yearsToRetirement;
      const grossWithdrawal = targetAnnualIncome * Math.pow(1 + inf, yearsSinceRet);

      // State pensions start at each person's state pension age (separate from retirement age)
      const sp1 = currentAge1 >= (p1StatePensionAge || p1RetirementAge)
        ? p1StatePension * Math.pow(1 + inf, yearsSinceRet) : 0;
      const sp2 = currentAge2 >= (p2StatePensionAge || p2RetirementAge)
        ? p2StatePension * Math.pow(1 + inf, yearsSinceRet) : 0;
      const totalSP = sp1 + sp2;

      // Net withdrawal needed from portfolio (after state pension)
      const netFromPortfolio = Math.max(0, grossWithdrawal - totalSP);

      // Calculate tax on the portfolio withdrawal FIRST (this modifies acc.uncrystallised for SIPP)
      const taxResult = accounts && accounts.length > 0
        ? calcAfterTaxWithdrawal(netFromPortfolio, accountValues, sp1, sp2, currentAge1, currentAge2)
        : { afterTax: netFromPortfolio, tax: 0, taxBreakdown: {}, effectiveRate: 0, drawnAccounts: [], sippTaxFreeTaken: 0 }

      console.log('[DEBUG] Before growth: year=' + year + ' age=' + currentAge1 + ' sippUnc=' + accountValues.filter(a=>a.name==='SIPP').reduce((s,a)=>s+(a.uncrystallised||0),0) + ' portfolio=' + portfolio);
      
      // Apply growth to all accounts AFTER withdrawal
      for (const acc of accountValues) {
        if (acc.name === 'SIPP') {
          acc.uncrystallised = (acc.uncrystallised || 0) * (1 + postRetR);
          acc.value = acc.uncrystallised;
        } else if (acc.name === 'Cash') {
          // Cash earns 4% interest, but interest is taxable
          const interest = (acc.value || 0) * 0.04;
          acc.value = (acc.value || 0) + interest;
        } else {
          acc.value = (acc.value || 0) * (1 + postRetR);
        }
      };

      console.log('[DEBUG] After growth: year=' + year + ' age=' + currentAge1 + ' sippUnc=' + accountValues.filter(a=>a.name==='SIPP').reduce((s,a)=>s+(a.uncrystallised||0),0) + ' tax=' + taxResult.tax + ' sippTaxFree=' + taxResult.sippTaxFreeTaken);
      
      // Gross up: if tax is due, we need to withdraw more to cover it
      const grossPortfolioWithdrawal = taxResult.tax > 0
        ? netFromPortfolio + taxResult.tax
        : netFromPortfolio;

      // Subtract withdrawal from non-SIPP drawn accounts
      const drawn = taxResult.drawnAccounts || [];
      for (const acc of drawn) {
        if (acc.name !== 'SIPP') {
          const totalDrawnVal = drawn.filter(a => a.name !== 'SIPP').reduce((s, a) => s + (a.value || 0), 0);
          if (totalDrawnVal > 0) {
            const proportion = (acc.value || 0) / totalDrawnVal;
            const withdrawalFromAcc = netFromPortfolio * proportion;
            acc.value = Math.max(0, (acc.value || 0) - withdrawalFromAcc);
          }
        }
      }

      // Recalculate SIPP value after withdrawal (uncrystallised was modified by calcAfterTaxWithdrawal)
      for (const acc of accountValues) {
        if (acc.name === 'SIPP') {
          acc.value = acc.uncrystallised || 0;
        }
      }

      // Calculate tax on cash interest for the year
      let cashInterestTax = 0;
      for (const acc of accountValues) {
        if (acc.name === 'Cash') {
          const interest = (acc.value || 0) * 0.04;
          const ownerIncome = acc.owner === 'p1' ? sp1 : acc.owner === 'p2' ? sp2 : sp1 + sp2;
          const cashTax = calcSavingsTax(interest, ownerIncome);
          cashInterestTax += cashTax.tax;
          console.log('[CASH] year=' + year + ' cashValue=' + acc.value + ' interest=' + interest + ' ownerIncome=' + ownerIncome + ' tax=' + cashTax.tax);
        }
      }
      
      // Deduct cash interest tax from portfolio
      portfolio = accountValues.reduce((s, a) => s + (a.value || 0), 0) - cashInterestTax;

      // Get all account values for display
      const isaVal = accountValues.filter(a => a.name === 'ISA').reduce((s, a) => s + (a.value || 0), 0);
      const giaVal = accountValues.filter(a => a.name === 'GIA').reduce((s, a) => s + (a.value || 0), 0);
      const cashVal = accountValues.filter(a => a.name === 'Cash').reduce((s, a) => s + (a.value || 0), 0);
      const sippVal = accountValues.filter(a => a.name === 'SIPP').reduce((s, a) => s + (a.value || 0), 0);

      // Total tax includes both withdrawal tax and cash interest tax
      const totalTax = taxResult.tax + cashInterestTax;
      const combinedTaxBreakdown = { ...taxResult.taxBreakdown, cash: (taxResult.taxBreakdown.cash || 0) + cashInterestTax };
      
      results.push({
        year, age1: currentAge1, age2: currentAge2,
        grossWithdrawal, statePension: totalSP,
        netFromPortfolio,
        taxOnWithdrawal: totalTax,
        taxBreakdown: combinedTaxBreakdown,
        effectiveTaxRate: totalTax > 0 ? (totalTax / grossWithdrawal) * 100 : 0,
        grossPortfolioWithdrawal,
        portfolioValue: Math.max(0, portfolio),
        depleted: portfolio <= 0,
        isaValue: isaVal,
        sippValue: sippVal,
        giaValue: giaVal,
        cashValue: cashVal,
      });

      if (portfolio <= 0) break;
    }
  }

  return results;
}

/**
 * Calculate the safe withdrawal rate for a given portfolio and target.
 */
export function safeWithdrawalRate(portfolioValue, annualWithdrawal) {
  if (portfolioValue <= 0) return 0;
  return (annualWithdrawal / portfolioValue) * 100;
}

/**
 * Find the maximum sustainable annual income (binary search).
 */
export function findMaxSustainableIncome(params, tolerance = 100) {
  let low = 0;
  let high = params.targetAnnualIncome * 3;
  const maxIterations = 50;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const testParams = { ...params, targetAnnualIncome: mid };
    const sim = runDrawdownSimulation(testParams);
    const depleted = sim.some(s => s.depleted);

    if (depleted) {
      high = mid;
    } else {
      low = mid;
    }

    if (high - low < tolerance) break;
  }

  return Math.floor(low);
}

/**
 * Calculate lifestyle scenarios (low/med/high) with shortfall/surplus.
 */
export function calculateLifestyleScenarios(params) {
  const { householdExpenses, lowIncome, medIncome, highIncome } = params;
  const low = lowIncome ?? householdExpenses?.low ?? 0;
  const med = medIncome ?? householdExpenses?.med ?? 0;
  const high = highIncome ?? householdExpenses?.high ?? 0;

  const scenarios = ['low', 'med', 'high'].map((level) => {
    const target = level === 'low' ? low : level === 'med' ? med : high;
    const sim = runDrawdownSimulation({ ...params, targetAnnualIncome: target });
    const depleted = sim.find(s => s.depleted);
    const yearsLasted = depleted ? depleted.age1 - params.p1CurrentAge : params.p1LifeExpectancy - params.p1CurrentAge;
    // Use actual portfolio value at retirement from simulation
    const retRow = sim.find(s => s.age1 >= params.p1RetirementAge);
    const portfolioAtRetirement = retRow ? retRow.portfolioValue : 0;
    const swr = safeWithdrawalRate(portfolioAtRetirement, target);
    // First year after-tax income = state pension + net withdrawal - tax
    const firstRetYear = sim.find(s => s.age1 >= params.p1RetirementAge);
    const afterTaxIncome = firstRetYear
      ? firstRetYear.statePension + firstRetYear.netFromPortfolio - firstRetYear.taxOnWithdrawal
      : 0;
    // Income gap = difference between target and after-tax income
    const incomeGap = target - afterTaxIncome;

    return {
      level,
      target,
      afterTaxIncome,
      incomeGap,
      yearsLasted,
      depleted: !!depleted,
      depletedAge: depleted ? depleted.age1 : null,
      portfolioAtRetirement,
      swr,
      affordable: !depleted,
    };
  });

  return scenarios;
}

/**
 * Generate data for the drawdown chart.
 * Returns { labels, portfolioData, withdrawalData, pensionData, retirementYear }
 */
export function generateDrawdownChartData(params) {
  const sim = runDrawdownSimulation(params);
  const labels = sim.map(s => s.year.toString());
  const portfolioData = sim.map(s => s.portfolioValue);
  const withdrawalData = sim.map(s => s.grossWithdrawal);
  const pensionData = sim.map(s => s.statePension);
  const taxData = sim.map(s => s.taxOnWithdrawal || 0);

  // Find the calendar year when P1 reaches retirement age (for chart annotation)
  const retSim = sim.find(s => s.age1 >= params.p1RetirementAge);
  const retirementYear = retSim ? retSim.year : sim[0]?.year;

  return { labels, portfolioData, withdrawalData, pensionData, taxData, retirementYear, sim };
}
