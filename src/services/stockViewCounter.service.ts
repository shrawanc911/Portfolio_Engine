// services/stockViewCounter.service.ts
import { redis } from "../config/redis";
import { StockViewEvent } from "../models/StockViewEvent.model";

/**
 * Warm up Redis counter from MongoDB
 * Runs ONLY if Redis key does not exist
 */
export const warmupStockViewCount = async (isin: string) => {
  const key = `stock:view:isin:${isin}`;

  const exists = await redis.exists(key);
  if (exists) return;

  const count = await StockViewEvent.countDocuments({ isin });
  await redis.set(key, count);
};

/**
 * Atomic increment (HOT PATH)
 */
export const incrementStockView = async (isin: string): Promise<number> => {
  return redis.incr(`stock:view:isin:${isin}`);
};

/**
 * Get current view count
 */
export const getStockViewCount = async (isin: string): Promise<number> => {
  const val = await redis.get(`stock:view:isin:${isin}`);
  return Number(val ?? 0);
};
