import axios from "axios";
import { GeneralData } from "../models/stock/GeneralData.model";
import { historicalCache } from "../services/historicalCache.service";
import { historicalCache as historicalCachev2 } from "../v2/services/cache/historicalCache.service";
import { stockCache } from "../services/stockCache.service";
import { createCronLogger } from "./logger";
import { updatePortfolios } from "./updatePortfolios";
import { getDhanHeaders } from "../services/dhan.service";
import { IndexGeneralData } from "../models/index/IndexGeneralData.model";
import {
  fetchCorporateActionsDataByISIN,
  fetchDocumentDataByISIN,
  fetchFinancialDataByISIN,
  fetchTechnicalDataByISIN,
} from "./indianAPIFetching";
import { TechnicalData } from "../models/stock/TechnicalData.model";
import { FinancialData } from "../models/stock/FinancialData.model";
import { mapFinancialData } from "../mappers/financial.mapper";
import { addDays } from "../services/stockUpsert.service";
import { DocumentData } from "../models/stock/DocumentData.model";
import { mapDocumentData } from "../mappers/document.mapper";
import { CorporateActionData } from "../models/stock/CorporateActionData.model";
import { mapCorporateActionsData } from "../mappers/corporateActions.mapper";
import { sleep } from "./sleep";
import { ENV } from "../config/env";
import { refreshDhanToken } from "../services/dhanTokenManager.service";

const stockLogger = createCronLogger("stock-updater");

interface DhanLTPResponse {
  data: {
    NSE_EQ?: Record<string, { last_price: number; ohlc: OHLC }>;
    NSE_FNO?: Record<string, { last_price: number; ohlc: OHLC }>;
    BSE_EQ?: Record<string, { last_price: number; ohlc: OHLC }>;
    IDX_I?: Record<string, { last_price: number; ohlc: OHLC }>;
  };
}

interface OHLC {
  open: number;
  close: number;
  high: number;
  low: number;
}

export const updateLTPofStocks = async (): Promise<void> => {
  try {
    const startTime = new Date().toISOString();
    console.log(`[${startTime}] Starting LTP update job`);
    stockLogger.info("Starting LTP update job");

    const stocks = await GeneralData.find()
      .select("security_id exchange previous_day_close")
      .lean();

    if (!stocks || stocks.length === 0) {
      console.log(
        `[${startTime}] No stocks found for LTP update - skipping job`,
      );
      stockLogger.warn("No stocks found for LTP update - skipping job");
      return;
    }

    stockLogger.info("Fetched stocks for LTP update", {
      stockCount: stocks.length,
    });

    const prevCloseMap = new Map<string, number>();
    const nseIds: string[] = [];
    const bseIds: string[] = [];

    for (const s of stocks) {
      if (!s.security_id) continue;
      if (typeof s.previous_day_close === "number") {
        prevCloseMap.set(String(s.security_id), s.previous_day_close);
      }
      if (s.exchange === "NSE") nseIds.push(s.security_id);
      else if (s.exchange === "BSE") bseIds.push(s.security_id);
    }
    stocks.length = 0;

    console.log(`[INFO] NSE=${nseIds.length}, BSE=${bseIds.length}`);

    let totalUpdated = 0;

    totalUpdated += await processBatchDhan(
      nseIds,
      "NSE",
      "NSE_EQ",
      prevCloseMap,
    );

    if (global.gc) global.gc(); // run with --expose-gc flag

    totalUpdated += await processBatchDhan(
      bseIds,
      "BSE",
      "BSE_EQ",
      prevCloseMap,
    );

    if (global.gc) global.gc(); // run with --expose-gc flag

    console.log("[DONE] DHAN live stock price sync completed");
  } catch (err) {
    console.error("[updateLTPofStocks] DHAN price updation failed:", err);
  }
};

export const updateLTPofIndexes = async (): Promise<void> => {
  try {
    const startTime = new Date().toISOString();
    console.log(`[${startTime}] Starting LTP update job for index`);
    stockLogger.info("Starting LTP update job for index");

    const indexes = await IndexGeneralData.find()
      .select("security_id previous_day_close")
      .lean();

    if (!indexes || indexes.length === 0) {
      console.log(
        `[${startTime}] No indexes found for LTP update - skipping job`,
      );
      stockLogger.warn("No indexes found for LTP update - skipping job");
      return;
    }

    stockLogger.info("Fetched indexes for LTP update", {
      stockCount: indexes.length,
    });

    const prevCloseMap = new Map<string, number>();
    const idxIds: string[] = []; // ["13", "25", "51"];

    for (const i of indexes) {
      if (!i.security_id) continue;
      if (typeof i.previous_day_close === "number") {
        prevCloseMap.set(String(i.security_id), i.previous_day_close);
      }
      idxIds.push(i.security_id);
    }

    // Releasing stocks memory
    indexes.length = 0;

    console.log(`[INFO] IDX=${idxIds.length}`);

    let totalUpdated = 0;

    totalUpdated += await processIndexBatchDhan(idxIds, prevCloseMap);
    console.log("[DONE] DHAN live index price sync completed");
  } catch (err) {
    console.error("[updateLTPofIndexes] DHAN price updation failed:", err);
  }
};

async function processBatchDhan(
  securityIds: string[],
  exchange: "NSE" | "BSE",
  segment: "NSE_EQ" | "BSE_EQ",
  prevCloseMap: Map<string, number>,
) {
  const BATCH_SIZE = 200;
  let updated = 0;
  console.log("Batch Size:", BATCH_SIZE);
  for (let i = 0; i < securityIds.length; i += BATCH_SIZE) {
    const batch = securityIds.slice(i, i + BATCH_SIZE);

    console.log(`[FETCH] ${segment} batch ${i / BATCH_SIZE + 1}`);

    const apiRes = await callDhanWithRetry({
      [segment]: batch.map(Number),
    });

    if (!apiRes) continue;

    const dataMap = apiRes?.data?.data?.[segment];
    // 🔥 Dereference immediately after extracting what you need
    apiRes.data = null;
    (apiRes as any).config = null; // 🔥 axios holds request config with buffer refs
    (apiRes as any).request = null; // 🔥 holds the ClientRequest object

    if (!dataMap || typeof dataMap !== "object") continue;

    const bulkOps: any[] = [];
    const historicalUpdates: Promise<void>[] = [];
    const historicalUpdatesv2: Promise<void>[] = [];
    const stockLTPUpdates: Promise<void>[] = [];

    for (const [securityId, data] of Object.entries<any>(dataMap)) {
      if (!data) continue;

      const prevClose = prevCloseMap.get(String(securityId));

      const { last_price, ohlc } = data;

      const todayNetChange =
        typeof prevClose === "number" ? last_price - prevClose : 0;

      const todayPercentChange =
        typeof prevClose === "number" && prevClose !== 0
          ? ((last_price - prevClose) / prevClose) * 100
          : 0;

      const updateDoc: any = {
        $set: {
          current_price: last_price,
          today_net_change: todayNetChange,
          today_percent_change: todayPercentChange,
          lastFetchedAt: new Date(),
        },
        $max: {
          today_high: ohlc.high,
          year_high: ohlc.high,
        },
      };

      if (ohlc.low !== 0) {
        updateDoc.$min = {
          today_low: ohlc.low,
          year_low: ohlc.low,
        };
      }
      bulkOps.push({
        updateOne: {
          filter: {
            security_id: String(securityId),
            exchange,
          },
          update: updateDoc,
        },
      });

      stockLTPUpdates.push(
        stockCache.updateLivePrice(String(securityId), {
          current_price: last_price,
          today_net_change: todayNetChange,
          today_percent_change: todayPercentChange,
          ohlc_close: ohlc.close,
          ohlc_high: ohlc.high,
          ohlc_low: ohlc.low,
        }),
      );

      // Update historical data if cached (fire and forget, non-blocking)
      historicalUpdates.push(
        historicalCache.updateTodayPrice(securityId, segment, last_price),
      );
      historicalUpdatesv2.push(
        historicalCachev2.updateTodayPrice(securityId, segment, last_price),
      );
    }

    if (bulkOps.length) {
      const result = await GeneralData.bulkWrite(bulkOps, {
        ordered: false,
      });
      updated += result.modifiedCount;
    }
    bulkOps.length = 0;

    // Wait for historical updates to complete (parallel execution)
    await Promise.allSettled(historicalUpdates);
    historicalUpdates.length = 0;
    
    await Promise.allSettled(historicalUpdatesv2);
    historicalUpdatesv2.length = 0;

    await Promise.allSettled(stockLTPUpdates);
    stockLTPUpdates.length = 0;
  }

  return updated;
}
async function processIndexBatchDhan(
  securityIds: string[],
  prevCloseMap: Map<string, number>,
) {
  const BATCH_SIZE = 250;
  let updated = 0;
  const segment = "IDX_I";

  console.log("INDEX Batch Size:", BATCH_SIZE);
  for (let i = 0; i < securityIds.length; i += BATCH_SIZE) {
    const batch = securityIds.slice(i, i + BATCH_SIZE);

    console.log(`[FETCH] ${segment} batch ${i / BATCH_SIZE + 1}`);

    const apiRes = await callDhanWithRetry({
      [segment]: batch.map(Number),
    });

    if (!apiRes) continue;

    const dataMap = apiRes?.data?.data?.[segment];
    // 🔥 Dereference immediately after extracting what you needs
    apiRes.data = null;
    (apiRes as any).config = null; // 🔥 axios holds request config with buffer refs
    (apiRes as any).request = null; // 🔥 holds the ClientRequest object

    if (!dataMap || typeof dataMap !== "object") continue;

    const bulkOps: any[] = [];
    const historicalUpdates: Promise<void>[] = [];
    const historicalUpdatesv2: Promise<void>[] = [];
    const indexLTPUpdates: Promise<void>[] = [];

    for (const [securityId, data] of Object.entries<any>(dataMap)) {
      if (!data) continue;
      const { last_price, ohlc } = data;
      const prevClose = prevCloseMap.get(String(securityId));

      const todayNetChange =
        typeof prevClose === "number" ? last_price - prevClose : 0;

      const todayPercentChange =
        typeof prevClose === "number" && prevClose !== 0
          ? ((last_price - prevClose) / prevClose) * 100
          : 0;

      const updateDoc: any = {
        $set: {
          current_price: last_price,
          today_net_change: todayNetChange,
          today_percent_change: todayPercentChange,
        },
        $max: {
          today_high: ohlc.high,
          year_high: ohlc.high,
        },
      };

      if (ohlc.low !== 0) {
        updateDoc.$min = {
          today_low: ohlc.low,
          year_low: ohlc.low,
        };
      }

      bulkOps.push({
        updateOne: {
          filter: {
            security_id: securityId,
          },
          update: updateDoc,
        },
      });
      indexLTPUpdates.push(
        stockCache.updateIndexLivePrice(securityId, {
          current_price: last_price,
          today_net_change: todayNetChange,
          today_percent_change: todayPercentChange,
          ohlc_close: ohlc.close,
          ohlc_high: ohlc.high,
          ohlc_low: ohlc.low,
        }),
      );

      // Update historical data if cached (fire and forget, non-blocking)
      historicalUpdates.push(
        historicalCache.updateTodayIndexPrice(securityId, last_price),
      );
      historicalUpdatesv2.push(
        historicalCachev2.updateTodayPrice(securityId, "IDX_I", last_price),
      );
    }

    if (bulkOps.length) {
      const result = await IndexGeneralData.bulkWrite(bulkOps, {
        ordered: false,
      });
      updated += result.modifiedCount;
    }
    bulkOps.length = 0;

    // Wait for historical updates to complete (parallel execution)
    await Promise.allSettled(historicalUpdates);
    historicalUpdates.length = 0;

    await Promise.allSettled(historicalUpdatesv2);
    historicalUpdatesv2.length = 0;

    await Promise.allSettled(indexLTPUpdates);
    indexLTPUpdates.length = 0;
  }

  return updated;
}

export async function callDhanWithRetry(payload: any, retries = 3) {
  try {
    const headers = await getDhanHeaders(
      ENV.BROKER_NAME,
      ENV.DHAN_CLIENT_ID_ONE,
    );

    if (!headers) {
      console.log("Headers are null");
      return;
    }
    return await axios.post("https://api.dhan.co/v2/marketfeed/ohlc", payload, {
      headers: headers,
    });
  } catch (err: any) {
    // 🔥 Handle 401 Unauthorized - reload from shared file
    if (err.response?.status === 401) {
      stockLogger.warn("⚠️ Dhan Auth 401 in LTP update. Reloading token...");
      // await dhanTokenManager.reloadTokenFromFile();
      await refreshDhanToken(ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_ONE);
      // Retry immediately once on auth error if we have retries left
      if (retries > 0) {
        return callDhanWithRetry(payload, retries - 1);
      }
    }

    if (err.response?.status === 429 && retries > 0) {
      console.warn("⚠️ DHAN rate limited, retrying in 2s...");
      await sleep(2000); // 🔥 REQUIRED
      return callDhanWithRetry(payload, retries - 1);
    }
    throw err;
  }
}

export const updateStocksDetail = async (isin: string): Promise<any> => {
  try {
    const data = await fetchTechnicalDataByISIN(isin);
    const financial = await fetchFinancialDataByISIN(isin);
    const document = await fetchDocumentDataByISIN(isin);
    const corporate = await fetchCorporateActionsDataByISIN(isin);

    const now = new Date();
    await FinancialData.updateOne(
      { isin },
      {
        $set: {
          ...mapFinancialData(isin, financial),
          lastFetchedAt: now,
          validTill: addDays(90),
          status: "fresh",
        },
      },
      { upsert: true },
    );

    await DocumentData.updateOne(
      { isin },
      {
        $set: {
          ...mapDocumentData(isin, document),
          lastFetchedAt: now,
          validTill: addDays(30),
          status: "fresh",
        },
      },
      { upsert: true },
    );
    await CorporateActionData.updateOne(
      { isin },
      {
        $set: {
          ...mapCorporateActionsData(isin, corporate),
          lastFetchedAt: now,
          validTill: addDays(30),
          status: "fresh",
        },
      },
      { upsert: true },
    );
    await TechnicalData.updateOne(
      { isin: isin },
      { $set: data?.technical },
      { upsert: true },
    );
    await GeneralData.updateOne(
      { isin: isin },
      { $set: data?.general },
      { upsert: true },
    );
    // return data?.technical;
    return corporate;
  } catch (err: any) {
    throw err;
  }
};
