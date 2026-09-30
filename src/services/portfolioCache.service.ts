import mongoose from "mongoose";
import { redis } from "../config/redis";
import { createCronLogger } from "../utils/logger";
import HoldingModel from "../models/Holding.model";
import { PortfolioAnalysis } from "../models/PortfolioAnalysis.model";
import { createEmptyCategory, safePercent } from "../helper/portfolio.helper";
import PortfolioModel from "../models/Portfolio.model";

const logger = createCronLogger("portfolio-cache");

// 🔥 Cache version - bump this when schema changes
const CACHE_VERSION = 1;

// TTL in seconds
const PORTFOLIO_CACHE_TTL = 600; // 10 minutes

/**
 * Typed cache schema for safe handling
 */
export interface PortfolioData {
  available: boolean;
  portfolioData?: any;
  holdings?: any[];
  portfolioAnalysis?: any;
}

export interface PortfolioCacheData extends PortfolioData {
  version: number;
  updatedAt: number;
}

export interface ConnectedPortfolio {
  id: string;
  broker: string;
  current_value: number;
  invested_amount: number;
}

export interface PortfoliosIndex {
  data: ConnectedPortfolio[];
  version?: number;
  updatedAt?: number;
}

class PortfolioCacheService {
  /**
   * Generate cache key for a portfolio by portfolioId
   */
  private getCacheKey(portfolioId: mongoose.Types.ObjectId): string {
    return `portfolio:cache:${portfolioId}`;
  }

  private getConnectedPortfoliosKey(userId: mongoose.Types.ObjectId): string {
    return `user:${userId}:portfolioIndex`;
  }

  async getPortfolioById(
    portfolioId: mongoose.Types.ObjectId,
  ): Promise<PortfolioCacheData | null> {
    const cacheKey = this.getCacheKey(portfolioId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached) as PortfolioCacheData;

        // 🔥 Version check - ignore stale cache
        if (data.version !== CACHE_VERSION) {
          logger.debug(
            `Cache version mismatch for portfolioId:${portfolioId} (cached: ${data.version}, current: ${CACHE_VERSION})`,
          );
          return null;
        }

        logger.debug(`Cache HIT for portfolio of portfolioId:${portfolioId}`);
        return data;
      }
      logger.debug(`Cache MISS for portfolio of portfolioId:${portfolioId}`);
      return null;
    } catch (err: any) {
      logger.error(`Error getting portfolio cache for ${portfolioId}`, { err });
      return null;
    }
  }

  async getConnectedPortfoliosByUserId(
    userId: mongoose.Types.ObjectId,
  ): Promise<PortfoliosIndex | null> {
    const cacheKey = this.getConnectedPortfoliosKey(userId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached) as PortfoliosIndex;

        // 🔥 Version check - ignore stale cache
        if (data.version !== CACHE_VERSION) {
          logger.debug(
            `Cache version mismatch for userId:${userId} (cached: ${data.version}, current: ${CACHE_VERSION})`,
          );
          return null;
        }

        logger.debug(`Cache HIT for portfolio index of userId:${userId}`);
        return data;
      }
      logger.debug(`Cache MISS for portfolio index of userId:${userId}`);
      return null;
    } catch (err: any) {
      logger.error(`Error getting portfolio index cache for ${userId}`, {
        err,
      });
      return null;
    }
  }

  async setPortfolioById(
    portfolioId: mongoose.Types.ObjectId,
    data: Omit<PortfolioCacheData, "version" | "updatedAt">,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(portfolioId);
    try {
      const cacheData: PortfolioCacheData = {
        ...data,
        version: CACHE_VERSION,
        updatedAt: Date.now(),
      };

      await redis.set(
        cacheKey,
        JSON.stringify(cacheData),
        "EX",
        PORTFOLIO_CACHE_TTL,
      );

      logger.debug(`Cache SET for portfolio of portfolioId:${portfolioId}`);
    } catch (error) {
      logger.error(`Error setting portfolio for ${portfolioId}`, { error });
    }
  }

  async setConnectedPortfoliosByUserId(
    userId: mongoose.Types.ObjectId,
    data: Omit<PortfoliosIndex, "version" | "updatedAt">,
  ): Promise<void> {
    const cacheKey = this.getConnectedPortfoliosKey(userId);
    try {
      const cacheData: PortfoliosIndex = {
        ...data,
        version: CACHE_VERSION,
        updatedAt: Date.now(),
      };

      await redis.set(
        cacheKey,
        JSON.stringify(cacheData),
        "EX",
        PORTFOLIO_CACHE_TTL,
      );

      logger.debug(`Cache SET for portfolio index of userId:${userId}`);
    } catch (error) {
      logger.error(`Error setting portfolio index for ${userId}`, { error });
    }
  }

  /**
   * Invalidate cache (use for DELETE operations only)
   */
  async invalidatePortfolioById(
    portfolioId: mongoose.Types.ObjectId,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(portfolioId);
    try {
      await redis.del(cacheKey);
      logger.debug(`Cache INVALIDATED for portfolioId:${portfolioId}`);
    } catch (error) {
      logger.error(`Error deleting portfolio for ${portfolioId}`, { error });
    }
  }

  /**
   * 🔥 Write-through: Refresh cache by fetching from DB
   * Use this after write operations when you don't have all the data readily available
   */
  async refreshPortfolioCache(
    portfolioId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
  ): Promise<boolean> {
    try {
      const portfolioData = await PortfolioModel.findOne({
        _id: portfolioId,
        user_id: userId,
      }).lean();

      if (!portfolioData) {
        await this.setPortfolioById(portfolioId, { available: false });
        return false;
      }

      const portfolio_id = portfolioData._id;

      const [portfolioAnalysis, holdingData] = await Promise.all([
        PortfolioAnalysis.findOne({ portfolio_id }).lean(),
        HoldingModel.find({ portfolio_id }).lean(),
      ]);

      const today_percent_change = !portfolioData.previous_day_close
        ? 0
        : ((portfolioData.today_net_change ?? 0) /
            portfolioData.previous_day_close) *
          100;

      const unrealizedPnl =
        portfolioData.current_value - portfolioData.invested_amount;
      const unrealizedPnlPercent = safePercent(
        portfolioData.total_returns || 0,
        portfolioData.invested_amount || 0,
      );

      const cacheData = {
        available: true,
        portfolioData: {
          ...portfolioData,
          unrealizedPnl,
          unrealizedPnlPercent,
          today_percent_change,
        },
        holdings: holdingData,
        portfolioAnalysis,
      };

      await this.setPortfolioById(portfolioId, cacheData);
      logger.info(
        `Cache REFRESHED (write-through) for portfolioId:${portfolioId}`,
      );
      return true;
    } catch (err: any) {
      logger.error(`Error refreshing portfolio cache for ${portfolioId}`, {
        error: err.message,
      });
      return false;
    }
  }

  /**
   * 🔥 Write-through: Update connected portfolio if available in cache otherwise fetch from db then add in cache
   */
  async updateConnectedPortfolioCache(
    userId: mongoose.Types.ObjectId,
    data: {
      id: string;
      broker: string;
      current_value: number;
      invested_amount: number;
    },
  ): Promise<void> {
    try {
      const cacheData = await this.getConnectedPortfoliosByUserId(userId);
      if (cacheData) {
        let isAvailable = false;
        const updatedData = cacheData.data.map(
          (portfolio: ConnectedPortfolio) => {
            if (data.id == portfolio.id) {
              isAvailable = true;
              return {
                id: data.id,
                broker: data.broker,
                current_value: data.current_value,
                invested_amount: data.invested_amount,
              };
            }
            return { ...portfolio };
          },
        );
        if (!isAvailable) {
          updatedData.push(data);
        }
        await this.setConnectedPortfoliosByUserId(userId, {
          data: updatedData,
        });
        return;
      }
      const portfolios = await PortfolioModel.find({ user_id: userId });
      const response: ConnectedPortfolio[] = portfolios.map((portfolio) => ({
        id: portfolio._id as unknown as string,
        broker: portfolio.broker,
        current_value: portfolio.current_value,
        invested_amount: portfolio.invested_amount,
      }));

      await this.setConnectedPortfoliosByUserId(userId, { data: response });
    } catch (error: any) {
      console.error("Error while updating connected portfolio cache:", error);
    }
  }

  /**
   * 🔥 Remove portfolio from connectedPortfolio Cache
   */
  async removeConnectedPortfolioCache(
    userId: mongoose.Types.ObjectId,
    portfolioId: string,
  ): Promise<void> {
    try {
      const cacheData = await this.getConnectedPortfoliosByUserId(userId);
      if (cacheData) {
        const updatedCacheData = cacheData.data.filter(
          (portfolio: ConnectedPortfolio) => portfolio.id != portfolioId,
        );
        await this.setConnectedPortfoliosByUserId(userId, {
          data: updatedCacheData,
        });
      }
    } catch (error) {
      console.error(
        "Error while removing connected portfolio from cache",
        error,
      );
    }
  }

  async getBulkPortfolios(portfolioIds: any[]) {
    const cacheKeys = portfolioIds.map((portfolioId: any) =>
      this.getCacheKey(portfolioId),
    );
    try {
      const portfoliosCache = await redis.mget(cacheKeys);
      return portfoliosCache.map((portfolio: any) => {
        if (!portfolio) {
          return null;
        }
        const jsonData = JSON.parse(portfolio);
        return {
          _id: jsonData.portfolioData._id,
          invested_amount: jsonData.portfolioData.invested_amount,
          broker: jsonData.portfolioData.broker,
        };
      });
    } catch (error: any) {
      console.error(`Error while getting bulk portfolios from cache:${error}`);
      return [];
    }
  }
}

export const portfolioCache = new PortfolioCacheService();
