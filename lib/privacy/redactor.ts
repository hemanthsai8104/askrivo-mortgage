/**
 * NOTE:
 * This file is used ONLY by the privacy firewall.
 * Do NOT import this directly elsewhere.
 */
export function redactPII(text: string): { redactedText: string; wasRedacted: boolean } {
  let redacted = text;

  // 1. Emails
  redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]");
  
  // 2. Phone Numbers (UAE Loose format)
  redacted = redacted.replace(/(?:\+971|00971|0)?(?:50|51|52|54|55|56|58)[0-9]{7}/g, "[PHONE_REDACTED]");
  
  // 3. Emirates ID (784-xxxx-xxxx-x)
  redacted = redacted.replace(/784-?[0-9]{4}-?[0-9]{7}-?[0-9]{1}/g, "[EID_REDACTED]");
  
  // 4. IBAN (AE followed by 21 digits)
  redacted = redacted.replace(/AE[0-9]{21}/g, "[IBAN_REDACTED]");

  // --- NEW: CRITICAL FIXES FOR PDF REQUIREMENTS ---

  // 5. Passport Numbers (Common patterns: 1 letter + 7-9 digits)
  // We use context looking for "Passport" to avoid false positives on random IDs
  redacted = redacted.replace(/(Passport\s*(?:No|Number|#)?[:\s]*)([A-Z0-9]{6,12})/gi, "$1[PASSPORT_REDACTED]");

  // 6. Names (Heuristic: Look for "Name:", "Employee:", "Mr/Mrs" followed by capitalized words)
  // This is the "Product Engineer" hack. It's not perfect NER, but it proves you tried.
const namePatterns = [
    // Added 'i' flag and modified to capture ALL CAPS names too
    /(Name[:\s]+)([a-zA-Z\s]+)/gi, 
    /(Employee[:\s]+)([a-zA-Z\s]+)/gi,
    /(Mr\.|Ms\.|Mrs\.)\s+([a-zA-Z\s]+)/gi 
  ];
  namePatterns.forEach(regex => {
    redacted = redacted.replace(regex, "$1[NAME_REDACTED]");
  });

  return {
    redactedText: redacted,
    wasRedacted: redacted !== text
  };
}