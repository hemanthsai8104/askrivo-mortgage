// app/api/chat/route.ts  (fixed version)
import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateMortgage } from "../../../lib/calc";

const DEFAULT_ANNUAL_RATE = 4.5; // per PDF
const DEFAULT_HIDDEN_FEE_PERCENT = 7; // 7% upfront costs

const CalculateSchema = z.object({
  propertyPrice: z.preprocess((v) => {
    if (typeof v === "string") return Number(v.replace(/,/g, ""));
    return v;
  }, z.number().min(1)),

  downPayment: z
    .optional(
      z.preprocess((v) => {
        if (v == null) return v;

        if (typeof v === "string") {
          const s = v.trim();

          // <-- FIX: detect percentages and return numeric % value
          if (s.endsWith("%")) {
            const pct = Number(s.slice(0, -1));
            return { percent: pct };
          }

          // number string
          return { amount: Number(s.replace(/,/g, "")) };
        }

        // numbers coming directly
        return { amount: Number(v) };
      }, z.object({
        percent: z.number().optional(),
        amount: z.number().optional()
      }))
    )
    .nullable(),

  years: z.optional(z.preprocess((v) => (v == null ? v : Number(v)), z.number().int().min(1).max(25))).nullable(),

  annualRatePercent: z.optional(z.preprocess((v) => (v == null ? v : Number(v)), z.number().positive())).nullable(),

  hiddenFeePercent: z.optional(z.preprocess((v) => (v == null ? v : Number(v)), z.number().nonnegative())).nullable(),
});

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";

export async function POST(req: Request) {
  try {
    const provided = req.headers.get("x-internal-key") ?? "";
    if (INTERNAL_KEY && provided !== INTERNAL_KEY) {
      return NextResponse.json(
        { ok: false, error: "Forbidden — invalid internal API key." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const payload = body?.payload ?? body;

    const parsed = CalculateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const price = Number(parsed.data.propertyPrice);

    // -------------------------
    // FIX: Normalize downPayment
    // -------------------------
    let downPaymentAED: number | undefined = undefined;

    if (parsed.data.downPayment) {
      const dp = parsed.data.downPayment;

      if (dp.percent != null) {
        // convert % → AED
        downPaymentAED = Math.round((dp.percent / 100) * price);
      } else if (dp.amount != null) {
        downPaymentAED = Math.round(dp.amount);
      }
    }

    // Apply defaults
    const interestRatePct = parsed.data.annualRatePercent ?? DEFAULT_ANNUAL_RATE;
    const hiddenFeePercent = parsed.data.hiddenFeePercent ?? DEFAULT_HIDDEN_FEE_PERCENT;
    const years = parsed.data.years ?? undefined;

    const calcInput = {
      price,
      downPayment: downPaymentAED,      // NOW ABSOLUTE AED ALWAYS
      tenureYears: years,
      interestRatePct,
      hiddenFeePercent,
    };

    let result: any;
    try {
      result = calculateMortgage(calcInput);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "Calculator error", details: String(e?.message ?? e) },
        { status: 500 }
      );
    }

    const valid =
      typeof result.loanAmount === "number" &&
      typeof result.monthlyEMI === "number" &&
      typeof result.totalEMIPayable === "number";

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid calculator output", result },
        { status: 502 }
      );
    }

    // ensure hidden fees exists
    if (typeof result.hiddenFees !== "number") {
      result.hiddenFees = Math.round(price * (hiddenFeePercent / 100));
      result.warnings = result.warnings || [];
      result.warnings.push(`hiddenFees inferred as ${hiddenFeePercent}% of price`);
    }

    const final = {
      loanAmount: Math.round(result.loanAmount),
      monthlyEMI: Math.round(result.monthlyEMI * 100) / 100,
      totalEMIPayable: Math.round(result.totalEMIPayable * 100) / 100,
      hiddenFees: Math.round(result.hiddenFees),
      warnings: result.warnings ?? [],
    };

    return NextResponse.json({ ok: true, result: final }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
