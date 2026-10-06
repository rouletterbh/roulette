import { describe, expect, test } from "bun:test";
import { E18, FDV_MAX_USD_1E18, FDV_MIN_USD_1E18, curvePriceEth1e18, ethToUsd1e18, fmtUsd, impliedFdvUsd1e18, parseAssetsEnv, priceSanity, type RelayAsset } from "../src/price-sources";

// RBL on its Pons V2 launch curve, read on mainnet 2026-10-07.
const QUOTE = 3_741_936_573_078_533_314n; // 3.7419 ETH
const TOKENS = 448_965_386_555_936_491_330_454_539n; // 448.97M RBL
const SUPPLY = 1_000_000_000n * E18; // 1e9 RBL
const ETH_USD = 2_700n * E18;

describe("pons-curve price", () => {
  test("marginal price is quoteReserve / tokenReserve, in ETH per token at 1e18", () => {
    const p = curvePriceEth1e18(QUOTE, TOKENS);
    expect(p).toBe((QUOTE * E18) / TOKENS);
    expect(Number(p) / 1e18).toBeCloseTo(8.3346e-9, 12);
    expect(curvePriceEth1e18(0n, TOKENS)).toBe(0n);
    expect(curvePriceEth1e18(QUOTE, 0n)).toBe(0n);
  });
  test("USD conversion multiplies by ETH/USD at 1e18", () => {
    const usd = ethToUsd1e18(curvePriceEth1e18(QUOTE, TOKENS), ETH_USD);
    expect(Number(usd) / 1e18).toBeCloseTo(8.3346e-9 * 2700, 9); // ≈ $0.0000225
    expect(ethToUsd1e18(E18, ETH_USD)).toBe(ETH_USD);
    expect(ethToUsd1e18(0n, ETH_USD)).toBe(0n);
  });
  test("implied FDV = price × supply in whole tokens", () => {
    expect(impliedFdvUsd1e18(E18 / 100n, SUPPLY, 18)).toBe(10_000_000n * E18); // $0.01 × 1e9 = $10M
    expect(impliedFdvUsd1e18(2n * E18, 1_000_000n, 6)).toBe(2n * E18); // 6-decimal supply of 1 token
    const live = impliedFdvUsd1e18(ethToUsd1e18(curvePriceEth1e18(QUOTE, TOKENS), ETH_USD), SUPPLY, 18);
    expect(Number(live) / 1e18).toBeCloseTo(22_503, -1); // ≈ $22.5k today
  });
});

describe("sanity bounds", () => {
  test("today's RBL read passes", () => {
    const price = ethToUsd1e18(curvePriceEth1e18(QUOTE, TOKENS), ETH_USD);
    const s = priceSanity({ priceUsd1e18: price, totalSupply: SUPPLY, decimals: 18 });
    expect(s.ok).toBe(true);
  });
  test("refuses a zero price, a zero supply, and an FDV outside [$100, $1e9]", () => {
    expect(priceSanity({ priceUsd1e18: 0n, totalSupply: SUPPLY, decimals: 18 })).toMatchObject({ ok: false, reason: "zero price" });
    expect(priceSanity({ priceUsd1e18: E18, totalSupply: 0n, decimals: 18 })).toMatchObject({ ok: false, reason: "zero total supply" });
    // $1 per token × 1e9 supply = $1e9: exactly at the cap passes; one wei-USD more fails.
    expect(priceSanity({ priceUsd1e18: E18, totalSupply: SUPPLY, decimals: 18 }).ok).toBe(true);
    const over = priceSanity({ priceUsd1e18: E18 + 1n, totalSupply: SUPPLY, decimals: 18 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toMatch(/above the \$1,000,000,000\.00 cap/);
    // $1e-7 per token × 1e9 = $100: at the floor passes; below fails.
    expect(priceSanity({ priceUsd1e18: 100_000_000_000n, totalSupply: SUPPLY, decimals: 18 }).ok).toBe(true);
    const under = priceSanity({ priceUsd1e18: 99_999_999_999n, totalSupply: SUPPLY, decimals: 18 });
    expect(under.ok).toBe(false);
    if (!under.ok) expect(under.reason).toMatch(/below the \$100\.00 floor/);
    expect(FDV_MIN_USD_1E18).toBe(100n * E18);
    expect(FDV_MAX_USD_1E18).toBe(1_000_000_000n * E18);
  });
  test("custom bounds and USD formatting", () => {
    expect(priceSanity({ priceUsd1e18: E18, totalSupply: SUPPLY, decimals: 18, maxFdvUsd1e18: 10n * E18 }).ok).toBe(false);
    expect(fmtUsd(1_234_567_000_000_000_000_000n)).toBe("$1,234.56");
    expect(fmtUsd(0n)).toBe("$0.00");
  });
});

describe("ASSETS env", () => {
  const defaults: RelayAsset[] = [
    { symbol: "CASHCAT", address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", source: "coingecko" },
    { symbol: "RBL", address: "0x041f48E1C2855be1287B94363f4f3D8585ceCCdc", source: "pons-curve" },
  ];
  test("unset keeps the defaults", () => {
    expect(parseAssetsEnv(undefined, defaults)).toEqual(defaults);
    expect(parseAssetsEnv("  ", defaults)).toEqual(defaults);
  });
  test("parses 0xaddr (coingecko) and 0xaddr:pons-curve, reusing known symbols", () => {
    const a = parseAssetsEnv("0x020bfC650A365f8BB26819deAAbF3E21291018b4, 0x041f48e1c2855be1287b94363f4f3d8585ceccdc:pons-curve,0x00000000000000000000000000000000000000aa:coingecko", defaults);
    expect(a).toEqual([
      { symbol: "CASHCAT", address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", source: "coingecko" },
      { symbol: "RBL", address: "0x041f48e1c2855be1287b94363f4f3d8585ceccdc", source: "pons-curve" },
      { symbol: "0x000000", address: "0x00000000000000000000000000000000000000aa", source: "coingecko" },
    ]);
  });
  test("rejects bad addresses and unknown sources", () => {
    expect(() => parseAssetsEnv("0x1234", defaults)).toThrow(/not a 0x address/);
    expect(() => parseAssetsEnv("0x020bfC650A365f8BB26819deAAbF3E21291018b4:uniswap", defaults)).toThrow(/unknown source/);
  });
});
