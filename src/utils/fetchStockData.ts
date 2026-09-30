// src/utils/fetchStockData.ts
import { fetchDhanData } from "../services/dhan.service";
import { historicalCache } from "../services/historicalCache.service";
import { rateLimiter } from "../services/rateLimiter.service";
import { requestBatcher } from "../services/requestBatcher.service";
import {
  mergeTodayCandle,
  transformToChartDataForDB,
  transformToChartDataForFrontend,
} from "./transformData";
import { createCronLogger } from "./logger";
import { stockCache } from "../services/stockCache.service";
import { DhanPayload } from "../interface/file.interface";
import { ENV } from "../config/env";

const logger = createCronLogger("fetch-stock-data");

export const fetchStockData = async (
  secId: number,
  stockExchange: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    // 1️⃣ Check Redis cache first (with MongoDB fallback)
    const cached = await historicalCache.get(secId, stockExchange);

    if (cached) {
      logger.debug(`Cache hit for ${secId}:${stockExchange}`);
      return {
        securityId: cached.securityId,
        chartData: transformToChartDataForFrontend(cached.chartData),
      };
    }

    logger.debug(`Cache miss for ${secId}:${stockExchange}, fetching from API`);

    // 2️⃣ Use request batcher to deduplicate simultaneous requests
    const result = await requestBatcher.fetch(
      secId,
      stockExchange,
      async () => {
        const payload: DhanPayload = {
          securityId: secId,
          exchangeSegment: stockExchange,
          instrument: "EQUITY",
          oi: false,
          fromDate,
          toDate,
        };

        // 3️⃣ Rate-limited Dhan API call
        const raw = await rateLimiter.execute(() =>
          fetchDhanData(payload, ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_ONE),
        );

        if (!raw || raw.length === 0) {
          return { securityId: secId, chartData: [] };
        }

        const dbChartData = transformToChartDataForDB(raw);

        const live = await stockCache.getBySecurityId(secId.toString());
        const todayPrice = live?.general?.current_price;

        // 3. Merge today
        const merged = mergeTodayCandle(dbChartData, todayPrice);

        // 4. Build frontend chart
        const frontendChartData = transformToChartDataForFrontend(merged);

        // 4️⃣ Cache result in Redis (also saves to MongoDB as fallback)
        await historicalCache.set(secId, stockExchange, merged);

        return { securityId: secId, chartData: frontendChartData };
      },
    );

    return result;
  } catch (error) {
    logger.error(`Error fetching stock data for ${secId}:`, { error });
    return { securityId: secId, chartData: [] };
  }
};
