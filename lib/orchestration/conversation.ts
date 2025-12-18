// lib/orchestration/conversation.ts

export function analyzeUserSentiment(input: string): boolean {
  const msg = input.toLowerCase();
  // Signals that the user is moving forward
  const interestSignals = [
    "how", "can i", "process", "next", "agree", "wow", 
    "makes sense", "let's", "ready", "interested", "yes", "sure", "ok"
  ];
  return interestSignals.some(signal => msg.includes(signal));
}

export function shouldTriggerLeadCapture(
  sentiment: boolean, 
  decision: string, 
  messageLength: number,
  previousStage?: string
): boolean {
  // Fix: Don't trigger if we are already in the closing phase or finished
  if (previousStage === "SOFT_CLOSE" || previousStage === "LEAD_COLLECTED") return false;
  
  return sentiment && messageLength > 2;
}