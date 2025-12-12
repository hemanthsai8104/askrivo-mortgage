// app/api/ai/route.ts (added safe fallback when the model refuses)
import { NextResponse } from "next/server";
import { z } from "zod";

const OPENROUTER_URL =
  process.env.OPENROUTER_URL ?? "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemma-7b-it";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const BASE_URL =
  process.env.BASE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function extractJSON(text: string): any | null {
  if (!text || typeof text !== "string") return null;
  let t = text.trim();
  if (t.startsWith("```")) {
    const lastFence = t.lastIndexOf("```");
    if (lastFence > 2) t = t.slice(3, lastFence).trim();
  }
  if (t.startsWith("`") && t.endsWith("`")) t = t.slice(1, -1).trim();
  if (t.startsWith("{") && t.endsWith("}")) {
    try { return JSON.parse(t); } catch {}
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(t.slice(first, last + 1)); } catch { return null; }
}

const ModelCalcSchema = z.object({
  action: z.literal("calculate"),
  propertyPrice: z.union([z.number(), z.string()]).transform((v) =>
    Number(String(v).replace(/,/g, ""))
  ),
  downPayment: z.optional(z.any()),
  years: z.optional(z.union([z.number(), z.string()])),
});

const SYSTEM_PROMPT = `
You are AskRivo, an AI assistant for UAE real-estate mortgages.

ABSOLUTE RULES:
1) NEVER compute EMI, loan amounts, interest, totals, or hidden fees yourself.
2) If the user requires numeric calculations, output EXACTLY ONE JSON object:

{"action":"calculate","propertyPrice":<number>,"downPayment":<number|null>,"years":<number|null>}

3) If the user only wants explanation or conversation, reply in plain text.
`;

async function callOpenRouter(messages: ChatMsg[]) {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not configured");

  const body = JSON.stringify({
    model: MODEL,
    messages,
    temperature: 0.2,
    max_tokens: 800,
  });

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        },
        body,
      }, 8000);

      const t = await res.text();
      let j: any = null;
      try {
        j = JSON.parse(t);
      } catch {
        if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${t}`);
        return t;
      }

      if (!res.ok) {
        const err = new Error(`OpenRouter API error ${res.status}`);
        (err as any).details = j;
        throw err;
      }

      const choice = j?.choices?.[0];
      const content =
        choice?.message?.content ??
        choice?.delta?.content ??
        choice?.message ??
        null;

      if (typeof content === "string") return content;
      return JSON.stringify(content);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------
   Fallback extractor: if the LLM refuses, parse the user's text
   for price (AED), percentage down, and tenure (years).
   This is intentionally simple and conservative.
-------------------------------------------------------------------*/
function fallbackExtractFromText(text: string) {
  const out: { propertyPrice: number | null; downPayment: string | number | null; years: number | null } = {
    propertyPrice: null,
    downPayment: null,
    years: null,
  };

  if (!text || typeof text !== "string") return out;
  const t = text.replace(/₹|,|\s+/g, (m) => (m === ',' ? '' : ' ')).trim();

  // Price in AED or numbers — look for patterns like "2,000,000 AED" or "2000000"
  // Try to capture the largest number as price
  const numMatches = Array.from(t.matchAll(/(\d{1,3}(?:[,\d]{2,})|\d{4,})/g)).map(m => m[0].replace(/,/g, ""));
  if (numMatches.length) {
    // choose the largest numeric value as property price (heuristic)
    const nums = numMatches.map(s => Number(s)).filter(n => Number.isFinite(n));
    if (nums.length) {
      const max = Math.max(...nums);
      if (max >= 1000) out.propertyPrice = Math.round(max);
    }
  }

  // Percent down: "20%" or "15 percent"
  const pctMatch = t.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct)) out.downPayment = `${pct}%`;
  } else {
    const pctWords = t.match(/(\d{1,2}(?:\.\d+)?)\s*(percent|per cent)/i);
    if (pctWords) {
      const pct = Number(pctWords[1]);
      if (Number.isFinite(pct)) out.downPayment = `${pct}%`;
    }
  }

  // Tenure years: "in 25 years" or "25 years"
  const yearsMatch = t.match(/(\d{1,2})\s*(years|year)/i);
  if (yearsMatch) {
    const y = Number(yearsMatch[1]);
    if (Number.isFinite(y)) out.years = Math.max(1, Math.min(25, Math.round(y)));
  }

  return out;
}

export async function POST(req: Request) {
  try {
    if (!OPENROUTER_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message ?? "").trim();
    if (!userMessage) {
      return NextResponse.json({ ok: false, error: "No message provided" }, { status: 400 });
    }

    const firstMessages: ChatMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];

    let firstReply: string;
    try {
      firstReply = await callOpenRouter(firstMessages);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: `OpenRouter Error: ${String(err?.message ?? err)}` }, { status: 502 });
    }

    // Try to extract model-provided JSON
    const parsedCandidate = extractJSON(firstReply);
    let parsed = null;
    if (parsedCandidate) {
      try {
        parsed = ModelCalcSchema.parse(parsedCandidate);
      } catch {
        parsed = null;
      }
    }

    // If model didn't return JSON but also returned a refusal, attempt deterministic fallback
    if (!parsed) {
      // Simple refusal detection heuristics
      const refusalPhrases = [
        "cannot provide financial",
        "cannot provide calculations",
        "cannot provide advice",
        "cannot help with financial",
        "not allowed to provide",
        "I cannot provide financial",
      ];
      const lower = (firstReply || "").toLowerCase();
      const refused = refusalPhrases.some(p => lower.includes(p));

      if (refused) {
        // Attempt to extract from the original user message (safer and conservative)
        const fallback = fallbackExtractFromText(userMessage);

        if (fallback.propertyPrice) {
          // Construct parsed object in the same shape as ModelCalcSchema expects
          parsed = {
            action: "calculate",
            propertyPrice: fallback.propertyPrice,
            downPayment: fallback.downPayment, // note: this may be "20%" or an AED number
            years: fallback.years,
          };
        }
      }
    }

    // If parsed and action=calculate, proceed to call internal deterministic calculator
    if (parsed && parsed.action === "calculate" && parsed.propertyPrice) {
      const propertyPrice = Number(parsed.propertyPrice);
      if (!Number.isFinite(propertyPrice) || propertyPrice <= 0) {
        return NextResponse.json({ ok: false, error: "Invalid propertyPrice" }, { status: 400 });
      }

      const dp = parsed.downPayment ?? null;
      const yrs = parsed.years ?? null;

      const requestId = typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `r-${Date.now()}`;

      let toolResult: any = null;
      try {
        const internalRes = await fetchWithTimeout(`${BASE_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(INTERNAL_API_KEY ? { "x-internal-key": INTERNAL_API_KEY } : {}),
          },
          body: JSON.stringify({
            payload: { propertyPrice, downPayment: dp, years: yrs },
            meta: { requestId, source: "ai-route-fallback" },
          }),
        }, 5000);

        const internalJson = await internalRes.json().catch(() => null);
        if (!internalRes.ok || internalJson == null) {
          return NextResponse.json({
            ok: false,
            error: "Internal calculation endpoint failed",
            tool: { name: "calculateMortgage", arguments: { propertyPrice, dp, yrs }, status: internalRes.status, result: internalJson },
          }, { status: 502 });
        }

        toolResult = internalJson.result ?? internalJson;

        const okNumeric =
          toolResult &&
          Number.isFinite(Number(toolResult.loanAmount)) &&
          Number.isFinite(Number(toolResult.monthlyEMI)) &&
          Number.isFinite(Number(toolResult.totalEMIPayable));
        if (!okNumeric) {
          return NextResponse.json({
            ok: false,
            error: "Internal tool returned invalid numeric results",
            tool: { name: "calculateMortgage", arguments: { propertyPrice, dp, yrs }, result: toolResult },
          }, { status: 502 });
        }

        if (!Number.isFinite(Number(toolResult.hiddenFees))) {
          toolResult.hiddenFees = Math.round(propertyPrice * 0.07);
          toolResult.warnings = (toolResult.warnings || []).concat([`hiddenFees inferred as 7% of price`]);
        }
      } catch (e: any) {
        return NextResponse.json({
          ok: false,
          error: "Internal calculation exception",
          tool: { name: "calculateMortgage", arguments: { propertyPrice, dp, yrs }, result: { error: String(e?.message ?? e) } },
        }, { status: 502 });
      }

      // Ask the model to compose a short human-friendly reply using TOOL_RESULT.
      const followupSystem = `
You are AskRivo. DO NOT perform any math.
Use TOOL_RESULT exactly.

TOOL_RESULT = ${JSON.stringify(toolResult)}

Write a short human-friendly reply:
- must begin with "Numbers computed by the calculator tool."
- must reference loanAmount, monthlyEMI, totalEMIPayable, hiddenFees
- include warnings if present
Plain text only.
`;

      const followupMessages: ChatMsg[] = [
        { role: "system", content: followupSystem },
        { role: "user", content: userMessage },
      ];

      let finalAssistantText: string | null = null;
      try {
        finalAssistantText = await callOpenRouter(followupMessages);
      } catch {
        finalAssistantText = null;
      }

      // Return canonical tool JSON plus optional composed text (may be null if model refused)
      return NextResponse.json({
        ok: true,
        modelResponse: finalAssistantText,
        tool: { name: "calculateMortgage", arguments: { propertyPrice, downPayment: dp, years: yrs }, result: toolResult },
      }, { status: 200 });
    }

    // If not a calculation, just return the model's original reply
    return NextResponse.json({ ok: true, modelResponse: firstReply, tool: null }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
