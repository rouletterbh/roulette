/** European single-zero wheel order, clockwise starting at 0. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = "red" | "black" | "green";

export function colorOf(n: number): PocketColor {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export const POCKETS = 37;
export const WHEEL_INDEX: Record<number, number> = Object.fromEntries(
  WHEEL_ORDER.map((n, i) => [n, i]),
);

/** Board layout: 12 rows × 3 columns. Column 1 = 1,4,7..., Column 3 = 3,6,9... */
export function columnOf(n: number): 1 | 2 | 3 | null {
  if (n === 0) return null;
  const c = n % 3;
  return c === 1 ? 1 : c === 2 ? 2 : 3;
}
export function dozenOf(n: number): 1 | 2 | 3 | null {
  if (n === 0) return null;
  return n <= 12 ? 1 : n <= 24 ? 2 : 3;
}
