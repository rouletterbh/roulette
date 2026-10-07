/**
 * Deposit split, mirroring CasinoTreasury.deposit() exactly (integer division in the same order):
 *   liquidity = value × payoutLiquidityBps / 10000   → mints chips at chipPriceWei (cash-out value)
 *   inventory = value × rewardInventoryBps / 10000   → reward bucket (buys vault tokens)
 *   reserve   = value × protocolReserveBps / 10000   → protocol reserve
 *   fee       = value − liquidity − inventory − reserve
 *   units     = liquidity / chipPriceWei; dust (liquidity − units × chipPriceWei) stays as house equity.
 * Pure so the cashier, the transaction summary and the tests agree to the wei.
 */
export interface DepositSplitBps {
  payoutLiquidityBps: number;
  rewardInventoryBps: number;
  protocolReserveBps: number;
  platformFeeBps: number;
}

export interface DepositBreakdown {
  valueWei: bigint;
  liquidityWei: bigint;
  inventoryWei: bigint;
  reserveWei: bigint;
  feeWei: bigint;
  chips: bigint;
  /** What the chips redeem for: chips × chipPriceWei. */
  cashOutWei: bigint;
  /** valueWei − cashOutWei: rewards + reserve + fee + rounding dust. Never returned on cash-out. */
  notReturnedWei: bigint;
  /** cashOutWei / valueWei in basis points (rounded down). */
  cashOutBps: number;
}

const BPS = 10_000n;

export function depositBreakdown(valueWei: bigint, split: DepositSplitBps, chipPriceWei: bigint): DepositBreakdown | null {
  if (valueWei <= 0n || chipPriceWei <= 0n) return null;
  const liquidityWei = (valueWei * BigInt(split.payoutLiquidityBps)) / BPS;
  const inventoryWei = (valueWei * BigInt(split.rewardInventoryBps)) / BPS;
  const reserveWei = (valueWei * BigInt(split.protocolReserveBps)) / BPS;
  const feeWei = valueWei - liquidityWei - inventoryWei - reserveWei;
  const chips = liquidityWei / chipPriceWei;
  const cashOutWei = chips * chipPriceWei;
  return {
    valueWei,
    liquidityWei,
    inventoryWei,
    reserveWei,
    feeWei,
    chips,
    cashOutWei,
    notReturnedWei: valueWei - cashOutWei,
    cashOutBps: Number((cashOutWei * BPS) / valueWei),
  };
}

/** Key for remembering the acknowledgement: it must be given again whenever the split changes. */
export function splitAckKey(split: DepositSplitBps): string {
  return `deposit-split-ack:${split.payoutLiquidityBps}/${split.rewardInventoryBps}/${split.protocolReserveBps}/${split.platformFeeBps}`;
}
