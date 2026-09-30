import mongoose from "mongoose";
import { redis } from "../config/redis";
import logger from "../utils/logger";
import { Watchlist } from "../models/Watchlist.model";
import { stockCache } from "./stockCache.service";
import { WatchlistItem } from "../models/WatchlistItem.model";
import {
  WatchlistDTO,
  WatchlistItemDTO,
  WatchlistListCache,
  WatchlistIsinCache,
} from "../interface/watchlist.interface";

/* ============================
   CONSTANTS
============================ */

const CACHE_VERSION = 1;
const WATCHLIST_CACHE_TTL = 3600;

/* ============================
   SERVICE
============================ */

class WatchlistCacheService {
  private getWatchlistListKey(userId: mongoose.Types.ObjectId): string {
    return `watchlist:list:${userId}`;
  }

  private getWatchlistItemsKey(watchlistId: mongoose.Types.ObjectId): string {
    return `watchlist:items:${watchlistId}`;
  }

  private async getWatchlistItemsIsins(
    watchlistId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
  ): Promise<string[]> {
    const cacheKey = this.getWatchlistItemsKey(watchlistId);
    try {
      let isins: string[] = [];
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached) as WatchlistIsinCache;
        // 🔥 Version check - ignore stale cache
        if (parsed.version === CACHE_VERSION) {
          logger.debug(
            `Cache HIT for watchlist items from watchlistID:${watchlistId} of userId:${userId}`,
          );
          isins = parsed.isins;
        }
      }
      if (isins.length === 0) {
        const dbData = await WatchlistItem.find({
          user_id: userId,
          watchlist_id: watchlistId,
        })
          .sort({ createdAt: 1 })
          .select("isin -_id")
          .lean();

        isins = dbData.map((d) => d.isin);

        await redis.set(
          cacheKey,
          JSON.stringify({
            isins,
            version: CACHE_VERSION,
          }),
          "EX",
          WATCHLIST_CACHE_TTL,
        );
      }
      return isins;
    } catch (error: any) {
      logger.error("getWatchlistItemsIsins failed", { error });
      return [];
    }
  }

  private async getFormattedIndexes(
    watchlists: WatchlistDTO[],
    userId: mongoose.Types.ObjectId,
  ): Promise<Record<string, { name: string; stocks: string[] }>> {
    const result: Record<string, { name: string; stocks: string[] }> = {};

    // ⚡ run all in parallel
    await Promise.all(
      watchlists.map(async (wl) => {
        const isins = await this.getWatchlistItemsIsins(
          new mongoose.Types.ObjectId(wl.id),
          userId,
        );

        result[wl.id] = {
          name: wl.name,
          stocks: isins,
        };
      }),
    );
    return result;
  }

  async getWatchlists(
    userId: mongoose.Types.ObjectId,
  ): Promise<Record<string, { name: string; stocks: string[] }>> {
    const cacheKey = this.getWatchlistListKey(userId);
    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached) as WatchlistListCache;

        // 🔥 Version check - ignore stale cache
        if (parsed.version === CACHE_VERSION) {
          logger.debug(`Cache HIT for watchlists of userId:${userId}`);
          const result = await this.getFormattedIndexes(parsed.items, userId);
          return result;
        }
      }
      logger.debug(
        `Fetching watchlist for userId:${userId} from DB with version: ${CACHE_VERSION}`,
      );

      const dbData = await Watchlist.find({ user_id: userId })
        .select("_id name")
        .sort({ createdAt: 1 })
        .lean();

      const items: WatchlistDTO[] = dbData.map((w) => ({
        id: w._id.toString(),
        name: w.name,
      }));

      await redis.set(
        cacheKey,
        JSON.stringify({
          items,
          version: CACHE_VERSION,
        }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );

      logger.debug(`Cache SET for portfolio of userId:${userId}`);
      const result = await this.getFormattedIndexes(items, userId);
      return result;
    } catch (error: any) {
      logger.error(`Error getting watchlist for ${userId}`, { error });
      return {};
    }
  }

  async getWatchlistItems(
    userId: mongoose.Types.ObjectId,
    watchlistId: mongoose.Types.ObjectId,
  ): Promise<WatchlistItemDTO[]> {
    try {
      const isins = await this.getWatchlistItemsIsins(watchlistId, userId);

      // bulk join with stock cache
      const stockData = await stockCache.getGenerals(isins);
      const result: WatchlistItemDTO[] = stockData
        .filter(Boolean)
        .map((stock) => ({
          isin: stock.isin,
          exchange: stock.exchange,
          display_name: stock.display_name,
          underlying_symbol: stock.underlying_symbol,
          image_url: stock.image_url,
          current_price: stock.current_price,
          today_percent_change: stock.today_percent_change,
          market_cap: stock.market_cap,
        }));

      return result;
    } catch (error: any) {
      logger.error("Error in get watchlist items", { error });
      return [];
    }
  }

  async addWatchlistInCache(
    watchlistId: string,
    name: string,
    userId: mongoose.Types.ObjectId,
  ) {
    const cacheKey = this.getWatchlistListKey(userId);
    try {
      const cacheData = await redis.get(cacheKey);
      if (!cacheData) {
        return;
      }
      const data = JSON.parse(cacheData) as WatchlistListCache;
      if (!data.items.some((w) => w.id === watchlistId)) {
        data.items.push({ id: watchlistId, name });
      }

      await redis.set(
        cacheKey,
        JSON.stringify({ items: data.items, version: CACHE_VERSION }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );
      return null;
    } catch (error: any) {
      console.error("Error while adding watchlist in cache", error);
      return null;
    }
  }

  async addStockInWatchlistItems(
    watchlistId: mongoose.Types.ObjectId,
    isin: string,
  ) {
    const cacheKey = this.getWatchlistItemsKey(watchlistId);
    try {
      const cacheData = await redis.get(cacheKey);
      if (!cacheData) {
        return;
      }
      const data = JSON.parse(cacheData) as WatchlistIsinCache;
      if (!data.isins.includes(isin)) {
        data.isins.push(isin);
      }
      await redis.set(
        cacheKey,
        JSON.stringify({ isins: data.isins, version: CACHE_VERSION }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );
      return null;
    } catch (error: any) {
      console.error("Error while adding stock in cache indexes", error);
      return null;
    }
  }

  async removeStockFromWatchlistItems(
    watchlistId: mongoose.Types.ObjectId,
    isin: string,
  ) {
    const cacheKey = this.getWatchlistItemsKey(watchlistId);
    try {
      const cacheData = await redis.get(cacheKey);
      if (!cacheData) {
        return;
      }
      const data = JSON.parse(cacheData) as WatchlistIsinCache;
      const updatedData = data.isins.filter((s: any) => s != isin);
      await redis.set(
        cacheKey,
        JSON.stringify({ isins: updatedData, version: CACHE_VERSION }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );
      return null;
    } catch (error: any) {
      console.error("Error while removing stock from cache indexes", error);
      return null;
    }
  }

  async removeWatchlistFromCache(
    watchlistId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
  ) {
    const cacheKey = this.getWatchlistListKey(userId);
    try {
      const cacheData = await redis.get(cacheKey);
      if (!cacheData) {
        return;
      }
      const data = JSON.parse(cacheData) as WatchlistListCache;
      const updatedData = data.items.filter((w: any) => w.id != watchlistId);
      await redis.set(
        cacheKey,
        JSON.stringify({ items: updatedData, version: CACHE_VERSION }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );
      return null;
    } catch (error: any) {
      console.error("Error while removing stock from cache indexes", error);
      return null;
    }
  }

  async renameWatchlistFromCache(
    watchlistId: mongoose.Types.ObjectId,
    newName: string,
    userId: mongoose.Types.ObjectId,
  ) {
    const cacheKey = this.getWatchlistListKey(userId);
    try {
      const cacheData = await redis.get(cacheKey);
      if (!cacheData) {
        return;
      }
      const data = JSON.parse(cacheData) as WatchlistListCache;
      const updatedData = data.items.map((w: WatchlistDTO) =>
        w.id == watchlistId.toString() ? { ...w, name: newName } : w,
      );
      await redis.set(
        cacheKey,
        JSON.stringify({ items: updatedData, version: CACHE_VERSION }),
        "EX",
        WATCHLIST_CACHE_TTL,
      );
      return null;
    } catch (error: any) {
      console.error("Error while removing stock from cache indexes", error);
      return null;
    }
  }

  async invalidateWatchlists(userId: mongoose.Types.ObjectId) {
    await redis.del(this.getWatchlistListKey(userId));
  }

  async invalidateWatchlistItems(watchlistId: mongoose.Types.ObjectId) {
    await redis.del(this.getWatchlistItemsKey(watchlistId));
  }
}

export const watchlistCache = new WatchlistCacheService();
