// lib/orchestration/conversationState.ts
export enum ConversationStage {
  DISCOVERY = "DISCOVERY",
  ANALYSIS = "ANALYSIS",
  COMPARISON = "COMPARISON",
  CONVICTION = "CONVICTION",
  SOFT_CLOSE = "SOFT_CLOSE",
  LEAD_COLLECTED = "LEAD_COLLECTED", // NEW: The End State
}