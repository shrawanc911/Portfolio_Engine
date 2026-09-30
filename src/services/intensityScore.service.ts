import fnoStocks from "../data/fno_stocks_list.json";
import rawStocksDetail from "../data/stocks_isin.json";
import { fetchDhanIntradayData } from "./dhan.service";
import { DhanIntradayPayload } from "../interface/file.interface";
import { ScreenerSnapshot } from "../models/ScreenerSnapshot.model";
import { getPastDateIST, getTodayDateIST } from "../utils/indicators/time";
import { sleep } from "../utils/sleep";
import { type StockDetails } from "../interface/file.interface";
import { detectVolumeExpansionOnCandles } from "../utils/indicators/volume";
import { calculateADXFromArrays } from "../utils/indicators/adx";
import { calculateRSI } from "../utils/indicators/rsi";
import { ENV } from "../config/env";

const stocksDetails = rawStocksDetail as Record<string, StockDetails>;

/**
 * Compute Intensity Score based on Sourav Joshi logic
 */
// const computeSouravJoshiAarthikScore = async (interval: number = 5) => {
//   try {
//     const today = getTodayDateIST();
//     const fromDate = getPastDateIST(60); // last ~7 days of 15m data for RSI

//     console.log("Computing sourav_joshi_aarthik_score: START", new Date());
//     console.log("FROM:", fromDate, "TO:", today);

//     const bulkOps: any[] = [];

//     for (const isin of fnoStocks.slice(0, 1)) {
//       try {
//         await sleep(250);

//         const stock = stocksDetails[isin];
//         if (!stock || !stock.SECURITY_ID || !stock.EXCH_ID) continue;

//         const security_id = stock.SECURITY_ID.toString();
//         const exchange = stock.EXCH_ID;

//         const payload: DhanIntradayPayload = {
//           securityId: Number(security_id),
//           exchangeSegment: exchange + "_EQ",
//           instrument: "EQUITY",
//           interval: interval,
//           oi: false,
//           fromDate: fromDate,
//           toDate: today,
//         };
//         const dhandata = await fetchDhanIntradayData(payload);

//         const { open, timestamp, high, low, close, volume } = dhandata;
//         if (
//           !open ||
//           !timestamp ||
//           !high ||
//           !low ||
//           !close ||
//           !volume ||
//           close.length === 0
//         ) {
//           continue;
//         }

//         // =========================
//         // 1) ADX from ALL data
//         // =========================
//         const { currADX } = calculateADXFromArrays({
//           high,
//           low,
//           close,
//           timestamp,
//         });

//         // =========================
//         // 2) RSI from ALL data
//         // =========================
//         const rsi = calculateRSI(close, 14);

//         // =========================
//         // 3) Build DB update
//         // =========================

//         let adx_score: number | null = null;
//         let rsi_score: number | null = null;

//         if (currADX <= 10) {
//           adx_score = 10;
//         } else {
//           const diff = currADX - 10;
//           adx_score = diff * 3 + 10;
//         }

//         if (rsi <= 50) {
//           rsi_score = 0;
//         } else {
//           const diff = rsi - 50;
//           rsi_score = diff * 2;
//         }

//         const intensity_score = 0.4 * adx_score + 0.6 * rsi_score;

//         const now = new Date();
//         const setObj: any = {
//           isin,
//           security_id,
//           exchange: exchange,
//           updated_at: now,
//         };
//         console.log(now);
//         if (interval == 5) {
//           setObj.s_entry_5_timeframe = now;
//           setObj.s_adx_5_timeframe = adx_score;
//           setObj.s_rsi_5_timeframe = rsi_score;
//           setObj.s_intensity_score_5_timeframe = intensity_score;
//         } else if (interval == 15) {
//           setObj.s_entry_15_timeframe = now;
//           setObj.s_adx_15_timeframe = adx_score;
//           setObj.s_rsi_15_timeframe = rsi_score;
//           setObj.s_intensity_score_15_timeframe = intensity_score;
//         } else if (interval == 60) {
//           setObj.s_entry_60_timeframe = now;
//           setObj.s_adx_60_timeframe = adx_score;
//           setObj.s_rsi_60_timeframe = rsi_score;
//           setObj.s_intensity_score_60_timeframe = intensity_score;
//         }

//         bulkOps.push({
//           updateOne: {
//             filter: {
//               isin,
//               exchange,
//             },
//             update: {
//               $set: setObj,
//             },
//           },
//         });
//       } catch (err: any) {
//         console.error(
//           "Sourav Joshi Aarthik Score error for",
//           isin,
//           err?.response?.data || err,
//         );
//       }
//     }

//     if (bulkOps.length > 0) {
//       const result = await ScreenerSnapshot.bulkWrite(bulkOps, {
//         ordered: false,
//       });
//       console.log("BulkWrite result:", {
//         matched: result.matchedCount,
//         modified: result.modifiedCount,
//         upserted: result.upsertedCount,
//       });
//     }
//   } catch (error: any) {
//     console.error(
//       "Error while sourav_joshi_aarthik_score:",
//       error?.response?.data || error,
//     );
//   } finally {
//     console.log("Computing sourav_joshi_aarthik_score: END", new Date());
//   }
// };

/**
 * Compute Intensity Score based on Sourav Joshi logic
 */
export const computeBothAarthikScore = async (interval: number = 5) => {
  try {
    const today = getTodayDateIST();
    const fromDate = getPastDateIST(60); // last ~7 days of 15m data for RSI

    console.log("Computing both_aarthik_score: START", new Date());
    console.log("FROM:", fromDate, "TO:", today);

    const bulkOps: any[] = [];

    for (const isin of fnoStocks) {
      try {
        await sleep(250);

        const stock = stocksDetails[isin];
        if (!stock || !stock.SECURITY_ID || !stock.EXCH_ID) continue;

        const security_id = stock.SECURITY_ID.toString();
        const exchange = stock.EXCH_ID;

        const payload: DhanIntradayPayload = {
          securityId: Number(security_id),
          exchangeSegment: exchange + "_EQ",
          instrument: "EQUITY",
          interval: interval,
          oi: false,
          fromDate: fromDate,
          toDate: today,
        };
        const dhandata = await fetchDhanIntradayData(payload, ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_TWO);

        const { open, timestamp, high, low, close, volume } = dhandata;
        if (
          !open ||
          !timestamp ||
          !high ||
          !low ||
          !close ||
          !volume ||
          close.length === 0
        ) {
          continue;
        }

        // =========================
        // 1) ADX from ALL data
        // =========================
        const { currADX, prevADX } = calculateADXFromArrays({
          high,
          low,
          close,
          timestamp,
        });

        // =========================
        // 2) RSI from ALL data
        // =========================
        const rsi = calculateRSI(close, 14);

        // =========================
        // 3) Build Sourav Joshi update
        // =========================

        let adx_score: number | null = null;
        let rsi_score: number | null = null;

        if (currADX <= 10) {
          adx_score = 10;
        } else {
          const diff = currADX - 10;
          adx_score = diff * 3 + 10;
        }

        if (rsi <= 50) {
          rsi_score = 0;
        } else {
          const diff = rsi - 50;
          rsi_score = diff * 2;
        }

        const intensity_score = 0.4 * adx_score + 0.6 * rsi_score;

        const now = new Date();
        const setObj: any = {
          isin,
          security_id,
          exchange: exchange,
          updated_at: now,
        };
        if (interval == 5) {
          setObj.s_entry_5_timeframe = now;
          setObj.s_adx_5_timeframe = adx_score;
          setObj.s_rsi_5_timeframe = rsi_score;
          setObj.s_aarthik_score_5_timeframe = intensity_score;
        } else if (interval == 15) {
          setObj.s_entry_15_timeframe = now;
          setObj.s_adx_15_timeframe = adx_score;
          setObj.s_rsi_15_timeframe = rsi_score;
          setObj.s_aarthik_score_15_timeframe = intensity_score;
        } else if (interval == 60) {
          setObj.s_entry_60_timeframe = now;
          setObj.s_adx_60_timeframe = adx_score;
          setObj.s_rsi_60_timeframe = rsi_score;
          setObj.s_aarthik_score_60_timeframe = intensity_score;
        }

        // =========================
        // 4) Build Ajit Patel update
        // =========================

        let tss: number | null = null;
        let dms: number | null = null;
        let mas: number | null = null;

        tss = Math.min((currADX - 15) * 2, 100);
        tss = Math.max(tss, 0);

        dms = Math.abs(rsi - 50) * 2;

        const adx_slope = currADX - prevADX;
        mas = adx_slope * 10 + 50;
        mas = Math.max(0, Math.min(100, mas));

        const aarthik_score = 0.5 * tss + 0.3 * dms + 0.2 * mas;

        if (interval == 5) {
          setObj.a_entry_5_timeframe = now;
          setObj.a_tss_5_timeframe = tss;
          setObj.a_dms_5_timeframe = dms;
          setObj.a_mas_5_timeframe = mas;
          setObj.a_aarthik_score_5_timeframe = aarthik_score;
        } else if (interval == 15) {
          setObj.a_entry_15_timeframe = now;
          setObj.a_tss_15_timeframe = tss;
          setObj.a_dms_15_timeframe = dms;
          setObj.a_mas_15_timeframe = mas;
          setObj.a_aarthik_score_15_timeframe = aarthik_score;
        } else if (interval == 60) {
          setObj.a_entry_60_timeframe = now;
          setObj.a_tss_60_timeframe = tss;
          setObj.a_dms_60_timeframe = dms;
          setObj.a_mas_60_timeframe = mas;
          setObj.a_aarthik_score_60_timeframe = aarthik_score;
        }

        // =========================
        // 5) Update in DB
        // =========================

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
      } catch (err: any) {
        console.error(
          "Both Aarthik Score error for",
          isin,
          err?.response?.data || err,
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
    console.error(
      "Error while both_aarthik_score:",
      error?.response?.data || error,
    );
  } finally {
    console.log("Computing both_aarthik_score: END", new Date());
  }
};

/**
 * Compute Intensity Score based on Sourav Joshi logic
 */
// const computeAjitPatelAarthikScore = async (interval: number = 15) => {
//   try {
//     const today = getTodayDateIST();
//     const fromDate = getPastDateIST(60); // last ~7 days of 15m data for RSI

//     console.log("Computing ajit_patel_aarthik_score: START", new Date());
//     console.log("FROM:", fromDate, "TO:", today);

//     const bulkOps: any[] = [];

//     for (const isin of fnoStocks) {
//       try {
//         await sleep(250);

//         const stock = stocksDetails[isin];
//         if (!stock || !stock.SECURITY_ID || !stock.EXCH_ID) continue;

//         const security_id = stock.SECURITY_ID.toString();
//         const exchange = stock.EXCH_ID;

//         const payload: DhanIntradayPayload = {
//           securityId: Number(security_id),
//           exchangeSegment: exchange + "_EQ",
//           instrument: "EQUITY",
//           interval: interval,
//           oi: false,
//           fromDate: fromDate,
//           toDate: today,
//         };
//         const dhandata = await fetchDhanIntradayData(payload);

//         const { open, timestamp, high, low, close, volume } = dhandata;
//         if (
//           !open ||
//           !timestamp ||
//           !high ||
//           !low ||
//           !close ||
//           !volume ||
//           close.length === 0
//         ) {
//           continue;
//         }

//         // =========================
//         // 1) ADX from ALL data
//         // =========================
//         const { currADX, prevADX } = calculateADXFromArrays({
//           high,
//           low,
//           close,
//           timestamp,
//         });

//         // =========================
//         // 2) RSI from ALL data
//         // =========================
//         const rsi = calculateRSI(close, 14);

//         // =========================
//         // 3) Build DB update
//         // =========================

//         let tss: number | null = null;
//         let dms: number | null = null;
//         let mas: number | null = null;

//         tss = Math.min((currADX - 15) * 2, 100);
//         tss = Math.max(tss, 0);

//         dms = Math.abs(rsi - 50) * 2;

//         const adx_slope = currADX - prevADX;
//         mas = adx_slope * 10 + 50;
//         mas = Math.max(0, Math.min(100, mas));

//         const aarthik_score = 0.5 * tss + 0.3 * dms + 0.2 * mas;

//         const now = new Date();
//         const setObj: any = {
//           isin,
//           security_id,
//           exchange: exchange,
//           updated_at: now,
//         };

//         if (interval == 5) {
//           setObj.a_entry_5_timeframe = now;
//           setObj.a_tss_5_timeframe = tss;
//           setObj.a_dms_5_timeframe = dms;
//           setObj.a_mas_5_timeframe = mas;
//           setObj.a_aarthik_score_5_timeframe = aarthik_score;
//         } else if (interval == 15) {
//           setObj.a_entry_15_timeframe = now;
//           setObj.a_tss_15_timeframe = tss;
//           setObj.a_dms_15_timeframe = dms;
//           setObj.a_mas_15_timeframe = mas;
//           setObj.a_aarthik_score_15_timeframe = aarthik_score;
//         } else if (interval == 60) {
//           setObj.a_entry_60_timeframe = now;
//           setObj.a_tss_60_timeframe = tss;
//           setObj.a_dms_60_timeframe = dms;
//           setObj.a_mas_60_timeframe = mas;
//           setObj.a_aarthik_score_60_timeframe = aarthik_score;
//         }

//         bulkOps.push({
//           updateOne: {
//             filter: {
//               isin,
//               exchange,
//             },
//             update: {
//               $set: setObj,
//             },
//           },
//         });
//       } catch (err: any) {
//         console.error(
//           "ajit_patel_aarthik_score error for",
//           isin,
//           err?.response?.data || err,
//         );
//       }
//     }

//     if (bulkOps.length > 0) {
//       const result = await ScreenerSnapshot.bulkWrite(bulkOps, {
//         ordered: false,
//       });
//       console.log("BulkWrite result:", {
//         matched: result.matchedCount,
//         modified: result.modifiedCount,
//         upserted: result.upsertedCount,
//       });
//     }
//   } catch (error: any) {
//     console.error(
//       "Error while ajit_patel_aarthik_score:",
//       error?.response?.data || error,
//     );
//   } finally {
//     console.log("Computing ajit_patel_aarthik_score: END", new Date());
//   }
// };
