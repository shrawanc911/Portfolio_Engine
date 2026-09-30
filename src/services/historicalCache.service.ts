import { redis } from "../config/redis";
import { createCronLogger } from "../utils/logger";
import HistoricalDataModel from "../models/HistoricalData.model";
import IndexHistoricalDataModel from "../models/index/IndexHistoricalData.model";

const logger = createCronLogger("historical-cache");

// TTL in seconds (1 hour)
const CACHE_TTL = 3600;

// Cache key prefix
const CACHE_PREFIX = "historical";

export interface ChartDataPoint {
  day: string;
  price: number;
}

export interface CachedHistoricalData {
  securityId: string;
  stockExchange: string;
  chartData: ChartDataPoint[];
  cachedAt: number;
}

/**
 * Historical Data Cache Service
 * Provides Redis caching layer for historical stock data with MongoDB fallback
 */
class HistoricalCacheService {
  /**
   * Generate cache key for a security
   */
  private getCacheKey(
    securityId: number | string,
    stockExchange: string
  ): string {
    return `${CACHE_PREFIX}:${securityId}:${stockExchange}`;
  }

  /**
   * Generate index cache key for a security
   */
  private getIndexCacheKey(securityId: number | string): string {
    return `${CACHE_PREFIX}:index:${securityId}`;
  }

  /**
   * Get historical data from cache
   * Falls back to MongoDB if Redis cache miss or error
   */
  async get(
    securityId: number | string,
    stockExchange: string
  ): Promise<CachedHistoricalData | null> {
    const cacheKey = this.getCacheKey(securityId, stockExchange);

    try {
      // 1. Try Redis first
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug(`Cache HIT for ${cacheKey}`);
        return JSON.parse(cached);
      }

      logger.debug(`Cache MISS for ${cacheKey}`);

      // 2. Fallback to MongoDB
      const mongoData = await HistoricalDataModel.findOne({
        security_id: String(securityId),
        stock_exchange: stockExchange,
      }).lean();

      if (mongoData) {
        logger.debug(`MongoDB fallback HIT for ${securityId}`);

        // Update lastAccessedAt (fire and forget)
        HistoricalDataModel.updateOne(
          { security_id: String(securityId) },
          { $set: { lastAccessedAt: new Date() } }
        ).catch(() =>
          logger.error(`Historical Data Update failed secId:${securityId}`)
        );

        const data: CachedHistoricalData = {
          securityId: mongoData.security_id,
          stockExchange: mongoData.stock_exchange,
          chartData: mongoData.chartData,
          cachedAt: Date.now(),
        };

        // Populate Redis cache from MongoDB
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
        logger.debug(`Cached ${cacheKey} with TTL ${CACHE_TTL}s`);

        return data;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting cache for ${cacheKey}`, { error });

      // Try MongoDB on Redis error
      try {
        const mongoData = await HistoricalDataModel.findOne({
          security_id: String(securityId),
          stock_exchange: stockExchange,
        }).lean();

        if (mongoData) {
          return {
            securityId: mongoData.security_id,
            stockExchange: mongoData.stock_exchange,
            chartData: mongoData.chartData,
            cachedAt: Date.now(),
          };
        }
      } catch (mongoError) {
        logger.error(`MongoDB fallback also failed for ${securityId}`, {
          mongoError,
        });
      }

      return null;
    }
  }

  async getIndex(
    securityId: number | string
  ): Promise<CachedHistoricalData | null> {
    const cacheKey = this.getIndexCacheKey(securityId);

    try {
      // 1. Try Redis first
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug(`Cache HIT for ${cacheKey}`);
        return JSON.parse(cached);
      }

      logger.debug(`Cache MISS for ${cacheKey}`);

      // 2. Fallback to MongoDB
      const mongoData = await IndexHistoricalDataModel.findOne({
        security_id: String(securityId),
      }).lean();

      if (mongoData) {
        logger.debug(`MongoDB fallback HIT for ${securityId}`);

        // Update lastAccessedAt (fire and forget)
        IndexHistoricalDataModel.updateOne(
          { security_id: String(securityId) },
          { $set: { lastAccessedAt: new Date() } }
        ).catch(() =>
          logger.error(`Historical Data Update failed secId:${securityId}`)
        );

        const data: CachedHistoricalData = {
          securityId: mongoData.security_id,
          stockExchange: mongoData.stock_exchange,
          chartData: mongoData.chartData,
          cachedAt: Date.now(),
        };

        // Populate Redis cache from MongoDB

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
        logger.debug(`Cached ${cacheKey} with TTL ${CACHE_TTL}s`);

        return data;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting cache for ${cacheKey}`, { error });

      return null;
    }
  }

  /**
   * Set historical data in cache (and MongoDB for persistence)
   */
  async set(
    securityId: number | string,
    stockExchange: string,
    chartData: ChartDataPoint[]
  ): Promise<void> {
    const cacheKey = this.getCacheKey(securityId, stockExchange);

    const data: CachedHistoricalData = {
      securityId: String(securityId),
      stockExchange,
      chartData,
      cachedAt: Date.now(),
    };

    try {
      // 1. Set in Redis with TTL
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
      logger.debug(`Cached ${cacheKey} with TTL ${CACHE_TTL}s`);

      // 2. Also save to MongoDB as fallback (fire and forget)
      HistoricalDataModel.findOneAndUpdate(
        { security_id: String(securityId) },
        {
          $set: {
            stock_exchange: stockExchange,
            chartData: chartData,
          },
        },
        { upsert: true }
      ).catch((err) => {
        logger.warn(`Failed to save to MongoDB for ${securityId}`, {
          error: err.message,
        });
      });
    } catch (error) {
      logger.error(`Error setting cache for ${cacheKey}`, { error });

      // Still try to save to MongoDB even if Redis fails
      try {
        await HistoricalDataModel.findOneAndUpdate(
          { security_id: String(securityId) },
          {
            $set: {
              stock_exchange: stockExchange,
              chartData: chartData,
            },
          },
          { upsert: true }
        );
      } catch (mongoError) {
        logger.error(`MongoDB save also failed for ${securityId}`, {
          mongoError,
        });
      }
    }
  }

  /**
   * Set historical index data in cache (and MongoDB for persistence)
   */
  async setIndex(
    securityId: number | string,
    stockExchange: string,
    chartData: ChartDataPoint[]
  ): Promise<void> {
    const cacheKey = this.getIndexCacheKey(securityId);

    const data: CachedHistoricalData = {
      securityId: String(securityId),
      stockExchange,
      chartData,
      cachedAt: Date.now(),
    };

    try {
      // 1. Set in Redis with TTL
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
      logger.debug(`Cached ${cacheKey} with TTL ${CACHE_TTL}s`);

      // 2. Also save to MongoDB as fallback (fire and forget)
      IndexHistoricalDataModel.findOneAndUpdate(
        { security_id: String(securityId) },
        {
          $set: {
            stock_exchange: stockExchange,
            chartData: chartData,
          },
        },
        { upsert: true }
      ).catch((err) => {
        logger.warn(`Failed to save to MongoDB for ${securityId}`, {
          error: err.message,
        });
      });
    } catch (error) {
      logger.error(`Error setting cache for ${cacheKey}`, { error });

      // Still try to save to MongoDB even if Redis fails
      try {
        await IndexHistoricalDataModel.findOneAndUpdate(
          { security_id: String(securityId) },
          {
            $set: {
              stock_exchange: stockExchange,
              chartData: chartData,
            },
          },
          { upsert: true }
        );
      } catch (mongoError) {
        logger.error(`MongoDB save also failed for ${securityId}`, {
          mongoError,
        });
      }
    }
  }

  /**
   * Update today's price in both Redis and MongoDB
   * Called by cron job to keep historical data in sync with live LTP
   */
  async updateTodayPrice(
    securityId: number | string,
    stockExchange: string,
    latestPrice: number
  ): Promise<void> {
    const cacheKey = this.getCacheKey(securityId, stockExchange);
    const today = new Date().toLocaleDateString("en-GB");

    try {
      // 1. Update Redis if exists
      const cached = await redis.get(cacheKey);

      if (cached) {
        const data: CachedHistoricalData = JSON.parse(cached);

        if (data.chartData.length > 0) {
          const lastEntry = data.chartData[data.chartData.length - 1];

          if (lastEntry && lastEntry.day == today) {
            // Update today's price
            lastEntry.price = latestPrice;
          } else {
            // Add new entry for today
            data.chartData.push({ day: today, price: latestPrice });
          }

          data.cachedAt = Date.now();

          // Get remaining TTL and preserve it
          const ttl = await redis.ttl(cacheKey);
          const newTtl = ttl > 0 ? ttl : CACHE_TTL;

          await redis.setex(cacheKey, newTtl, JSON.stringify(data));
          logger.debug(`Updated Redis price for ${cacheKey}: ${latestPrice}`);
        }
      }

      // 2. Update MongoDB if exists (update today's entry or add new one)
      const mongoData = await HistoricalDataModel.findOne({
        security_id: String(securityId),
        stock_exchange: stockExchange,
      });

      if (mongoData) {
        const lastEntry = mongoData.chartData[mongoData.chartData.length - 1];

        if (lastEntry && lastEntry.day === today) {
          // Update today's price
          await HistoricalDataModel.updateOne(
            { security_id: String(securityId), stock_exchange: stockExchange },
            {
              $set: {
                "chartData.$[elem].price": latestPrice,
                lastAccessedAt: new Date(),
              },
            },
            { arrayFilters: [{ "elem.day": today }] }
          );
        } else {
          // Add new entry for today
          await HistoricalDataModel.updateOne(
            { security_id: String(securityId), stock_exchange: stockExchange },
            {
              $push: { chartData: { day: today, price: latestPrice } },
              $set: { lastAccessedAt: new Date() },
            }
          );
        }
        logger.debug(`Updated MongoDB price for ${securityId}: ${latestPrice}`);
      }
    } catch (error) {
      logger.error(`Error updating today's price for ${cacheKey}`, { error });
    }
  }
  /**
   * Update today's price in both Redis and MongoDB
   * Called by cron job to keep historical data in sync with live LTP
   */
  async updateTodayIndexPrice(
    securityId: number | string,
    latestPrice: number
  ): Promise<void> {
    const cacheKey = this.getIndexCacheKey(securityId);
    const today = new Date().toLocaleDateString("en-GB");

    try {
      // 1. Update Redis if exists
      const cached = await redis.get(cacheKey);

      if (cached) {
        const data: CachedHistoricalData = JSON.parse(cached);

        if (data.chartData.length > 0) {
          const lastEntry = data.chartData[data.chartData.length - 1];

          if (lastEntry && lastEntry.day == today) {
            // Update today's price
            lastEntry.price = latestPrice;
          } else {
            // Add new entry for today
            data.chartData.push({ day: today, price: latestPrice });
          }

          data.cachedAt = Date.now();

          // Get remaining TTL and preserve it
          const ttl = await redis.ttl(cacheKey);
          const newTtl = ttl > 0 ? ttl : CACHE_TTL;

          await redis.setex(cacheKey, newTtl, JSON.stringify(data));
          logger.debug(`Updated Redis price for ${cacheKey}: ${latestPrice}`);
        }
      }

      // 2. Update MongoDB if exists (update today's entry or add new one)
      const mongoData = await IndexHistoricalDataModel.findOne({
        security_id: String(securityId),
      });

      if (mongoData) {
        const lastEntry = mongoData.chartData[mongoData.chartData.length - 1];

        if (lastEntry && lastEntry.day === today) {
          // Update today's price
          await IndexHistoricalDataModel.updateOne(
            { security_id: String(securityId) },
            {
              $set: {
                "chartData.$[elem].price": latestPrice,
                lastAccessedAt: new Date(),
              },
            },
            { arrayFilters: [{ "elem.day": today }] }
          );
        } else {
          // Add new entry for today
          await IndexHistoricalDataModel.updateOne(
            { security_id: String(securityId) },
            {
              $push: { chartData: { day: today, price: latestPrice } },
              $set: { lastAccessedAt: new Date() },
            }
          );
        }
        logger.debug(`Updated MongoDB price for ${securityId}: ${latestPrice}`);
      }
    } catch (error) {
      logger.error(`Error updating today's price for ${cacheKey}`, { error });
    }
  }

  /**
   * Clean up stale historical data from MongoDB
   * Removes records not accessed in the specified time period
   * @param maxAgeMs Maximum age in milliseconds (default: 7 days)
   */
  async cleanupStaleData(
    maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - maxAgeMs);
      const result = await HistoricalDataModel.deleteMany({
        lastAccessedAt: { $lt: cutoffDate },
      });
      logger.info(
        `Cleaned up ${result.deletedCount} stale historical data entries`
      );
      return result.deletedCount;
    } catch (error) {
      logger.error("Error cleaning up stale historical data", { error });
      return 0;
    }
  }

  /**
   * Invalidate cache for a security
   */
  async invalidate(
    securityId: number | string,
    stockExchange: string
  ): Promise<void> {
    const cacheKey = this.getCacheKey(securityId, stockExchange);

    try {
      await redis.del(cacheKey);
      logger.debug(`Invalidated cache for ${cacheKey}`);
    } catch (error) {
      logger.error(`Error invalidating cache for ${cacheKey}`, { error });
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
