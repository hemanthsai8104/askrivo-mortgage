// lib/privacy/piiDetector.ts
/**
 * Helper / exploratory utility.
 * NOT used in the active privacy firewall path.
 */

export type PIIMatch = {
  type: "EMAIL" | "PHONE" | "IBAN";
  value: string;
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[\s-]?)?\d{9,12}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  const extract = (regex: RegExp, type: PIIMatch["type"]) => {
    const found = text.match(regex);
    if (found) {
      found.forEach(value => matches.push({ type, value }));
    }
  };

  extract(EMAIL_REGEX, "EMAIL");
  extract(PHONE_REGEX, "PHONE");
  extract(IBAN_REGEX, "IBAN");

  return matches;
}
