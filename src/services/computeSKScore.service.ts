interface SKScoreInput {
  price: number;
  ema20: number;
  ema50: number;
  ema200: number;

  rsi: number;

  adx: number;

  volume: number;
  avgVolume: number;

  macd: number;
  macdSignal: number;
}

export const computeSKScore = (data: SKScoreInput) => {
  let score = 0;

  const {
    price,
    ema20,
    ema50,
    ema200,
    rsi,
    adx,
    volume,
    avgVolume,
    macd,
    macdSignal,
  } = data;

  // ============================
  // 1. Trend Alignment (30 pts)
  // ============================

  if (price > ema20 && ema20 > ema50 && ema50 > ema200) {
    score += 30;
  } else if (price > ema20 && ema20 > ema50) {
    score += 15;
  }

  // ============================
  // 2. RSI Strength (25 pts)
  // ============================

  if (rsi >= 60 && rsi <= 70) {
    score += 25;
  } else if (rsi > 70 && rsi <= 75) {
    score += 15;
  }

  // ============================
  // 3. ADX Trend Force (15 pts)
  // ============================

  if (adx > 40) {
    score += 15;
  } else if (adx >= 25) {
    score += 10;
  }

  // ============================
  // 4. Volume Conviction (20 pts)
  // ============================

  const volumeRatio = volume / avgVolume;

  if (volumeRatio > 3) {
    score += 20;
  } else if (volumeRatio >= 1.5) {
    score += 15;
  }

  // ============================
  // 5. MACD Direction (10 pts)
  // ============================

  if (macd > macdSignal && macd > 0) {
    score += 10;
  } else if (macd > macdSignal) {
    score += 5;
  }

  // ============================
  // Score Classification
  // ============================

  let label = "Weak";

  if (score >= 80) label = "High Momentum";
  else if (score >= 60) label = "Steady Momentum";
  else if (score >= 40) label = "Building Momentum";

  return {
    sk_score: score,
    sk_label: label,
  };
};
