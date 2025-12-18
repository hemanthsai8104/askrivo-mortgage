// lib/privacy/safeTypes.ts

/**
 * SAFE FINANCIAL PAYLOAD
 * This type is the ONLY thing allowed to reach the LLM layer.
 * No strings. No text. No PII. Numbers only.
 */
export type SafeFinancialNumbers = {
  monthlyIncome: number | null;
  basicSalary: number | null;
  netSalary: number | null;
  housingAllowance: number | null;
  currentRent: number | null;
};
