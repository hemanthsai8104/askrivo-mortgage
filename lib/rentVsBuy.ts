// lib/rentVsBuy.ts

export type RentVsBuyInput = {
  monthlyRent: number;
  propertyPrice: number;
  monthlyIncome?: number; 
  yearsToStay?: number; // Default this to 5 if undefined
};

export function calculateRentVsBuy(input: RentVsBuyInput) {
  const {
    monthlyRent,
    propertyPrice,
    yearsToStay = 5,
  } = input;

  // --- HARD CONSTRAINTS FROM DOC ---
  const INTEREST_RATE = 0.045; // 4.5%
  const MAINTENANCE_RATE = 0.01; // 1% (Standard approximation)
  const UPFRONT_FEES_PERCENT = 0.07; // 7% (The "Hidden Killer")

  // 1. Calculate Rent Burn (The Loss if they Rent)
  const totalRentLost = monthlyRent * 12 * yearsToStay;

  // 2. Calculate Buy Burn (The Unrecoverable Costs if they Buy)
  const loanAmount = propertyPrice * 0.8;
  const annualInterest = loanAmount * INTEREST_RATE;
  const annualMaintenance = propertyPrice * MAINTENANCE_RATE;
  
  const totalBuyUnrecoverable = (annualInterest + annualMaintenance) * yearsToStay;
  const upfrontCost = propertyPrice * UPFRONT_FEES_PERCENT;

  // Total "Loss" in Buying = Interest + Maintenance + Upfront Fees
  const totalBuyLoss = totalBuyUnrecoverable + upfrontCost;

  // 3. The "Ferrari" Narrative Logic
  let comparisonObject = "a luxury apartment downpayment";
  if (totalRentLost > 700000) comparisonObject = "a brand new Ferrari Roma";
  else if (totalRentLost > 400000) comparisonObject = "a Tesla Model S Plaid";
  else if (totalRentLost > 150000) comparisonObject = "a solid gold Rolex";

  // 4. Decision Logic (The 3/5 Year Rules)
  let decision = "BUY";
  let narrative = "";

  if (yearsToStay < 3) {
    decision = "RENT";
    narrative = `Based on your timeline of ${yearsToStay} years, you should **RENT**. Buying requires paying ~${Math.round(upfrontCost).toLocaleString()} AED in upfront fees (7%). You won't recover that cost in such a short time.`;
  } 
  else if (yearsToStay > 5) {
    decision = "BUY";
    narrative = `You are currently paying ${monthlyRent.toLocaleString()} AED/month. Over the next ${yearsToStay} years, that is **${Math.round(totalRentLost).toLocaleString()} AED**—essentially burning **${comparisonObject}**. If you buy, you stop burning this money and start building equity.`;
  } 
  else {
    // Edge case (3-5 years): Mathematical Tie-Breaker
    // --- UPDATED FOR OBJECTIVE 3 NARRATIVE ---
    const shockPhrase = `You're paying ${monthlyRent.toLocaleString()} AED/month. Over 5 years, that's **${Math.round(totalRentLost).toLocaleString()} AED**—essentially burning **${comparisonObject}**.`;

    if (totalRentLost > totalBuyLoss) {
      decision = "BUY";
      narrative = `${shockPhrase} It's a close call, but **Buying** wins. If you buy, that money builds equity. Even with interest and fees, buying is cheaper than losing that sum to rent.`;
    } else {
      decision = "RENT";
      narrative = `${shockPhrase} However, because buying costs you ~${Math.round(upfrontCost).toLocaleString()} AED in upfront fees, **Renting** is actually safer for this specific timeframe.`;
    }
  }

  return {
    decision,
    metrics: {
      totalRentLost: Math.round(totalRentLost),
      totalBuyLoss: Math.round(totalBuyLoss),
      monthlyUnrecoverableBuy: Math.round((annualInterest + annualMaintenance) / 12)
    },
    narrative // The AI must speak this verbatim
  };
}