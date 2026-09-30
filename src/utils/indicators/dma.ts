export function sumLastNCandles(
  closes: number[],
  period: number = 200,
): number | null {
  if (!Array.isArray(closes) || closes.length < period) {
    return null;
  }

  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += closes[i] ?? 0;
  }

  return sum;
}
