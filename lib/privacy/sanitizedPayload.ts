// lib/privacy/sanitizedPayload.ts

/**
 * Helper / exploratory utility.
 * NOT used in the active privacy firewall path.
 */


export type SanitizedFinancialPayload = {
  monthlySalary: number | null;
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  netSalary: number | null;
};

function extract(label: string, text: string): number | null {
  const match = text.match(
    new RegExp(`${label}\\s*:\\s*([\\d,]+)`, "i")
  );
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

export function sanitizeOCRText(
  rawText: string
): SanitizedFinancialPayload {
  return {
    monthlySalary: extract("Monthly Salary", rawText),
    basicSalary: extract("Basic Salary", rawText),
    allowances: extract("Allowances", rawText),
    deductions: extract("Deductions", rawText),
    netSalary: extract("Net Salary", rawText),
  };
}
