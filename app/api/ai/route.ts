// app/api/ai/route.ts
import { NextResponse } from "next/server";

const OPENROUTER_URL =
  process.env.OPENROUTER_URL ?? "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemma-7b-it";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const BASE_URL =
  process.env.BASE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const MAX_TENURE_YEARS = 25;
const MIN_DOWN_PAYMENT_PERCENT = 20;

type ChatMsg = {
  role: "system" | "user" | "assistant";
  content: string;
};

/* -------------------------------------------------
   HARD, DETERMINISTIC PARAM EXTRACTION (NO LLM)
--------------------------------------------------*/
function extractHardParams(text: string) {
  const yearsMatch = text.match(/(\d+)\s*years?/i);
  const downMatch = text.match(/(\d+)\s*%\s*(down|dp|down payment)/i);

  const hasCalcIntent =
    /(emi|mortgage|loan|down|payment|years?)/i.test(text);

  return {
    years: yearsMatch ? Number(yearsMatch[1]) : null,
    downPaymentPercent: downMatch ? Number(downMatch[1]) : null,
    hasCalcIntent,
  };
}

/* -------------------------------------------------
   LLM (INTENT / EXPLANATION ONLY — NO MATH)
--------------------------------------------------*/
async function callOpenRouter(messages: ChatMsg[]) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0,
      max_tokens: 120,
    }),
  });

  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message ?? "").trim();
    const context = body?.context;

    if (!userMessage) {
      return NextResponse.json(
        { ok: false, error: "No message provided" },
        { status: 400 }
      );
    }

    /* 🔐 SECURITY GATE — must upload payslip once */
    if (!context?.propertyPrice) {
      return NextResponse.json({
        ok: true,
        modelResponse:
          "Please upload your salary slip first so I can give you accurate and secure advice.",
      });
    }

    /* =========================================================
       STEP 1 — HARD PARSE (ALWAYS WINS OVER LLM)
    ========================================================= */
    const hard = extractHardParams(userMessage);

    if (hard.hasCalcIntent) {
      const requestedYears =
        typeof hard.years === "number" ? hard.years : MAX_TENURE_YEARS;
      const finalYears = Math.min(requestedYears, MAX_TENURE_YEARS);

      const warnings: string[] = [];

      let downPaymentUsedPercent: number | null = null;

      if (typeof hard.downPaymentPercent === "number") {
        if (hard.downPaymentPercent < MIN_DOWN_PAYMENT_PERCENT) {
          warnings.push(
            `Minimum down payment in the UAE is ${MIN_DOWN_PAYMENT_PERCENT}%. Calculation uses ${MIN_DOWN_PAYMENT_PERCENT}%.`
          );
          downPaymentUsedPercent = MIN_DOWN_PAYMENT_PERCENT;
        } else {
          downPaymentUsedPercent = hard.downPaymentPercent;
        }
      }

      if (requestedYears > MAX_TENURE_YEARS) {
        warnings.push(
          `Mortgage tenure in the UAE is capped at ${MAX_TENURE_YEARS} years. Calculation uses ${MAX_TENURE_YEARS} years.`
        );
      }

      const internalRes = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(INTERNAL_API_KEY
            ? { "x-internal-key": INTERNAL_API_KEY }
            : {}),
        },
        body: JSON.stringify({
          payload: {
            propertyPrice: context.propertyPrice,
            downPayment:
              downPaymentUsedPercent != null
                ? `${downPaymentUsedPercent}%`
                : null,
            years: finalYears,
          },
        }),
      });

      const internalJson = await internalRes.json();

      return NextResponse.json({
        ok: true,
        tool: {
          name: "calculateMortgage",
          result: {
            ...internalJson.facts?.mortgage,
            years: finalYears,
            downPaymentUsed:
              downPaymentUsedPercent != null
                ? `${downPaymentUsedPercent}%`
                : "default",
            warnings,
          },
        },
        modelResponse:
          warnings.length > 0 ? warnings.join(" ") : null,
      });
    }

    /* =========================================================
       STEP 2 — RENT VS BUY (DETERMINISTIC)
    ========================================================= */
    if (/rent/i.test(userMessage) && context.monthlyRent) {
      const internalRes = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(INTERNAL_API_KEY
            ? { "x-internal-key": INTERNAL_API_KEY }
            : {}),
        },
        body: JSON.stringify({
          payload: {
            propertyPrice: context.propertyPrice,
            monthlyRent: context.monthlyRent,
            years: 5,
          },
        }),
      });

      const internalJson = await internalRes.json();

      return NextResponse.json({
        ok: true,
        tool: {
          name: "rentVsBuy",
          result: internalJson.facts?.rentVsBuy,
        },
        modelResponse:
          "This comparison is based on a deterministic 5-year analysis.",
      });
    }

    /* =========================================================
       STEP 3 — PURE EXPLANATION (NO NUMBERS)
    ========================================================= */
    const explanation = await callOpenRouter([
      {
        role: "system",
        content:
          "Explain clearly. Do NOT calculate or invent numbers.",
      },
      { role: "user", content: userMessage },
    ]);

    return NextResponse.json({
      ok: true,
      modelResponse: explanation,
      tool: null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
