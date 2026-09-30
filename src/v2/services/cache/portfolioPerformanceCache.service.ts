import mongoose from "mongoose";
import { createCronLogger } from "../../../utils/logger";
import { redis } from "../../../config/redis";
import dayjs from "dayjs";
import { PortfolioHistoricalData } from "../../models/PortfolioHistoricalData.model";

const logger = createCronLogger("historical-cache");

// TTL in seconds (1 hour)
const CACHE_TTL = 3600;

// Cache key prefix
const CACHE_PREFIX = "portfolio:performance";

// Cache Version
const CACHE_VERSION = "v1";

export interface PortfolioPerformanceDataPoint {
  date: string;
  price: number;
  totalReturns: number;
  todayNetChange: number;
  investedAmount: number;
  todayPercentChange: number;
}

export interface CachedPortfolioPerformanceHistoricalData {
  portfolioId: mongoose.Types.ObjectId;
  chartData: PortfolioPerformanceDataPoint[];
}

/**
 * Portfolio Performance Historical Data Cache Service
 * Provides Redis Caching layer for historical portfolio performance data with mongoDB fallback
 */
class PortfolioPerformanceCacheService {
  /**
   * Generate cache key for a timestamp
   */
  private getTimestampCacheKey(portfolioId: mongoose.Types.ObjectId): string {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${portfolioId}:timestamps`;
  }

  /**
   * Generate cache key for a timestamp
   */
  private getDataCacheKey(portfolioId: mongoose.Types.ObjectId): string {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${portfolioId}:data`;
  }

  /**
   * Save Daily Data to redis as timestamp as sorted set and data as hash
   * @param portfolioId Portfolio id of portfolio performance history data
   * @param timestamps List of dates
   * @param datas Portfolio performance data of daily
   */
  private async saveDailyDataToRedis(
    portfolioId: mongoose.Types.ObjectId,
    timestamps: number[],
    datas: PortfolioPerformanceDataPoint[],
  ) {
    const zsetKey = this.getTimestampCacheKey(portfolioId);
    const hashKey = this.getDataCacheKey(portfolioId);

    try {
      const pipeline = redis.pipeline();

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const data = datas[i];

        if (!ts || data === undefined) continue;

        pipeline.zadd(zsetKey, "NX", ts, ts);
        pipeline.hset(hashKey, ts, JSON.stringify(data));
      }

      pipeline.expire(zsetKey, CACHE_TTL);
      pipeline.expire(hashKey, CACHE_TTL);

      const results = await pipeline.exec();

      if (!results) {
        logger.warn(
          `[saveDailyDataToRedis] Redis pipeline failed ${zsetKey} and ${hashKey}`,
        );
        console.error(
          `[saveDailyDataToRedis] Redis pipeline failed ${zsetKey} and ${hashKey}`,
        );
      }
    } catch (error: any) {
      console.error(
        `[saveDailyDataToRedis] Error while saving ${zsetKey} and ${hashKey}:`,
        error,
      );
    }
  }

  /**
   * Get Daily Data to redis
   * @param portfolioId Portfolio id of portfolio performance history data
   * @param fromDate From date to today like: 2026-01-01 - 2026-02-01
   * @returns Return data as array of portfolio performance data
   */
  private async getDailyDataFromRedis(
    portfolioId: mongoose.Types.ObjectId,
    fromDate: string,
  ): Promise<PortfolioPerformanceDataPoint[] | null> {
    const zsetKey = this.getTimestampCacheKey(portfolioId);
    const hashKey = this.getDataCacheKey(portfolioId);

    const fromTimestamp = dayjs(fromDate).unix();
    try {
      const timestamps = await redis.zrangebyscore(
        zsetKey,
        fromTimestamp,
        "+inf",
      );

      if (!timestamps.length) return null;
      const rawValues = await redis.hmget(hashKey, ...timestamps);

      const dataPoints: PortfolioPerformanceDataPoint[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const raw = rawValues[i];
        if (raw === null || raw === undefined) continue;

        try {
          // ✅ Parse back from JSON string
          const parsed: PortfolioPerformanceDataPoint = JSON.parse(raw);
          dataPoints.push(parsed);
        } catch {
          logger.warn(
            `[getDailyDataFromRedis] Failed to parse data at ts=${timestamps[i]}`,
          );
        }
      }
      return dataPoints;
    } catch (error: any) {
      logger.error("[getDailyDataFromRedis] Redis fetch failed", { error });
      console.error("[getDailyDataFromRedis] Redis fetch failed", { error });
      return null;
    }
  }

  /**
   * Get Daily Data from mongoDB
   * @param portfolioId Portfolio id of portfolio performance history data
   */
  private async getDailyDataFromDB(
    portfolioId: mongoose.Types.ObjectId,
  ): Promise<PortfolioPerformanceDataPoint[] | null> {
    try {
      const mongoData = await PortfolioHistoricalData.find(
        {
          portfolio_id: portfolioId,
        },
        {
          _id: 0,
          date: 1,
          price: 1,
          total_returns: 1,
          today_net_change: 1,
          today_percent_change: 1,
          invested_amount: 1,
        },
      )
        .sort({ date: 1 })
        .lean();
      if (!mongoData || mongoData.length === 0) return null;

      logger.debug(`MongoDB fallback HIT for ${portfolioId}`);

      const chartData: PortfolioPerformanceDataPoint[] = mongoData.map((d) => ({
        date: dayjs(d.date).format("YYYY-MM-DD"),
        price: d.price,
        totalReturns: d.total_returns,
        todayNetChange: d.today_net_change,
        todayPercentChange: d.today_percent_change,
        investedAmount: d.invested_amount,
      }));

      return chartData;
    } catch (error: any) {
      console.error(
        "[getDailyDataFromDB] Error while getting data from mongodb:",
        error,
      );
      return null;
    }
  }

  private async fetchFromDBAndWarmCache(
    portfolioId: mongoose.Types.ObjectId,
    fromDate: string,
  ): Promise<CachedPortfolioPerformanceHistoricalData | null> {
    const datas = await this.getDailyDataFromDB(portfolioId); // no fromDate — warm full cache
    if (!datas) return null;

    const timestamps = datas.map((item) => dayjs(item.date).unix());
    await this.saveDailyDataToRedis(portfolioId, timestamps, datas);

    return {
      portfolioId,
      chartData: datas.filter((item) => item.date >= fromDate),
    };
  }

  /**
   * Get portfolio performance historical data from cache
   * Falls back to MongoDB if Redis cache miss or error
   * @param portfolioId Portfolio id of portfolio performance history data
   * @param fromDate From date to today like: 2026-01-01 - 2026-02-01
   */
  async get(
    portfolioId: mongoose.Types.ObjectId,
    fromDate: string,
  ): Promise<CachedPortfolioPerformanceHistoricalData | null> {
    try {
      // 1. Try Redis First
      const cached = await this.getDailyDataFromRedis(portfolioId, fromDate);

      if (cached) {
        logger.debug(`Cache HIT for ${portfolioId}`);
        return { portfolioId, chartData: cached };
      }

      logger.debug(`Cache MISS for ${portfolioId}`);

      // 2. Fallback to MongoDB
      return await this.fetchFromDBAndWarmCache(portfolioId, fromDate);
    } catch (error: any) {
      console.error(
        `[PortfolioPerformanceCacheService.get] Error getting cache for ${portfolioId}`,
        { error },
      );

      // Try MongoDB on Redis error
      return await this.fetchFromDBAndWarmCache(portfolioId, fromDate);
    }
  }

  /**
   * Set portfolio performance historical point in cach and DB
   */
  async set(
    portfolioId: mongoose.Types.ObjectId,
    data: PortfolioPerformanceDataPoint,
    session?: mongoose.ClientSession,
  ) {
    try {
      if (!mongoose.Types.ObjectId.isValid(portfolioId)) {
        throw new Error("Invalid portfolio_id");
      }

      const zsetKey = this.getTimestampCacheKey(portfolioId);

      // First check wheather data already exist in redis or not
      const count = await redis.zcard(zsetKey);

      const dbOps: any[] = [
        PortfolioHistoricalData.updateOne(
          { portfolio_id: portfolioId, date: data.date },
          {
            $set: {
              price: data.price,
              total_returns: data.totalReturns,
              today_net_change: data.todayNetChange,
              today_percent_change: data.todayPercentChange,
              invested_amount: data.investedAmount,
            },
          },
          { upsert: true, session },
        ),
      ];
      // Redis cache not initialized yet
      if (count) {
        dbOps.push(
          this.saveDailyDataToRedis(
            portfolioId,
            [dayjs(data.date).unix()],
            [data],
          ),
        );
      }
      const result = await Promise.allSettled(dbOps);
      if (result && result[0] && result[0].status === "rejected") {
        console.error(`[set] DB write failed for ${portfolioId}`, {
          reason: result[0].reason,
        });
        throw new Error("DB_WRITE_FAILED");
      }
      if (result && result[1] && result[1].status === "rejected") {
        console.warn(`[set] Cache write failed for ${portfolioId}`, {
          reason: result[1].reason,
        });
      }
    } catch (error: any) {
      logger.error(
        `[PortfolioPerformanceCacheService.set] Failed for ${portfolioId}`,
        { error },
      );
      console.error(
        `[PortfolioPerformanceCacheService.set] Failed for ${portfolioId}`,
        { error },
      );
      if (error === "DB_WRITE_FAILED") {
        throw new Error(error);
      }
    }
  }
}

// Export singleton instance
export const portfolioPerformanceCache = new PortfolioPerformanceCacheService();
