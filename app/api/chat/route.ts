// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { calculateRentVsBuy } from "@/lib/rentVsBuy";
import { analyzeUserSentiment, shouldTriggerLeadCapture } from "@/lib/orchestration/conversation";
import { ConversationStage } from "@/lib/orchestration/conversationState";
import { SafeFinancialNumbers } from "@/lib/privacy/safeTypes";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const financials: SafeFinancialNumbers | null = body?.data?.financials ?? null;
    const currentUserMessage: string = body?.currentUserMessage ?? "";
    const previousStage = body?.stage || ConversationStage.DISCOVERY;

    if (!financials?.monthlyIncome) {
      return NextResponse.json({
        type: "QUESTION",
        message: "Don't worry about typing. Just upload your salary slip, and I'll run the numbers.",
      });
    }

    /* --- LISTENING LOGIC --- */
    const amountMatch = currentUserMessage.match(/(\d+[,.]?\d*)\s*(?:aed|dirhams|million|m)/i);
    let propertyPrice = financials.monthlyIncome * 60;
    
    if (amountMatch) {
      let extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (currentUserMessage.toLowerCase().includes('million') || currentUserMessage.toLowerCase().includes(' m')) {
        extractedAmount *= 1000000;
      }
      if (extractedAmount > 100000) propertyPrice = extractedAmount;
    }

    const mathResult = calculateRentVsBuy({
      monthlyRent: financials.currentRent || 10000,
      propertyPrice,
      yearsToStay: 5,
    });

    const isUserInterested = analyzeUserSentiment(currentUserMessage);
    
    // --- 🛑 ROBUST OBJECTION DETECTION ---
    const cleanMsg = currentUserMessage.toLowerCase().trim();
    const isExplicitNo = ["no", "not now", "dont", "stop", "nope", "never"].some(word => 
      cleanMsg === word || cleanMsg.startsWith(word + " ") || cleanMsg.includes(" " + word)
    );

    // --- STATE MACHINE ---

    // 1. OBJECTION PATH: Break the loop if they say "no"
    if (isExplicitNo) {
      return NextResponse.json({
        type: "RESULT",
        stage: ConversationStage.ANALYSIS,
        explanation: "Understood! No pressure at all. We can keep looking at the numbers. Would you like to adjust the property price or see how it looks over a 10-year stay instead?",
        nextAction: null,
        metrics: mathResult.metrics,
      });
    }

    // 2. SUCCESS PATH: User says YES
    if (previousStage === ConversationStage.SOFT_CLOSE && isUserInterested && !currentUserMessage.includes('re-calculate')) {
      return NextResponse.json({
        type: "SUCCESS",
        stage: ConversationStage.LEAD_COLLECTED,
        message: "Excellent choice. I've initiated your Pre-Approval. A mortgage specialist will contact you shortly to finalize the certificate. Anything else I can help you with?",
        nextAction: "END_CONVERSATION",
        metrics: mathResult.metrics,
      });
    }

    // 3. PITCH PATH: Initial Soft Close or repeated ask (only if they didn't say no)
    const triggerClose = shouldTriggerLeadCapture(isUserInterested, mathResult.decision, currentUserMessage.length, previousStage);

    if (triggerClose || (previousStage === ConversationStage.SOFT_CLOSE && !isExplicitNo)) {
       return NextResponse.json({
        type: "CLOSE",
        stage: ConversationStage.SOFT_CLOSE,
        decision: mathResult.decision,
        message: `${mathResult.narrative}\n\nShall I generate your Pre-Approval Certificate now?`,
        nextAction: "LEAD_CAPTURE",
        metrics: mathResult.metrics,
      });
    }

    // 4. DEFAULT PATH: General Analysis
    return NextResponse.json({
      type: "RESULT",
      stage: isUserInterested ? ConversationStage.CONVICTION : ConversationStage.ANALYSIS,
      explanation: mathResult.narrative,
      decision: mathResult.decision,
      metrics: mathResult.metrics,
      nextAction: isUserInterested ? "SOFT_PROMPT" : null,
    });

  } catch (error) {
    console.error("Chat Route Error:", error);
    return NextResponse.json({ type: "ERROR", message: "System failure" }, { status: 500 });
  }
}