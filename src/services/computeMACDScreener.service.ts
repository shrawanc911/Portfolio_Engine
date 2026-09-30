import { calculateEMA } from "../utils/indicators/ema";


export function computeMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
) {
  if (prices.length < slowPeriod + signalPeriod) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    };
  }

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  const macdLine: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (fastEMA[i] !== undefined && slowEMA[i] !== undefined) {
      macdLine[i] = (fastEMA[i] as number) - (slowEMA[i] as number);
    } else {
      macdLine[i] = NaN;
    }
  }

  const signalEMA = calculateEMA(
    macdLine.filter((v) => !isNaN(v)),
    signalPeriod,
  );

  const validMacd = macdLine.filter((v) => !isNaN(v));
  const macd = validMacd[validMacd.length - 1] ?? null;
  const signal = signalEMA[signalEMA.length - 1] ?? null;

  const histogram = macd !== null && signal !== null ? macd - signal : null;

  return {
    macd,
    macdSignal: signal,
    macdHistogram: histogram,
  };
}
