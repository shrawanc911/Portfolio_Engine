import dayjs from "dayjs";
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

const logger = createCronLogger("index-historical-data");

export const getIndexHistoryData = async (
  secId: number,
  fromDate: string = "1900-01-01",
) => {
  const indexExchange = "IDX_I";

  try {
    // 1️⃣ Check Redis cache first (with MongoDB fallback)
    const cached = await historicalCache.getIndex(secId);

    if (cached) {
      logger.debug(`Cache hit for index ${secId}`);
      const fullData = transformToChartDataForFrontend(cached.chartData);

      const filterDate = dayjs(fromDate);
      const filtered = fullData.filter((item: any) => {
        if (!item.day) return false;
        const [d, m, y] = item.day.split("/");
        const itemDate = dayjs(`${y}-${m}-${d}`);
        return itemDate.isAfter(filterDate) || itemDate.isSame(filterDate);
      });

      return {
        securityId: cached.securityId,
        chartData: filtered,
      };
    }

    logger.debug(`Cache miss for index ${secId}, fetching from API`);

    // 2️⃣ Use request batcher to deduplicate simultaneous requests
    const result = await requestBatcher.fetch(
      secId,
      indexExchange,
      async () => {
        const toDate = dayjs().format("YYYY-MM-DD");
        const fetchFromDate: string = "1900-01-01"; // Always fetch full history for cache

        const payload: DhanPayload = {
          securityId: secId,
          exchangeSegment: indexExchange,
          instrument: "INDEX",
          oi: false,
          fromDate: fetchFromDate,
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

        const live = await stockCache.getIndexBySecurityId(secId.toString());
        const todayPrice = live?.general?.current_price;
        const exchange = live?.general?.stockExchange;
        // 3. Merge today
        const merged = mergeTodayCandle(dbChartData, todayPrice);

        // 4. Build frontend chart
        const frontendChartData = transformToChartDataForFrontend(merged);

        // 4️⃣ Cache result in Redis (also saves to MongoDB as fallback)
        await historicalCache.setIndex(secId, exchange, merged);

        const filterDate = dayjs(fromDate);
        const filtered = frontendChartData.filter((item: any) => {
          if (!item.day) return false;
          const [d, m, y] = item.day.split("/");
          const itemDate = dayjs(`${y}-${m}-${d}`);
          return itemDate.isAfter(filterDate) || itemDate.isSame(filterDate);
        });

        return { securityId: secId, chartData: filtered };
      },
    );

    return result;
  } catch (err: any) {
    logger.error("Error while getting index history data:", {
      error: err.message,
    });
    return { securityId: secId, chartData: [] };
  }
};
