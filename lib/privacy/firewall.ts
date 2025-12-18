// lib/privacy/firewall.ts

import { redactPII } from "./redactor";

/**
 * PRIVACY FIREWALL
 * This is the ONLY allowed boundary between OCR text and the rest of the system.
 * Raw OCR text must NEVER go past this file.
 */
export function privacyFirewall(rawOCRText: string) {
  const { redactedText, wasRedacted } = redactPII(rawOCRText);

  return {
    safeText: redactedText,
    audit: {
      piiRemoved: wasRedacted,
      length: redactedText.length,
    },
  };
}
