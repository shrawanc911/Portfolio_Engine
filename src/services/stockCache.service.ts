import { redis } from "../config/redis";
import { createCronLogger } from "../utils/logger";
import { GeneralData } from "../models/stock/GeneralData.model";
import { TechnicalData } from "../models/stock/TechnicalData.model";
import { FinancialData } from "../models/stock/FinancialData.model";
import { DocumentData } from "../models/stock/DocumentData.model";
import { CorporateActionData } from "../models/stock/CorporateActionData.model";
import mongoose from "mongoose";
import { IndexGeneralData } from "../models/index/IndexGeneralData.model";

const logger = createCronLogger("stock-cache");

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 3600;

// Mapping cache TTL (1 hour)
const MAPPING_CACHE_TTL = 3600;

// Cache key prefixes
const CACHE_PREFIX = "stock";
const INDEX_CACHE_PREFIX = "index";

export interface CachedStockData {
  isin: string;
  general: any | null;
  technical: any | null;
  financial: any | null;
  document: any | null;
  corporateAction: any | null;
  cachedAt: number;
}

export interface CachedIndexData {
  security_id: string;
  general: any | null;
  cachedAt: number;
}

/**
 * Stock Data Cache Service
 * Provides Redis caching layer for all 5 stock data collections
 * with separate keys, sliding expiration, and MongoDB fallback
 */
class StockCacheService {
  // ==================== CACHE KEY GENERATORS ====================

  private getGeneralCacheKey(isin: string): string {
    return `${CACHE_PREFIX}:${isin}:general`;
  }

  private getTechnicalCacheKey(isin: string): string {
    return `${CACHE_PREFIX}:${isin}:technical`;
  }

  private getFinancialCacheKey(isin: string): string {
    return `${CACHE_PREFIX}:${isin}:financial`;
  }

  private getDocumentCacheKey(isin: string): string {
    return `${CACHE_PREFIX}:${isin}:document`;
  }

  private getCorporateActionCacheKey(isin: string): string {
    return `${CACHE_PREFIX}:${isin}:corporateAction`;
  }

  private getIndexCacheKey(secId: string): string {
    return `${INDEX_CACHE_PREFIX}:secid:${secId}`;
  }

  private getSecurityIdCacheKey(securityId: string): string {
    return `${CACHE_PREFIX}:secid:${securityId}`;
  }

  // ==================== SLIDING EXPIRATION HELPER ====================

  /**
   * Get from cache with sliding expiration
   * Resets TTL to CACHE_TTL on every access (keeps hot data alive)
   */
  private async getWithSliding<T>(key: string, ttl: number): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (cached) {
        // Refresh TTL (reset to fixed value, not add)
        await redis.expire(key, ttl);
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error(`Error in getWithSliding for ${key}`, { error });
      return null;
    }
  }

  // ==================== PER-COLLECTION GETTERS ====================

  /**
   * Get general data for a stock by ISIN
   * Uses sliding expiration to keep frequently accessed data alive
   */
  async getGeneral(isin: string): Promise<any | null> {
    const key = this.getGeneralCacheKey(isin);

    // Try cache first with sliding expiration
    const cached = await this.getWithSliding<any>(key, CACHE_TTL);
    if (cached) {
      logger.debug(`Cache HIT for ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS for ${key}`);

    // Fallback to MongoDB
    const data = await GeneralData.findOne({ isin }).lean();
    if (data) {
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    }
    return data;
  }

  /**
   * Get technical data for a stock by ISIN
   */
  async getTechnical(isin: string): Promise<any | null> {
    const key = this.getTechnicalCacheKey(isin);

    const cached = await this.getWithSliding<any>(key, CACHE_TTL);
    if (cached) {
      logger.debug(`Cache HIT for ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS for ${key}`);

    const data = await TechnicalData.findOne({ isin }).lean();
    if (data) {
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    }
    return data;
  }

  /**
   * Get financial data for a stock by ISIN
   */
  async getFinancial(isin: string): Promise<any | null> {
    const key = this.getFinancialCacheKey(isin);

    const cached = await this.getWithSliding<any>(key, CACHE_TTL);
    if (cached) {
      logger.debug(`Cache HIT for ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS for ${key}`);

    const data = await FinancialData.findOne({ isin }).lean();
    if (data) {
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    }
    return data;
  }

  /**
   * Get document data for a stock by ISIN
   */
  async getDocument(isin: string): Promise<any | null> {
    const key = this.getDocumentCacheKey(isin);

    const cached = await this.getWithSliding<any>(key, CACHE_TTL);
    if (cached) {
      logger.debug(`Cache HIT for ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS for ${key}`);

    const data = await DocumentData.findOne({ isin }).lean();
    if (data) {
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    }
    return data;
  }

  /**
   * Get corporate action data for a stock by ISIN
   */
  async getCorporateAction(isin: string): Promise<any | null> {
    const key = this.getCorporateActionCacheKey(isin);

    const cached = await this.getWithSliding<any>(key, CACHE_TTL);
    if (cached) {
      logger.debug(`Cache HIT for ${key}`);
      return cached;
    }

    logger.debug(`Cache MISS for ${key}`);

    const data = await CorporateActionData.findOne({ isin }).lean();
    if (data) {
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    }
    return data;
  }

  // ==================== COMPOSITE GETTERS ====================

  /**
   * Get complete stock data from cache (all 5 collections)
   * Fetches from separate cache keys in parallel
   */
  async getByISIN(isin: string): Promise<CachedStockData | null> {
    try {
      // Fetch all 5 collections in parallel (each with sliding expiration)
      const [general, technical, financial, document, corporateAction] =
        await Promise.all([
          this.getGeneral(isin),
          this.getTechnical(isin),
          this.getFinancial(isin),
          this.getDocument(isin),
          this.getCorporateAction(isin),
        ]);

      // If no data exists at all, return null
      if (
        !general &&
        !technical &&
        !financial &&
        !document &&
        !corporateAction
      ) {
        return null;
      }

      // Also cache security_id mapping if general data exists
      if (general?.security_id) {
        await redis.setex(
          this.getSecurityIdCacheKey(general.security_id),
          MAPPING_CACHE_TTL,
          isin,
        );
      }

      return {
        isin,
        general,
        technical,
        financial,
        document,
        corporateAction,
        cachedAt: Date.now(),
      };
    } catch (error) {
      logger.error(`Error getting stock cache for ${isin}`, { error });
      return null;
    }
  }

  /**
   * Get general data for multiple stocks by ISINs
   */
  async getGenerals(isins: string[]): Promise<(any | null)[]> {
    try {
      if (!isins.length) return [];

      // Generate all cache keys
      const keys = isins.map((isin) => this.getGeneralCacheKey(isin));

      // MGET from Redis
      const cachedValues = await redis.mget(keys);

      // Determine which ISINs missed cache
      const missedIndices: number[] = [];
      const results: (any | null)[] = new Array(isins.length).fill(null);

      cachedValues.forEach((val, idx) => {
        if (val) {
          results[idx] = JSON.parse(val);
        } else {
          missedIndices.push(idx);
        }
      });

      if (missedIndices.length > 0) {
        // Fetch missed from DB
        const missedIsins = missedIndices.map((idx) => isins[idx]);
        const dbDocs = await GeneralData.find({
          isin: { $in: missedIsins },
        }).lean();

        // Create a map for quick lookup
        const dbMap = new Map();
        dbDocs.forEach((doc) => {
          dbMap.set(doc.isin, doc);
        });

        // Fill results and populate cache
        const pipeline = redis.pipeline();

        missedIndices.forEach((idx) => {
          const isin = isins[idx];
          if (!isin) return;

          const doc = dbMap.get(isin);
          if (doc) {
            results[idx] = doc;
            pipeline.setex(
              this.getGeneralCacheKey(isin),
              CACHE_TTL,
              JSON.stringify(doc),
            );
          }
        });

        if (dbDocs.length > 0) {
          await pipeline.exec();
        }
      }

      return results;
    } catch (error) {
      logger.error("Error in getGenerals", { error });
      // Fallback: return empty array or nulls
      return new Array(isins.length).fill(null);
    }
  }

  /**
   * Get stock data by security_id (uses ISIN lookup)
   */
  async getBySecurityId(securityId: string): Promise<CachedStockData | null> {
    try {
      // Check if we have ISIN mapped
      const isin = await redis.get(this.getSecurityIdCacheKey(securityId));

      if (isin) {
        return this.getByISIN(isin);
      }

      // Lookup ISIN from DB
      const general = await GeneralData.findOne({ security_id: securityId })
        .select("isin")
        .lean();

      if (general?.isin) {
        // Cache the mapping
        await redis.setex(
          this.getSecurityIdCacheKey(securityId),
          MAPPING_CACHE_TTL,
          general.isin,
        );
        return this.getByISIN(general.isin);
      }

      return null;
    } catch (error) {
      logger.error(`Error getting stock by security_id ${securityId}`, {
        error,
      });
      return null;
    }
  }

  // ==================== INDEX METHODS ====================

  async getIndexBySecurityId(
    security_id: string,
  ): Promise<CachedIndexData | null> {
    const cacheKey = this.getIndexCacheKey(security_id);
    try {
      const cached = await this.getWithSliding<CachedIndexData>(
        cacheKey,
        CACHE_TTL,
      );

      if (cached) {
        logger.debug(`Cache HIT for index:${security_id}`);
        return cached;
      }

      logger.debug(`Cache MISS for index:${security_id}`);

      const indexGeneral = await IndexGeneralData.findOne({
        security_id,
      }).lean();

      if (!indexGeneral) {
        return null;
      }

      const data: CachedIndexData = {
        security_id,
        general: indexGeneral,
        cachedAt: Date.now(),
      };

      await this.setIndex(security_id, data);
      return data;
    } catch (error) {
      logger.error(`Error getting index cache for ${security_id}`, { error });

      // Try MongoDB on Redis error
      try {
        const general = await IndexGeneralData.findOne({ security_id }).lean();
        if (!general) return null;

        return {
          security_id,
          general,
          cachedAt: Date.now(),
        };
      } catch (mongoError) {
        logger.error(`MongoDB fallback also failed for ${security_id}`, {
          mongoError,
        });
        return null;
      }
    }
  }

  // ==================== SETTERS ====================

  /**
   * Set stock data in cache (stores each collection in separate keys)
   */
  async set(isin: string, data: CachedStockData): Promise<void> {
    try {
      const ops: Promise<string | null>[] = [];

      if (data.general) {
        ops.push(
          redis.setex(
            this.getGeneralCacheKey(isin),
            CACHE_TTL,
            JSON.stringify(data.general),
          ),
        );
      }
      if (data.technical) {
        ops.push(
          redis.setex(
            this.getTechnicalCacheKey(isin),
            CACHE_TTL,
            JSON.stringify(data.technical),
          ),
        );
      }
      if (data.financial) {
        ops.push(
          redis.setex(
            this.getFinancialCacheKey(isin),
            CACHE_TTL,
            JSON.stringify(data.financial),
          ),
        );
      }
      if (data.document) {
        ops.push(
          redis.setex(
            this.getDocumentCacheKey(isin),
            CACHE_TTL,
            JSON.stringify(data.document),
          ),
        );
      }
      if (data.corporateAction) {
        ops.push(
          redis.setex(
            this.getCorporateActionCacheKey(isin),
            CACHE_TTL,
            JSON.stringify(data.corporateAction),
          ),
        );
      }

      await Promise.all(ops);
      logger.debug(`Cached stock:${isin} in ${ops.length} separate keys`);
    } catch (error) {
      logger.error(`Error setting stock cache for ${isin}`, { error });
    }
  }

  async setIndex(security_id: string, data: CachedIndexData): Promise<void> {
    const cacheKey = this.getIndexCacheKey(security_id);

    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
      logger.debug(`Cached index:${security_id} with TTL ${CACHE_TTL}s`);
    } catch (error) {
      logger.error(`Error setting index cache for ${security_id}`, { error });
    }
  }

  // ==================== WARMUP ====================

  /**
   * Initialize secId -> isin mappings in redis
   */
  async warmSecurityIdIsinCache() {
    const cursor = GeneralData.find(
      { security_id: { $exists: true }, isin: { $exists: true } },
      { security_id: 1, isin: 1 },
    ).cursor();
    for await (const doc of cursor) {
      await redis.set(this.getSecurityIdCacheKey(doc.security_id), doc.isin);
    }
    console.log("✅ SecurityId → ISIN cache warmed");
  }

  // ==================== LIVE PRICE UPDATES ====================

  /**
   * Update live price data in cached general data
   * Only updates the general cache key (efficient, doesn't touch other collections)
   */
  async updateLivePrice(
    securityId: string,
    priceData: {
      current_price: number;
      today_net_change: number;
      today_percent_change: number;
      ohlc_close: number;
      ohlc_high: number;
      ohlc_low: number;
    },
  ): Promise<void> {
    try {
      // Get ISIN from security_id mapping
      let isin = await redis.get(this.getSecurityIdCacheKey(securityId));
      if (!isin) {
        const general = await GeneralData.findOne({ security_id: securityId })
          .select("isin")
          .lean();
        if (!general?.isin) return;
        isin = general.isin;
      }

      // Update only general cache (not all 5 collections)
      const key = this.getGeneralCacheKey(isin);
      const cached = await redis.get(key);

      if (!cached) return;
      const generalData = JSON.parse(cached);

      if (!generalData) return;

      if (priceData.current_price !== undefined) {
        generalData.current_price = priceData.current_price;
      }

      if (priceData.today_percent_change) {
        generalData.today_percent_change = priceData.today_percent_change;
      }
      if (priceData.today_net_change) {
        generalData.today_net_change = priceData.today_net_change;
      }
      if (priceData.ohlc_high !== undefined) {
        generalData.today_high = Math.max(
          priceData.ohlc_high,
          generalData.today_high || 0,
        );
      }
      if (priceData.ohlc_low !== undefined) {
        generalData.today_low = Math.min(
          priceData.ohlc_low,
          generalData.today_low || Infinity,
        );
      }

      // Preserve remaining TTL
      const ttl = await redis.ttl(key);
      await redis.setex(
        key,
        ttl > 0 ? ttl : CACHE_TTL,
        JSON.stringify(generalData),
      );
      logger.debug(`Updated live price for stock:${isin}`);
    } catch (error) {
      logger.error(`Error updating live price for ${securityId}`, { error });
    }
  }

  async updateIndexLivePrice(
    securityId: string,
    priceData: {
      current_price: number;
      today_net_change: number;
      today_percent_change: number;
      ohlc_close: number;
      ohlc_high: number;
      ohlc_low: number;
    },
  ): Promise<void> {
    try {
      const cacheKey = this.getIndexCacheKey(securityId);
      const cached = await redis.get(cacheKey);

      if (!cached) return;

      const indexData: CachedIndexData = JSON.parse(cached);

      if (!indexData.general) return;

      if (priceData.current_price !== undefined) {
        indexData.general.current_price = priceData.current_price;
      }
      if (priceData.today_percent_change) {
        indexData.general.today_percent_change = priceData.today_percent_change;
      }
      if (priceData.today_net_change) {
        indexData.general.today_net_change = priceData.today_net_change;
      }
      if (priceData.ohlc_high !== undefined) {
        indexData.general.today_high = Math.max(
          priceData.ohlc_high,
          indexData.general.today_high || 0,
        );
      }
      if (priceData.ohlc_low !== undefined) {
        indexData.general.today_low = Math.min(
          priceData.ohlc_low,
          indexData.general.today_low || Infinity,
        );
      }
      indexData.cachedAt = Date.now();

      // Preserve TTL
      const ttl = await redis.ttl(cacheKey);
      const newTtl = ttl > 0 ? ttl : CACHE_TTL;

      await redis.setex(cacheKey, newTtl, JSON.stringify(indexData));
      logger.debug(`Updated live price for index:${securityId}`);
    } catch (error) {
      logger.error(`Error updating live price for ${securityId}`, { error });
    }
  }

  // ==================== INVALIDATION ====================

  /**
   * Invalidate all cache keys for a stock (called after data update)
   */
  async invalidate(isin: string): Promise<void> {
    try {
      await Promise.all([
        redis.del(this.getGeneralCacheKey(isin)),
        redis.del(this.getTechnicalCacheKey(isin)),
        redis.del(this.getFinancialCacheKey(isin)),
        redis.del(this.getDocumentCacheKey(isin)),
        redis.del(this.getCorporateActionCacheKey(isin)),
      ]);
      logger.debug(`Invalidated all cache keys for stock:${isin}`);
    } catch (error) {
      logger.error(`Error invalidating cache for ${isin}`, { error });
    }
  }

  /**
   * Invalidate a specific collection for a stock
   */
  async invalidateCollection(
    isin: string,
    collection:
      | "general"
      | "technical"
      | "financial"
      | "document"
      | "corporateAction",
  ): Promise<void> {
    try {
      const keyFns = {
        general: this.getGeneralCacheKey,
        technical: this.getTechnicalCacheKey,
        financial: this.getFinancialCacheKey,
        document: this.getDocumentCacheKey,
        corporateAction: this.getCorporateActionCacheKey,
      };
      await redis.del(keyFns[collection].call(this, isin));
      logger.debug(`Invalidated ${collection} cache for stock:${isin}`);
    } catch (error) {
      logger.error(`Error invalidating ${collection} cache for ${isin}`, {
        error,
      });
    }
  }

  /**
   * Invalidate cache by security_id
   */
  async invalidateBySecurityId(securityId: string): Promise<void> {
    try {
      const isin = await redis.get(this.getSecurityIdCacheKey(securityId));
      if (isin) {
        await this.invalidate(isin);
      }
    } catch (error) {
      logger.error(`Error invalidating by security_id ${securityId}`, {
        error,
      });
    }
  }

  /**
   * Invalidate user's portfolio cache
   */
  async invalidateUserPortfolio(
    userId: mongoose.Types.ObjectId,
  ): Promise<void> {
    const cacheKey = `user:${userId}:portfolio`;

    try {
      await redis.del(cacheKey);
      logger.debug(`Invalidated portfolio cache for user:${userId}`);
    } catch (error) {
      logger.error(`Error invalidating portfolio for ${userId}`, { error });
    }
  }

  // ==================== STATS ====================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    generalKeys: number;
    technicalKeys: number;
    financialKeys: number;
    documentKeys: number;
    corporateActionKeys: number;
    mappingKeys: number;
    indexKeys: number;
  }> {
    try {
      const [
        generalKeys,
        technicalKeys,
        financialKeys,
        documentKeys,
        corporateActionKeys,
        mappingKeys,
        indexKeys,
      ] = await Promise.all([
        redis.keys(`${CACHE_PREFIX}:*:general`),
        redis.keys(`${CACHE_PREFIX}:*:technical`),
        redis.keys(`${CACHE_PREFIX}:*:financial`),
        redis.keys(`${CACHE_PREFIX}:*:document`),
        redis.keys(`${CACHE_PREFIX}:*:corporateAction`),
        redis.keys(`${CACHE_PREFIX}:secid:*`),
        redis.keys(`${INDEX_CACHE_PREFIX}:secid:*`),
      ]);

      return {
        generalKeys: generalKeys.length,
        technicalKeys: technicalKeys.length,
        financialKeys: financialKeys.length,
        documentKeys: documentKeys.length,
        corporateActionKeys: corporateActionKeys.length,
        mappingKeys: mappingKeys.length,
        indexKeys: indexKeys.length,
      };
    } catch (error) {
      logger.error("Error getting stock cache stats", { error });
      return {
        generalKeys: 0,
        technicalKeys: 0,
        financialKeys: 0,
        documentKeys: 0,
        corporateActionKeys: 0,
        mappingKeys: 0,
        indexKeys: 0,
      };
    }
  }
}

// Export singleton instance
export const stockCache = new StockCacheService();
