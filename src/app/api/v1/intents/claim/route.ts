import { z } from "zod";
import { parseUnits } from "viem";
import { address, err, OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { buildClaimIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";
import { getRewardInventory } from "@/lib/demo/rewards";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { ChainClaimBodySchema, chainClaimIntent } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z
  .object({
    /** Ignored in demo mode; required when chain-backed. */
    address: z.string().optional(),
    /** Reward asset contract address (ERC-20), or a registry id such as "crypto-eth" when the asset has an address. */
    asset: z.union([address, z.string().regex(/^(crypto|stock)-[a-z0-9]+$/)]),
    /** USD amount of win balance to claim, as a decimal string or number (e.g. "12.50"). Encoded as 1e18 fixed point. */
    usdAmount: z.union([z.number().positive().finite(), z.string().regex(/^\d+(\.\d{1,18})?$/)]),
    /** Minimum acceptable token amount in base units (decimal string). Defaults to 0 with a warning. */
    minOut: z.string().regex(/^\d+$/).default("0"),
    /** Unix seconds. Defaults to now + 20 minutes. */
    deadline: z.number().int().positive().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const limited = rateLimit(req, "intents");
  if (limited) return limited;
  if (CHAIN_BACKED) {
    const cb = await parseBody(req, ChainClaimBodySchema);
    if ("response" in cb) return cb.response;
    return chainClaimIntent(getChainReader(), cb.data);
  }
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const b = body.data;

  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  let asset: `0x${string}`;
  let unverifiedAsset = false;
  let registry = getRewardInventory().find((r) => r.token.id === b.asset || (r.token.contractAddress && r.token.contractAddress.toLowerCase() === String(b.asset).toLowerCase()));
  if (b.asset.startsWith("0x")) {
    asset = b.asset as `0x${string}`;
  } else {
    registry = getRewardInventory().find((r) => r.token.id === b.asset);
    if (!registry) return err("NOT_FOUND", `Unknown reward asset "${b.asset}"`);
    // No fake addresses: unverified assets encode the zero address and are returned as a preview only.
    unverifiedAsset = !registry.token.contractAddress;
    asset = (registry.token.contractAddress as `0x${string}` | null) ?? ZERO;
  }

  const usdAmount1e18 = parseUnits(String(b.usdAmount), 18);
  if (usdAmount1e18 <= 0n) return err("VALIDATION_ERROR", "usdAmount must be positive");
  const deadline = BigInt(b.deadline ?? Math.floor(Date.now() / 1000) + 20 * 60);
  if (deadline <= BigInt(Math.floor(Date.now() / 1000))) return err("VALIDATION_ERROR", "deadline is already in the past");

  const intent = buildClaimIntent(asset, usdAmount1e18, BigInt(b.minOut), deadline, `$${String(b.usdAmount)}`);
  if (registry && registry.status !== "available" && registry.status !== "low") {
    intent.warnings.push(`Vault inventory for ${registry.token.symbol} is currently "${registry.statusLabel}"; the claim will revert until inventory is funded.`);
  }
  const payload = {
    intent,
    asset: registry ? { id: registry.token.id, symbol: registry.token.symbol, contractAddress: registry.token.contractAddress, status: registry.status, inventoryUsd: registry.inventoryUsd } : { address: asset },
    usdAmount1e18: usdAmount1e18.toString(),
    deadline: deadline.toString(),
  };
  if (unverifiedAsset && registry) {
    intent.to = null;
    intent.warnings.push(`Reward asset "${registry.token.id}" has no verified contract address yet; the asset argument is the zero address in this preview.`);
    return err("CONTRACTS_NOT_DEPLOYED", `Reward asset "${registry.token.id}" has no verified contract address yet (${registry.statusLabel}). Preview only.`, { preview: payload, demo: true });
  }
  return intentResponse(payload);
}
