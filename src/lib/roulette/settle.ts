import type { PlacedBet } from "./bets";

export interface SettlementLine {
  betId: string;
  stake: number;
  won: boolean;
  /** Total returned to the player (stake + profit) if won, else 0. */
  returned: number;
  profit: number;
}

export interface Settlement {
  result: number;
  lines: SettlementLine[];
  totalStaked: number;
  totalReturned: number;
  netProfit: number;
}

/** Deterministic payout math. Return on win = stake * (multiplier + 1). */
export function settleBets(bets: readonly PlacedBet[], result: number): Settlement {
  const lines = bets.map<SettlementLine>((b) => {
    const won = b.numbers.includes(result);
    const returned = won ? b.stake * (b.multiplier + 1) : 0;
    return { betId: b.id, stake: b.stake, won, returned, profit: returned - b.stake };
  });
  const totalStaked = lines.reduce((s, l) => s + l.stake, 0);
  const totalReturned = lines.reduce((s, l) => s + l.returned, 0);
  return { result, lines, totalStaked, totalReturned, netProfit: totalReturned - totalStaked };
}

/**
 * Maximum liability of a bet set = the largest total return across all 37 outcomes,
 * net of stakes already collected. This is what the treasury must reserve.
 */
export function maximumLiability(bets: readonly PlacedBet[]): { worstResult: number; maxReturn: number; maxNetPayout: number } {
  let worstResult = 0;
  let maxReturn = 0;
  const totalStaked = bets.reduce((s, b) => s + b.stake, 0);
  for (let n = 0; n <= 36; n++) {
    let ret = 0;
    for (const b of bets) if (b.numbers.includes(n)) ret += b.stake * (b.multiplier + 1);
    if (ret > maxReturn) {
      maxReturn = ret;
      worstResult = n;
    }
  }
  return { worstResult, maxReturn, maxNetPayout: Math.max(0, maxReturn - totalStaked) };
}

export function potentialPayout(bet: PlacedBet) {
  return bet.stake * (bet.multiplier + 1);
}
