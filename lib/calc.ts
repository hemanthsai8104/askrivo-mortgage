// lib/calc.ts
// Deterministic mortgage calculator used by the tool and AI orchestrator.
// Exports calculateMortgage(input) -> object with loanAmount, monthlyEMI, totalEMIPayable, hiddenFees, warnings

export type CalcInput = {
  price: number;
  downPayment?: number; // absolute AED (not percent). if undefined, caller should apply default 20%
  tenureYears?: number; // years (1..25). if undefined, default 25
  interestRatePct?: number; // annual percent (e.g., 4.5). default 4.5
  hiddenFeePercent?: number; // upfront percent (e.g., 7). default 7
};

export type CalcResult = {
  loanAmount: number; // AED integer
  monthlyEMI: number; // AED float (2 decimals)
  totalEMIPayable: number; // AED float (2 decimals)
  hiddenFees: number; // AED integer (7% approx)
  warnings?: string[]; // optional warnings about adjustments, assumptions etc.
};

/**
 * EMI formula (standard):
 * r = annualRatePct / 12 / 100
 * n = tenureYears * 12
 * EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *
 * Edge cases:
 * - If interestRatePct === 0 -> EMI = P / n
 *
 * Business rules enforced:
 * - Max LTV = 80% (loan <= 80% * price)
 * - Min down payment = price * 0.2 if downPayment not provided
 * - Max tenure = 25 years
 */
export function calculateMortgage(input: CalcInput): CalcResult {
  if (!input || typeof input.price !== "number" || !isFinite(input.price) || input.price <= 0) {
    throw new Error("Invalid input.price");
  }

  const warnings: string[] = [];

  // Defaults
  const DEFAULT_ANNUAL_RATE = 4.5; // percent
  const DEFAULT_HIDDEN_FEE_PERCENT = 7; // percent upfront
  const MIN_DOWN_PCT = 0.2; // 20%
  const MAX_LTV = 0.8; // 80%
  const MAX_TENURE = 25;

  const price = Math.round(input.price);
  let downPayment = input.downPayment == null ? Math.round(price * MIN_DOWN_PCT) : Math.round(input.downPayment);
  let tenureYears = input.tenureYears == null ? MAX_TENURE : Math.round(input.tenureYears);
  const annualRatePct = input.interestRatePct == null ? DEFAULT_ANNUAL_RATE : Number(input.interestRatePct);
  const hiddenFeePercent = input.hiddenFeePercent == null ? DEFAULT_HIDDEN_FEE_PERCENT : Number(input.hiddenFeePercent);

  // Enforce reasonable tenure bounds
  if (!Number.isFinite(tenureYears) || tenureYears < 1) tenureYears = 1;
  if (tenureYears > MAX_TENURE) {
    warnings.push(`Tenure capped to ${MAX_TENURE} years (requested ${input.tenureYears}).`);
    tenureYears = MAX_TENURE;
  }

  // Enforce minimum down payment
  const minDownPayment = Math.round(price * MIN_DOWN_PCT);
  if (downPayment < minDownPayment) {
    warnings.push(`Down payment increased to minimum ${MIN_DOWN_PCT * 100}% (${minDownPayment} AED).`);
    downPayment = minDownPayment;
  }
  if (downPayment > price) {
    warnings.push("Down payment exceeds property price; clamped to property price.");
    downPayment = price;
  }

  // Compute initial loanWanted and enforce LTV
  let loanWanted = Math.round(price - downPayment);
  const maxLoanAllowed = Math.round(price * MAX_LTV);
  let ltvAdjusted = false;
  if (loanWanted > maxLoanAllowed) {
    ltvAdjusted = true;
    const adjustedDown = price - maxLoanAllowed;
    warnings.push(`Loan limited to ${Math.round(MAX_LTV * 100)}% LTV. Down payment adjusted from ${downPayment} to ${adjustedDown}.`);
    downPayment = adjustedDown;
    loanWanted = maxLoanAllowed;
  }

  // Hidden fees (upfront): use hiddenFeePercent * price
  const hiddenFees = Math.round(price * (hiddenFeePercent / 100));

  // EMI calculation
  const P = loanWanted;
  const n = tenureYears * 12;
  const r = (Number(annualRatePct) || 0) / 12 / 100; // monthly rate (decimal)

  let monthlyEMI: number;
  if (r === 0) {
    monthlyEMI = P / n;
  } else {
    // calculate (1+r)^n carefully
    const pow = Math.pow(1 + r, n);
    monthlyEMI = (P * r * pow) / (pow - 1);
  }

  // Total payable over loan term
  const totalEMIPayable = monthlyEMI * n;

  // Round results: loanAmount integer, EMI 2 decimals, total 2 decimals
  const result: CalcResult = {
    loanAmount: Math.round(P),
    monthlyEMI: Math.round(monthlyEMI * 100) / 100,
    totalEMIPayable: Math.round(totalEMIPayable * 100) / 100,
    hiddenFees: Math.round(hiddenFees),
    warnings: warnings.length ? warnings : undefined,
  };

  // Additional helpful warnings if defaults used
  if (input.interestRatePct == null) {
    result.warnings = result.warnings ?? [];
    result.warnings.push(`Assumed interest rate ${DEFAULT_ANNUAL_RATE}% per annum.`);
  }
  if (input.hiddenFeePercent == null) {
    result.warnings = result.warnings ?? [];
    result.warnings.push(`Assumed upfront hidden fees ${DEFAULT_HIDDEN_FEE_PERCENT}% (transfer + agency + misc).`);
  }
  if (ltvAdjusted) {
    result.warnings = result.warnings ?? [];
    result.warnings.push("LTV adjusted to maximum allowed for expats (80%).");
  }

  return result;
}

export default calculateMortgage;
