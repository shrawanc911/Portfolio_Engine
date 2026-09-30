import fnoStocks from "../data/fno_stocks_list.json";
import rawStocksDetail from "../data/stocks_isin.json";
import { fetchDhanIntradayData } from "./dhan.service";
import { CandleData, DhanIntradayPayload } from "../interface/file.interface";
import { ScreenerSnapshot } from "../models/ScreenerSnapshot.model";
import { getPastDateIST, getTodayDateIST } from "../utils/indicators/time";
import { sleep } from "../utils/sleep";
import { type StockDetails } from "../interface/file.interface";
import { ENV } from "../config/env";
import { computeRSIScreener } from "./computeRSIScreener.service";
import { computeVWAPScreener } from "./computeVWAPScreener.service";
import { computeVolumeScreener } from "./computeVolumeScreener.service";
import { computeEMAScreener } from "./computeEMAScreener.service";
import { calculateADXFromArrays } from "../utils/indicators/adx";
import { computeAarthikScore } from "./computeAarthikScore.service";
import { getLastCompletedCandleIndex } from "../utils/indicators/volume";
import { computeSKScore } from "./computeSKScore.service";
import { computeSMAAndEMA } from "./computeSMAAndEMA.service";
import { computeMACD } from "./computeMACDScreener.service";

const DELAY_MS = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const stocksDetails = rawStocksDetail as Record<string, StockDetails>;

/**
 * Fetch intraday data with exponential-backoff retry.
 */
async function fetchIntradayWithRetry(
  payload: DhanIntradayPayload,
  broker_name: string,
  client_id: string,
): Promise<Awaited<ReturnType<typeof fetchDhanIntradayData>>> {
  try {
    return await fetchDhanIntradayData(payload, broker_name, client_id);
  } catch (err: any) {
    console.warn(`[fetchIntradayWithRetry] error`, err.message);
    throw new Error(err);
  }
}

/**
 * Compute Screeners based on custom logic
 */
export const computeScreeners = async () => {
  try {
    const today = getTodayDateIST();
    const emaFromDate = getPastDateIST(12); // last ~7 days of 60m data
    const rsiVWAPVolumeFromDate = getPastDateIST(60); // last ~60 days of 5m data
    console.time("Computing screeners started");
    console.log("Computing screeners started:", today);
    // =====================================================
    // Pre-load existing signals to preserve entry times
    // =====================================================
    const existingSnapshots = await ScreenerSnapshot.find()
      .select(
        "isin rsi_signal rsi_entry vwap_signal vwap_entry volume_signal volume_entry ema_signal ema_entry ema_cross_price",
      )
      .lean();

    const existingMap = new Map<
      string,
      {
        rsi_signal?: string | null;
        rsi_entry?: Date;
        vwap_signal?: string | null;
        vwap_entry?: Date;
        volume_signal?: string | null;
        volume_entry?: Date;
        ema_signal?: string | null;
        ema_entry?: Date;
        ema_cross_price?: number | null;
      }
    >();

    for (const snap of existingSnapshots) {
      existingMap.set(snap.isin, {
        rsi_signal: snap.rsi_signal,
        rsi_entry: snap.rsi_entry,
        vwap_signal: snap.vwap_signal,
        vwap_entry: snap.vwap_entry,
        volume_signal: snap.volume_signal,
        volume_entry: snap.volume_entry,
        ema_signal: snap.ema_signal,
        ema_entry: snap.ema_entry,
        ema_cross_price: snap.ema_cross_price,
      });
    }

    existingSnapshots.length = 0;
    const bulkOps: any[] = [];

    for (const isin of fnoStocks) {
      try {
        await sleep(DELAY_MS);
        const stock = stocksDetails[isin];
        if (!stock || !stock.SECURITY_ID || !stock.EXCH_ID) continue;

        const security_id = stock.SECURITY_ID.toString();
        const exchange = stock.EXCH_ID;

        const payload5M: DhanIntradayPayload = {
          securityId: Number(security_id),
          exchangeSegment: exchange + "_EQ",
          instrument: "EQUITY",
          interval: 5,
          oi: false,
          fromDate: rsiVWAPVolumeFromDate,
          toDate: today,
        };

        const payload60M: DhanIntradayPayload = {
          securityId: Number(security_id),
          exchangeSegment: exchange + "_EQ",
          instrument: "EQUITY",
          interval: 60,
          oi: false,
          fromDate: emaFromDate,
          toDate: today,
        };
        const [dhandata5M, dhandata60M] = await Promise.all([
          fetchIntradayWithRetry(
            payload5M,
            ENV.BROKER_NAME,
            ENV.DHAN_CLIENT_ID_TWO,
          ),
          fetchIntradayWithRetry(
            payload60M,
            ENV.BROKER_NAME,
            ENV.DHAN_CLIENT_ID_TWO,
          ),
        ]);

        const existing = existingMap.get(isin);

        const finalObj5M = compute5mScreeners(dhandata5M, existing);
        const finalObj60M = compute60mScreeners(dhandata60M, existing);

        const now = new Date();
        let setObj: any = {
          isin,
          security_id,
          exchange: exchange,
          updated_at: now,
        };

        // final obj 15 minutes interval is not null
        if (finalObj5M) setObj = { ...setObj, ...finalObj5M };

        // final obj 60 minutes interval is not null
        if (finalObj60M) setObj = { ...setObj, ...finalObj60M };

        bulkOps.push({
          updateOne: {
            filter: {
              isin,
              exchange,
            },
            update: {
              $set: setObj,
            },
          },
        });

        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(
          "[computeScreeners] error for",
          isin,
          err?.response?.data || err.message,
        );
      }
    }

    if (bulkOps.length > 0) {
      const result = await ScreenerSnapshot.bulkWrite(bulkOps, {
        ordered: false,
      });
      console.log("BulkWrite result:", {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
      });
    }
  } catch (error: any) {
    console.error("[computeScreeners] Error :", error?.response?.data || error);
  } finally {
    console.timeEnd("Computing screeners started");
    console.log("Computing screeners end:", new Date());
  }
};

/**
 * Compute 60 Minutes interval screeners
 * @param dhandata Candle Data close[] , volume[] and etc.
 * @param existing Existing stock from collection for entry time
 * @return Return final response that is needed to update
 */
export const compute60mScreeners = (dhandata: CandleData, existing: any) => {
  const { timestamp, high, low, close, volume } = dhandata;
  if (!timestamp || !high || !low || !close || !volume || close.length === 0) {
    return null;
  }
  try {
    let finalObj: any = {};

    // =====================
    // 1) Compute EMA
    // =====================
    const emaObj = computeEMAScreener(dhandata, existing);
    if (emaObj) {
      finalObj = { ...finalObj, ...emaObj };
    }

    return finalObj;
  } catch (error: any) {
    console.error("[compute60MScreeners] :", error);
    return null;
  }
};

/**
 * Compute 5 Minutes interval screeners
 * @param dhandata Candle Data close[] , volume[] and etc.
 * @param existing Existing stock from collection for entry time
 * @return Return final response that is needed to update
 */
export const compute5mScreeners = (dhandata: CandleData, existing: any) => {
  const {
    open: o,
    timestamp: t,
    high: h,
    low: l,
    close: c,
    volume: v,
  } = dhandata;
  if (!o || !t || !h || !l || !c || !v || c.length === 0) {
    return null;
  }
  try {
    let finalObj: any = {};
    const i = getLastCompletedCandleIndex(t, 5);
    if (i == null) {
      return null;
    }
    const timestamp = t.slice(0, i + 1);
    const open = o.slice(0, i + 1);
    const high = h.slice(0, i + 1);
    const low = l.slice(0, i + 1);
    const close = c.slice(0, i + 1);
    const volume = v.slice(0, i + 1);

    const ts = timestamp[i];
    let now = new Date();
    if (ts) {
      now = new Date(ts * 1000);
    }

    let skInput: any = { price: close[i] };

    // =========================
    // 1) Compute ADX from ALL data
    // =========================
    const { currADX, prevADX } = calculateADXFromArrays({
      high,
      low,
      close,
      timestamp,
    });
    skInput = { ...skInput, adx: currADX };
    let RSI = 0;

    // =====================
    // 2) Compute RSI
    // =====================
    const rsiObj = computeRSIScreener({ close, timestamp }, existing, now);
    if (rsiObj) {
      finalObj = { ...finalObj, ...rsiObj };
      RSI = rsiObj.rsi;
      skInput = { ...skInput, rsi: RSI };
    }

    // =====================
    // 3) Compute VWAP
    // =====================
    const vwapObj = computeVWAPScreener(
      { open, close, timestamp, volume, high, low },
      existing,
      now,
    );
    if (vwapObj) {
      finalObj = { ...finalObj, ...vwapObj };
    }

    // =====================
    // 4) Compute Volume
    // =====================
    const volumeObj = computeVolumeScreener({ volume, timestamp });
    if (volumeObj) {
      finalObj = { ...finalObj, ...volumeObj };
      skInput = {
        ...skInput,
        volume: volumeObj.today_volume,
        avgVolume: volumeObj.average_20_volume,
      };
    }

    // =====================
    // 5) Compute Aarthik Score
    // =====================
    const aarthikObj = computeAarthikScore({ currADX, prevADX }, RSI, now);
    if (aarthikObj) {
      finalObj = { ...finalObj, ...aarthikObj };
    }

    // =====================
    // 7) Compute macd
    // =====================
    const macdObj = computeMACD(close);
    if (macdObj) {
      skInput = { ...skInput, ...macdObj };
    }
    // =====================
    // 8) Compute sma and ema
    // =====================
    const emaObj = computeSMAAndEMA(close);
    if (emaObj) {
      skInput = { ...skInput, ...emaObj };
    }

    // =====================
    // 9) Compute SK Score
    // =====================
    const skObj = computeSKScore(skInput);
    // finalObj = { ...finalObj, ...skObj, ...skInput };
    return finalObj;
  } catch (error: any) {
    console.error("[compute5mScreeners] :", error);
    return null;
  }
};
