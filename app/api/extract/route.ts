export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { extractTextFromDocument } from "@/lib/vision/ocr";
import { privacyFirewall } from "@/lib/privacy/firewall";

const extractFinancials = (text: string) => {
  const findValue = (keywords: string[]): number | null => {
    const joinedKeywords = keywords.join("|");
    const regex = new RegExp(
      `(${joinedKeywords}).{0,30}?([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?)`,
      "i"
    );

    const match = text.match(regex);
    if (match && match[2]) {
      return parseFloat(match[2].replace(/,/g, ""));
    }
    return null;
  };

  return {
    monthlyIncome: findValue([
      "Monthly Salary",
      "Total Income",
      "Gross Pay",
      "Gross Salary",
    ]),
    basicSalary: findValue(["Basic Salary", "Basic Pay"]),
    netSalary: findValue(["Net Salary", "Net Pay"]),
    housingAllowance: findValue([
      "Housing Allowance",
      "Accommodation",
      "Allowances",
    ]),
    currentRent: findValue(["Rent", "Housing Rent", "Lease"]),
  };
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractTextFromDocument(buffer, file.type);

    if (!rawText || rawText.length < 5) {
      return NextResponse.json(
        { error: "Unreadable document" },
        { status: 400 }
      );
    }

    // 🔒 PRIVACY FIREWALL — raw OCR text STOPS here
    const { safeText, audit } = privacyFirewall(rawText);

    console.info("PRIVACY_FIREWALL", audit);

    // Only sanitized text is allowed beyond this point
    const extractedData = extractFinancials(safeText);

    if (!extractedData.monthlyIncome && extractedData.basicSalary) {
      extractedData.monthlyIncome =
        (extractedData.basicSalary || 0) +
        (extractedData.housingAllowance || 0);
    }

    return NextResponse.json({
      success: true,
      extractedData: {
        ...extractedData,
        uploaded: true,
      },
      privacyAudit: audit,
    });
  } catch (err) {
    console.error("Extraction Error:", err);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
