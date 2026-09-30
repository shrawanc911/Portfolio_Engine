import { redis } from "../../../config/redis";
import { createCronLogger } from "../../../utils/logger";
import { StockHistorical } from "../../models/HistoricalData.model";
import { IndexHistorical } from "../../models/index/IndexHistoricalData.model";
import dayjs from "dayjs";
import {
  getTimeISTFromUnix,
  getTodayDateIST,
} from "../../../utils/indicators/time";
import { stockCache } from "../../../services/stockCache.service";
import { isMarketClosedToday } from "../../../utils/checkHoliday";

const logger = createCronLogger("historical-cache");

// TTL in seconds (1 hour)
const CACHE_TTL = 3600;

// Cache key prefix
const CACHE_PREFIX = "historical";

// Cache Version
const CACHE_VERSION = "v1";

export interface ChartDataPoint {
  date: string;
  close: number;
}

export interface CachedHistoricalData {
  securityId: string | number;
  exchange: string;
  chartData: ChartDataPoint[];
  cachedAt?: number;
}

/**
 * Historical Data Cache Service
 * Provides Redis caching layer for historical stock data with MongoDB fallback
 */
class HistoricalCacheService {
  /**
   * Generate cache key for a timestamp
   */
  private getTimestampCacheKey(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
  ): string {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${exchange == "IDX_I" ? "index" : "stock"}:timestamp:${securityId}:${exchange}`;
  }

  /**
   * Generate cache key for a close prices
   */
  private getCloseCacheKey(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
  ): string {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${exchange == "IDX_I" ? "index" : "stock"}:close:${securityId}:${exchange}`;
  }

  private async saveCandlesToRedis(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
    timestamps: number[],
    closes: number[],
  ) {
    try {
      const zsetKey = this.getTimestampCacheKey(securityId, exchange);
      const hashKey = this.getCloseCacheKey(securityId, exchange);

      const pipeline = redis.pipeline();

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const close = closes[i];

        if (!ts || close === undefined) continue;

        pipeline.zadd(zsetKey, "NX", ts, ts); // ensure sorted timestamp
        pipeline.hset(hashKey, ts, close); // override price if exists
      }

      // ✅ Apply TTL to both keys
      pipeline.expire(zsetKey, CACHE_TTL);
      pipeline.expire(hashKey, CACHE_TTL);

      const results = await pipeline.exec();

      if (!results) {
        logger.warn("Redis pipeline failed", { securityId, exchange });
        console.error("Redis pipeline failed", { securityId, exchange });
      }
    } catch (error: any) {
      console.error(
        "[saveCandlesToRedis] Error while saving sorted set of stock historical data:",
        error,
      );
    }
  }

  private async getChartDataFromRedis(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
    fromDate: string,
  ): Promise<CachedHistoricalData | null> {
    const zsetKey = this.getTimestampCacheKey(securityId, exchange);
    const hashKey = this.getCloseCacheKey(securityId, exchange);

    const fromTimestamp = dayjs(fromDate).unix();

    try {
      const timestamps = await redis.zrangebyscore(
        zsetKey,
        fromTimestamp,
        "+inf",
      );
      if (!timestamps.length) return null;
      const prices = await redis.hmget(hashKey, ...timestamps);

      const chartData = [];
      for (let i = 0; i < timestamps.length; i++) {
        const price = prices[i];

        if (price === null) continue;

        chartData.push({
          date: dayjs.unix(Number(timestamps[i])).format("YYYY-MM-DD"),
          close: Number(price),
        });
      }

      return {
        securityId,
        exchange,
        chartData,
      };
    } catch (error) {
      logger.error("[getChartDataFromRedis] Redis chart fetch failed", {
        securityId,
        exchange,
        error,
      });
      return null;
    }
  }

  /**
   * Get Chart data from mongoDB
   * @param securityId Security id of stock
   * @param exchange Exchange segment of stock
   */
  private async getChartDataFromDB(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
  ): Promise<any> {
    try {
      let mongoData = null;
      if (exchange === "IDX_I") {
        mongoData = await IndexHistorical.find(
          {
            "meta.security_id": String(securityId),
            "meta.exchange": exchange,
          },
          {
            _id: 0,
            date: 1,
            close: 1,
          },
        )
          .sort({ date: 1 })
          .lean();
      } else {
        mongoData = await StockHistorical.find(
          {
            "meta.security_id": String(securityId),
            "meta.exchange": exchange,
          },
          {
            _id: 0,
            date: 1,
            close: 1,
          },
        )
          .sort({ date: 1 })
          .lean();
      }

      if (!mongoData || mongoData.length === 0) return null;

      logger.debug(`MongoDB fallback HIT for ${securityId}`);

      const chartData = mongoData.map((d) => ({
        date: dayjs(d.date).format("YYYY-MM-DD"),
        close: d.close,
      }));

      const data: CachedHistoricalData = {
        securityId: securityId,
        exchange: exchange,
        chartData: chartData,
      };
      return data;
    } catch (error: any) {
      console.error(
        "[getChartDataFromDB] Error while getting chartdata from mongodb:",
        error,
      );
      return null;
    }
  }

  /**
   * Get historical data from cache
   * Falls back to MongoDB if Redis cache miss or error
   * @param securityId Security id of stock
   * @param exchange Exchange segment of stock
   * @param fromDate From date to today like: 2026-01-01 - 2026-02-01
   */
  async get(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
    fromDate: string,
  ): Promise<CachedHistoricalData | null> {
    try {
      // 1. Try Redis first
      const cached = await this.getChartDataFromRedis(
        securityId,
        exchange,
        fromDate,
      );

      if (cached) {
        logger.debug(`Cache HIT for ${securityId}`);
        return cached;
      }

      logger.debug(`Cache MISS for ${securityId}`);

      // 2. Fallback to MongoDB
      const data = await this.getChartDataFromDB(securityId, exchange);

      if (!data) return null;

      const todayDate = getTodayDateIST();
      const lastCandle = data.chartData[data.chartData.length - 1];
      const lastCandleDate = lastCandle?.date;
      // merge today's candle if missing
      if (todayDate !== lastCandleDate && !isMarketClosedToday()) {
        try {
          let live;
          if (exchange === "IDX_I") {
            live = await stockCache.getIndexBySecurityId(securityId.toString());
          } else {
            live = await stockCache.getBySecurityId(securityId.toString());
          }
          const todayPrice = live?.general?.current_price;

          if (todayPrice !== undefined && todayPrice !== null) {
            data.chartData.push({ date: todayDate, close: todayPrice });

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

      let timestamps: number[] = [];
      let closes: number[] = [];
      for (const item of data.chartData) {
        timestamps.push(dayjs(item.date).unix());
        closes.push(item.close);
      }

      await this.saveCandlesToRedis(securityId, exchange, timestamps, closes);

      return {
        ...data,
        chartData: data.chartData.filter((item: any) => item.date >= fromDate),
      };
    } catch (error) {
      logger.error(`Error getting cache for ${securityId}`, { error });
      console.error(`Error getting cache for ${securityId}`, { error });

      // Try MongoDB on Redis error
      const data = await this.getChartDataFromDB(securityId, exchange);
      if (!data) return null;

      let timestamps: number[] = [];
      let closes: number[] = [];
      for (const item of data.chartData) {
        timestamps.push(dayjs(item.date).unix());
        closes.push(item.close);
      }
      await this.saveCandlesToRedis(securityId, exchange, timestamps, closes);

      return {
        ...data,
        chartData: data.chartData.filter((item: any) => item.date >= fromDate),
      };
    }
  }

  /**
   * Set historical data in cache (and MongoDB for persistence)
   */
  async set(
    securityId: string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
    dhandata: { timestamp: number[]; close: number[] },
    isin?: string,
  ): Promise<void> {
    try {
      if (dhandata.timestamp.length !== dhandata.close.length) {
        throw new Error("Timestamp and close arrays length mismatch");
      }

      const bulkOps: any[] = [];
      for (let i = 0; i < dhandata.timestamp.length; i++) {
        const timestamp = dhandata.timestamp[i];
        const close = dhandata.close[i];

        if (!timestamp || close === undefined || close === null) continue;

        const { date } = getTimeISTFromUnix(timestamp);

        const meta: any = {
          security_id: securityId,
          exchange,
        };

        if (exchange !== "IDX_I") {
          meta.isin = isin;
        }

        bulkOps.push({
          insertOne: {
            document: {
              meta,
              date: date,
              close: close,
            },
          },
        });
      }

      if (bulkOps.length === 0) {
        console.warn(
          `⚠️ No valid candle data found for ${securityId}:${exchange}`,
        );
        return;
      }

      if (exchange === "IDX_I") {
        const result = await IndexHistorical.bulkWrite(bulkOps, {
          ordered: false,
        });

        console.info("Saved index candles", result.insertedCount);
      } else {
        const result = await StockHistorical.bulkWrite(bulkOps, {
          ordered: false,
        });

        console.info("Saved stock candles", result.insertedCount);
      }
      bulkOps.length = 0;
    } catch (error: any) {
      console.error(
        `❌ Error saving candle data for ${securityId}:${exchange}`,
        {
          message: error.message,
          stack: error.stack,
        },
      );
    }
  }

  /**
   * Update today's price in both Redis and MongoDB
   * Called by cron job to keep historical data in sync with live LTP
   * @param securityId Security id of stock
   * @param exchange Exchange segment of stock given by dhan
   * @param latestPrice LTP of stock
   */
  async updateTodayPrice(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
    latestPrice: number,
  ): Promise<void> {
    try {
      const zsetKey = this.getTimestampCacheKey(securityId, exchange);

      // First check wheather data already exist in redis or not
      const count = await redis.zcard(zsetKey);

      // Redis cache not initialized yet
      if (!count) return;
      const today = getTodayDateIST();
      const timestamp = dayjs(today).unix();

      await this.saveCandlesToRedis(
        securityId,
        exchange,
        [timestamp],
        [latestPrice],
      );
    } catch (error) {
      logger.error(`Error updating today's price for ${securityId}`, { error });
    }
  }

  /**
   * Final LTP Call Update in Redis and DB
   * Called by cron job to keep historical data in sync with live LTP at the end of the day
   */
  async finalLTPCallStock(): Promise<any> {
    try {
      const isins = await StockHistorical.distinct("meta.isin");
      console.log("Fetched from DB:", isins.length);
      const date = getTodayDateIST();
      const today = getTodayDateIST();
      const timestamp = dayjs(today).unix();

      const BATCH_SIZE = 400;

      for (let i = 0; i < isins.length; i += BATCH_SIZE) {
        try {
          const slicedIsins = isins.slice(i, i + BATCH_SIZE);
          const stocks = await stockCache.getGenerals(slicedIsins);
          console.log(`Batch ${i / BATCH_SIZE + 1} | Stocks: ${stocks.length}`);

          // Step 1: Saari keys ek baar mein prepare karo
          const exchangeMap = { NSE: "NSE_EQ", BSE: "BSE_EQ" } as const;

          console.log("Stocks valid?", !stocks?.length);
          const stockMeta = stocks
            .filter((stock) => stock) // remove null/undefined
            .map((stock) => {
              return {
                meta: {
                  securityId: stock.security_id,
                  isin: stock.isin,
                  exchange:
                    exchangeMap[stock.exchange as "NSE" | "BSE"] || "NSE_EQ",
                },
                close: stock.current_price,
                date,
              };
            });
          console.log("StockMeta created:", stockMeta.length);

          // Step 2: Saare zcard ek saath — parallel
          const zcardResults = await Promise.all(
            stockMeta.map(({ meta }) =>
              redis.zcard(
                this.getTimestampCacheKey(meta.securityId, meta.exchange),
              ),
            ),
          );
          // Step 3: Redis writes — sirf jinka count > 0 hai
          await Promise.all(
            stockMeta.map(({ meta, close }, idx) => {
              if (!zcardResults[idx]) return Promise.resolve(); // skip
              return this.saveCandlesToRedis(
                meta.securityId,
                meta.exchange,
                [timestamp],
                [close],
              );
            }),
          );

          // // Step 4: MongoDB bulkWrite
          const bulkOps = stockMeta.map(({ meta, close, date }) => ({
            insertOne: {
              document: {
                meta: {
                  security_id: meta.securityId,
                  exchange: meta.exchange,
                  isin: meta.isin,
                },
                date,
                close,
              },
            },
          }));
          const result = await StockHistorical.bulkWrite(bulkOps);
          console.log(
            `Batch ${i / BATCH_SIZE + 1} inserted: ${result.insertedCount}`,
          );
        } catch (e) {
          console.error("CRASH DETAILS:", e);
        }
      }

      console.log("All batches complete!");
      return null;
    } catch (error) {
      logger.error(`Error updating today's price:`, { error });
    }
  }
  async finalLTPCallIndex(): Promise<any> {
    try {
      const securityIds = ["13", "25", "51", "27"];
      const today = getTodayDateIST();
      const timestamp = dayjs(today).unix();

      const bulkIndex: any[] = [];

      for (const securityId of securityIds) {
        try {
          bulkIndex.push(stockCache.getIndexBySecurityId(securityId));
        } catch (e) {
          console.error("[finalLTPCallIndex] CRASH DETAILS:", e);
        }
      }

      const indexDatas = await Promise.allSettled(bulkIndex);
      const indexMetaData = indexDatas
        .filter((indexdata) => indexdata.status === "fulfilled")
        .map((data: any) => ({
          meta: {
            securityId: data.value.security_id,
            exchange: "IDX_I" as "IDX_I",
          },
          close: data.value.general.current_price,
          date: today,
        }));

      const zcardResults = await Promise.allSettled(
        indexMetaData.map(({ meta }) =>
          redis.zcard(
            this.getTimestampCacheKey(meta.securityId, meta.exchange),
          ),
        ),
      );

      await Promise.allSettled(
        indexMetaData.map(({ meta, close }, idx) => {
          if (!zcardResults[idx]) return Promise.resolve(); // skip
          return this.saveCandlesToRedis(
            meta.securityId,
            meta.exchange,
            [timestamp],
            [close],
          );
        }),
      );
      const bulkOps = indexMetaData.map(({ meta, close, date }) => ({
        insertOne: {
          document: {
            meta: {
              security_id: meta.securityId,
              exchange: meta.exchange,
            },
            date,
            close,
          },
        },
      }));
      const result = await IndexHistorical.bulkWrite(bulkOps);
      console.log(`Index inserted: ${result.insertedCount}`);
      return null;
    } catch (error) {
      logger.error(`[finalLTPCallIndex] Error updating today's price:`, {
        error,
      });
    }
  }

  /**
   * Invalidate cache for a security
   */
  async invalidate(
    securityId: number | string,
    exchange: "NSE_EQ" | "BSE_EQ" | "IDX_I",
  ): Promise<void> {
    const timestampCacheKey = this.getTimestampCacheKey(securityId, exchange);
    const closeCacheKey = this.getCloseCacheKey(securityId, exchange);

    try {
      await Promise.all([
        redis.del(timestampCacheKey),
        redis.del(closeCacheKey),
      ]);
      logger.debug(
        `Invalidated cache for timestamp cache:${timestampCacheKey} and close cache:${closeCacheKey}`,
      );
    } catch (error) {
      logger.error(
        `Error invalidating cache for ${timestampCacheKey} and ${closeCacheKey}`,
        { error },
      );
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ totalKeys: number; memoryUsage: string }> {
    try {
      const keys = await redis.keys(`${CACHE_PREFIX}:*`);
      const info = await redis.info("memory");

      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage =
        memoryMatch && memoryMatch[1] ? memoryMatch[1] : "unknown";

      return {
        totalKeys: keys.length,
        memoryUsage,
      };
    } catch (error) {
      logger.error("Error getting cache stats", { error });
      return { totalKeys: 0, memoryUsage: "unknown" };
    }
  }
}

// Export singleton instance
export const historicalCache = new HistoricalCacheService();
