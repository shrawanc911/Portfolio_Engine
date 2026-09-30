import fnoStocks from "../data/fno_stocks_list.json";
import rawStocksDetail from "../data/stocks_isin.json";
import { fetchDhanData } from "./dhan.service";
import { DhanPayload, StockDetails } from "../interface/file.interface";
import { ScreenerSnapshot } from "../models/ScreenerSnapshot.model";
import { getPastDateIST, getTodayDateIST } from "../utils/indicators/time";
import { sleep } from "../utils/sleep";
import { sumLastNCandles } from "../utils/indicators/dma";
import { stockCache } from "./stockCache.service";
import { ENV } from "../config/env";

const stocksDetails = rawStocksDetail as Record<string, StockDetails>;

/**
 * This job:
 * - Fetches historical candles
 * - Computes SUM of last 199 closes
 * - Stores that sum in DB
 *
 * 200 DMA will be computed later using:
 *   (sum199 + currentClose) / 200
 */
export const computeDMA199BaseSum = async () => {
  try {
    const today = getTodayDateIST();
    const fromDate = getPastDateIST(365); // enough data to safely get 199 candles

    console.log("📊 Computing DMA-199 base sum: START", new Date());
    console.log("FROM:", fromDate, "TO:", today);

    const bulkOps: any[] = [];

    for (const isin of fnoStocks) {
      try {
        await sleep(250); // rate-limit protection

        const stock = stocksDetails[isin];
        if (!stock || !stock.SECURITY_ID || !stock.EXCH_ID) continue;

        const securityId = stock.SECURITY_ID.toString();
        const exchange = stock.EXCH_ID;

        const payload: DhanPayload = {
          securityId: Number(securityId),
          exchangeSegment: exchange + "_EQ",
          instrument: "EQUITY",
          oi: false,
          fromDate,
          toDate: today,
        };

        const dhandata = await fetchDhanData(
          payload,
          ENV.BROKER_NAME,
          ENV.DHAN_CLIENT_ID_TWO,
        );

        const { close } = dhandata;

        if (!Array.isArray(close) || close.length === 0) {
          continue;
        }

        // =========================
        // 1) Compute sum of last 199 closes
        // =========================
        const sum199 = sumLastNCandles(close, 199);
        if (sum199 == null) {
          // Not enough data for this stock yet
          continue;
        }

        // =========================
        // 2) Prepare DB update
        // =========================
        const now = new Date();

        const updateDoc = {
          isin,
          security_id: securityId,
          exchange,
          dma_timeframe: "1D",
          dma_199_sum: sum199, // <-- only storing base sum
          updated_at: now,
        };

        bulkOps.push({
          updateOne: {
            filter: { isin, exchange },
            update: { $set: updateDoc },
            upsert: true,
          },
        });
      } catch (err: any) {
        console.error(
          "❌ DMA-199 base sum error for",
          isin,
          err?.response?.data || err,
        );
      }
    }

    if (bulkOps.length > 0) {
      const result = await ScreenerSnapshot.bulkWrite(bulkOps, {
        ordered: false,
      });
      console.log("✅ DMA-199 base sum BulkWrite result:", {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
      });
    }
  } catch (error: any) {
    console.error(
      "❌ Error while computing DMA-199 base sums:",
      error?.response?.data || error,
    );
  } finally {
    console.log("📊 Computing DMA-199 base sum: END", new Date());
  }
};

/**
 * Compute 200 DMA and store in DB
 *
 */
export const compute200DMA = async () => {
  try {
    console.log("📊 Computing 200 DMA: START", new Date());

    // 1) Load base sums
    const snapshots = await ScreenerSnapshot.find()
      .select("isin dma_199_sum last_close_above_dma200")
      .lean();

    if (!snapshots || snapshots.length === 0) {
      console.log("No snapshots found");
      return;
    }

    const isins = snapshots.map((s) => s.isin);

    // 2) Get current prices
    const BATCH_SIZE = 50;

    // Build quick lookup: isin -> current price
    const priceMap = new Map<string, number>();
    for (let i = 0; i < isins.length; i += BATCH_SIZE) {
      const batchISINs = isins.slice(i, i + BATCH_SIZE);
      const stocksGeneralData = await stockCache.getGenerals(batchISINs);
      for (const g of stocksGeneralData) {
        if (g?.isin && typeof g?.current_price === "number") {
          priceMap.set(g.isin, g.current_price);
        }
      }
    }

    const bulkOps: any[] = [];
    const now = new Date();

    for (const snap of snapshots) {
      const { isin, dma_199_sum, last_close_above_dma200 } = snap;

      if (typeof dma_199_sum !== "number") continue;

      const currentPrice = priceMap.get(isin);
      if (typeof currentPrice !== "number") continue;

      // 1) Compute 200 DMA
      const dma200 = (dma_199_sum + currentPrice) / 200;

      // 2) State-based cross detection
      const isAbove = currentPrice > dma200;
      const wasAbove = Boolean(last_close_above_dma200);

      let dmaSignal: "Hit" | null = null;
      let dmaEntry: Date | null = null;

      // Only trigger on REAL cross: below -> above
      if (!wasAbove && isAbove) {
        dmaSignal = "Hit";
        dmaEntry = now;
      }

      const updateDoc: any = {
        dma_200: dma200,
        last_close_above_dma200: isAbove, // store state
        updated_at: now,
      };

      if (dmaSignal) {
        updateDoc.dma_signal = dmaSignal;
        updateDoc.dma_entry = dmaEntry;
      }

      bulkOps.push({
        updateOne: {
          filter: { isin },
          update: { $set: updateDoc },
        },
      });
    }
    if (bulkOps.length > 0) {
      const result = await ScreenerSnapshot.bulkWrite(bulkOps, {
        ordered: false,
      });
      console.log("✅ 200 DMA BulkWrite result:", {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
      });
    }
  } catch (error: any) {
    console.error(
      "❌ Error while computing 200 DMA:",
      error?.response?.data || error,
    );
  } finally {
    console.log("📊 Computing 200 DMA: END", new Date());
  }
};
