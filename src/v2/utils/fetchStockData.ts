// src/utils/fetchStockData.ts
import { fetchDhanData } from "../../services/dhan.service";
import {
  CachedHistoricalData,
  historicalCache,
} from "../services/cache/historicalCache.service";
import { rateLimiter } from "../../services/rateLimiter.service";
import { requestBatcher } from "../../services/requestBatcher.service";
import { createCronLogger } from "../../utils/logger";
import { stockCache } from "../../services/stockCache.service";
import { DhanPayload } from "../../interface/file.interface";
import { ENV } from "../../config/env";
import {
  getTimeISTFromUnix,
  getTodayDateIST,
} from "../../utils/indicators/time";
import dayjs from "dayjs";
import { isMarketClosedToday } from "../../utils/checkHoliday";

const logger = createCronLogger("fetch-stock-data");

export const fetchStockData = async (
  securityId: number,
  exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
  fromDate: string,
  isin?: string,
): Promise<CachedHistoricalData | null> => {
  try {
    const toDate = getTodayDateIST();

    // 1️⃣ Check Redis cache first (with MongoDB fallback)
    const cached = await historicalCache.get(securityId, exchange, fromDate);

    if (cached) {
      return cached;
    }

    logger.debug(`Cache miss for ${securityId}:${exchange}, fetching from API`);
    // 2️⃣ Use request batcher to deduplicate simultaneous requests
    const result = await requestBatcher.fetch(
      securityId,
      exchange,
      async () => {
        const payload: DhanPayload = {
          securityId: securityId,
          exchangeSegment: exchange,
          instrument: exchange === "IDX_I" ? "INDEX" : "EQUITY",
          oi: false,
          fromDate: getFromDateByPeriod("ALL"),
          toDate,
        };
        let raw;
        // 3️⃣ Rate-limited Dhan API call
        try {
          raw = await rateLimiter.execute(() =>
            fetchDhanData(payload, ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_TWO),
          );
        } catch (error: any) {
          logger.error(`Dhan API failed for ${securityId}`, { error });

          return {
            securityId,
            exchange,
            chartData: [],
          };
        }

        if (
          !raw ||
          !raw.timestamp ||
          !raw.close ||
          raw.timestamp.length === 0
        ) {
          logger.warn(`No historical data returned for ${securityId}`);
          return {
            securityId: securityId,
            exchange: exchange,
            chartData: [],
          };
        }

        await historicalCache.set(securityId.toString(), exchange, raw, isin);

        // get last candle
        const lastCandleTimestamp = raw.timestamp[raw.timestamp.length - 1];

        if (!lastCandleTimestamp) {
          logger.warn(`Invalid last candle timestamp for ${securityId}`);
          console.log(`Invalid last candle timestamp for ${securityId}`);
          return {
            securityId: securityId,
            exchange: exchange,
            chartData: [],
          };
        }

        const todayDate = getTodayDateIST(); // Get today date
        const lastCandle = getTimeISTFromUnix(lastCandleTimestamp);
        const lastCandleDate = lastCandle?.date;

        // merge today's candle if missing
        if (todayDate !== lastCandleDate && !isMarketClosedToday()) {
          try {
            let live;
            if (exchange === "IDX_I") {
              live = await stockCache.getIndexBySecurityId(
                securityId.toString(),
              );
            } else {
              live = await stockCache.getBySecurityId(securityId.toString());
            }

            const todayPrice = live?.general?.current_price;

            if (todayPrice !== undefined && todayPrice !== null) {
              const todayTimestamp = Math.floor(Date.now() / 1000);

              raw.close.push(todayPrice);
              raw.timestamp.push(todayTimestamp);

              logger.debug(`Merged today's candle for ${securityId}`);
            } else {
              logger.warn(`Live price missing for ${securityId}`);
            }
          } catch (err) {
            logger.error(`Failed to merge today's candle for ${securityId}`, {
              err,
            });
          }
        }

        const filtered = filterChartDataByPeriod(raw, fromDate);
        raw.close.length = 0;
        raw.high.length = 0;
        raw.low.length = 0;
        raw.timestamp.length = 0;
        raw.open.length = 0;
        raw.volume.length = 0;

        return {
          securityId: securityId,
          exchange: exchange,
          chartData: filtered,
        };
      },
    );
    return result;
  } catch (error) {
    logger.error(`Error fetching stock data for ${securityId}:`, { error });
    return {
      securityId: securityId,
      exchange: exchange,
      chartData: [],
    };
  }
};

export const getFromDateByPeriod = (period: string) => {
  let fromDate: string;

  switch (period?.toUpperCase()) {
    case "1M":
      fromDate = dayjs().subtract(1, "month").format("YYYY-MM-DD");
      break;

    case "6M":
      fromDate = dayjs().subtract(6, "month").format("YYYY-MM-DD");
      break;

    case "1Y":
      fromDate = dayjs().subtract(1, "year").format("YYYY-MM-DD");
      break;

    case "3Y":
      fromDate = dayjs().subtract(3, "year").format("YYYY-MM-DD");
      break;

    case "5Y":
      fromDate = dayjs().subtract(5, "year").format("YYYY-MM-DD");
      break;

    case "ALL":
    default:
      fromDate = "1900-01-01";
  }
  return fromDate;
};

export const filterChartDataByPeriod = (
  raw: { timestamp: number[]; close: number[] },
  fromDate: string,
) => {
  const fromTimestamp = dayjs(fromDate).unix();

  const startIndex = binarySearchStartIndex(raw.timestamp, fromTimestamp);

  const chartData = raw.timestamp
    .slice(startIndex)
    .map((ts: number, index: number) => {
      const close = raw.close[startIndex + index];

      if (!ts || close === undefined) return null;

      const { date } = getTimeISTFromUnix(ts);

      return { date, close };
    })
    .filter((item): item is { date: string; close: number } => item !== null);

  return chartData;
};

// utils/binarySearch.ts
export const binarySearchStartIndex = (
  timestamps: number[],
  fromTimestamp: number,
) => {
  let left = 0;
  let right = timestamps.length - 1;
  let result = timestamps.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const ts = timestamps[mid];
    if (ts === undefined) {
      right = mid - 1;
      continue;
    }
    if (ts >= fromTimestamp) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return result;
};
