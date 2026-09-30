/**
 * Compute aarthik score
 *
 * @param ADX ADX data { currADX , preADX } // Current adx and previous candle ADX
 * @param RSI rsi value of current candle
 * @param now Time of last candle
 * @returns Return aarthik score Object for DB update
 */
export const computeAarthikScore = (
  ADX: { currADX: number; prevADX: number },
  RSI: number,
  now: Date,
) => {
  try {
    let setObj: any = {};
    const ajitObj = computeAjitScore(ADX, RSI, now);
    const souravObj = computeSouravScore(ADX, RSI, now);
    if (ajitObj) {
      setObj = { ...ajitObj };
    }
    if (souravObj) {
      setObj = { ...setObj, ...souravObj };
    }
    return setObj;
  } catch (err: any) {
    console.error(
      "[computeAarthikScore] error for",
      err?.response?.data || err,
    );
    return null;
  }
};

/**
 * Compute Sourav score
 *
 * @param ADX ADX data { currADX , preADX } // Current adx and previous candle ADX
 * @param RSI rsi value of current candle
 * @param now Time of last candle
 * @returns Return aarthik score Object for DB update
 */
export const computeSouravScore = (
  ADX: { currADX: number; prevADX: number },
  RSI: number,
  now: Date,
) => {
  try {
    let adxScore: number | null = null;
    let rsiScore: number | null = null;

    if (ADX.currADX <= 10) {
      adxScore = 10;
    } else {
      const diff = ADX.currADX - 10;
      adxScore = diff * 3 + 10;
    }

    if (RSI <= 50) {
      rsiScore = 0;
    } else {
      const diff = RSI - 50;
      rsiScore = diff * 2;
    }

    const aarthikScore = 0.4 * adxScore + 0.6 * rsiScore;

    const setObj: any = {
      s_entry_5_timeframe: now,
      s_adx_5_timeframe: adxScore,
      s_rsi_5_timeframe: rsiScore,
      s_aarthik_score_5_timeframe: aarthikScore,
    };

    return setObj;
  } catch (err: any) {
    console.error("[computeSouravScore] error for", err?.response?.data || err);
    return null;
  }
};

/**
 * Compute Ajit score
 *
 * @param ADX ADX data { currADX , preADX } // Current adx and previous candle ADX
 * @param RSI rsi value of current candle
 * @param now Time of last candle
 * @returns Return aarthik score Object for DB update
 */
export const computeAjitScore = (
  ADX: { currADX: number; prevADX: number },
  RSI: number,
  now: Date,
) => {
  try {
    let tss: number | null = null;
    let dms: number | null = null;
    let mas: number | null = null;

    tss = Math.min((ADX.currADX - 15) * 2, 100);
    tss = Math.max(tss, 0);

    dms = Math.abs(RSI - 50) * 2;

    const adxSlope = ADX.currADX - ADX.prevADX;
    mas = adxSlope * 10 + 50;
    mas = Math.max(0, Math.min(100, mas));

    const aarthikScore = 0.5 * tss + 0.3 * dms + 0.2 * mas;

    const setObj: any = {
      a_entry_5_timeframe: now,
      a_tss_5_timeframe: tss,
      a_dms_5_timeframe: dms,
      a_mas_5_timeframe: mas,
      a_aarthik_score_5_timeframe: aarthikScore,
    };

    return setObj;
  } catch (err: any) {
    console.error("[computeAjitScore] error for", err?.response?.data || err);
    return null;
  }
};
