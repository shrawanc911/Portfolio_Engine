import { Job } from "bullmq";
import HoldingModel from "../../models/Holding.model";
import PortfolioModel from "../../models/Portfolio.model";
import PortfolioUpdatesModel from "../../models/PortfolioUpdates.model";
import { addNewDataToPortfolioHistory } from "../../utils/updatePortfolioPerformance";
import { portfolioCache } from "../../services/portfolioCache.service";
import {
  processHoldings,
  processManualHoldings,
  processResyncHoldings,
} from "../../services/processPortfolio.Service";
import { InputHolding } from "../../interface/file.interface";
import mongoose from "mongoose";
import { portfolioPerformanceCache } from "../../v2/services/cache/portfolioPerformanceCache.service";
import { getTodayDateIST } from "../../utils/indicators/time";

export const handleManualEditOrResync = async (job: Job) => {
  const { holdings, portfolioId, userId } = job.data as {
    holdings: InputHolding[];
    portfolioId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
  };
  try {
    console.log("Handling manual edit or resync");
    if (holdings.length === 0) {
      await HoldingModel.deleteMany({ portfolio_id: portfolioId });

      await PortfolioModel.findByIdAndUpdate(portfolioId, {
        $set: {
          previous_day_close: 0,
          today_net_change: 0,
          today_percent_change: 0,
          total_returns: 0,
          current_value: 0,
          invested_amount: 0,
        },
      });

      await PortfolioUpdatesModel.create({
        user_id: userId,
        portfolio_id: portfolioId,
        stocks: [],
      });

      await Promise.allSettled([
        addNewDataToPortfolioHistory(portfolioId.toString(), 0, 0, 0, 0, 0, 0),
        portfolioPerformanceCache.set(portfolioId, {
          date: getTodayDateIST(),
          price: 0,
          totalReturns: 0,
          todayNetChange: 0,
          todayPercentChange: 0,
          investedAmount: 0,
        }),
      ]);

      await portfolioCache.refreshPortfolioCache(portfolioId, userId);

      return { success: true, message: "Portfolio reset (no holdings)" };
    }

    const result = await processResyncHoldings(
      holdings,
      portfolioId,
      userId,
      job,
    );
    if (result.success) {
      // Invalidate user's portfolio cache
      await portfolioCache.refreshPortfolioCache(portfolioId, userId);
      return result;
    } else {
      throw new Error(`Dhan resync processing failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(userId, "Error while handleManualEditOrResync:", err.message);
    return err;
  }
};
export const handleManualStocks = async (job: Job) => {
  const { holdings, portfolioId, userId } = job.data as {
    holdings: InputHolding[];
    portfolioId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
  };
  try {
    console.log("Handling manual stocks");
    const result = await processManualHoldings(
      holdings,
      portfolioId,
      userId,
      job,
    );
    if (result && result.success) {
      await Promise.all([
        portfolioCache.refreshPortfolioCache(portfolioId, userId),
        portfolioCache.updateConnectedPortfolioCache(userId, {
          id: portfolioId.toString(),
          broker: "MANUAL",
          current_value: result.metrics?.currentValue ?? 0,
          invested_amount: result.metrics?.investedAmount ?? 0,
        }),
      ]);
      return result;
    } else {
      throw new Error(`Manual stock processing failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(userId, "Error while handleManualStocks:", err.message);
    return err;
  }
};
export const handleDhanStocks = async (job: Job) => {
  const { holdings, portfolioId, userId } = job.data as {
    holdings: InputHolding[];
    portfolioId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
  };
  try {
    console.log("Handling dhan stocks");
    const result = await processHoldings(holdings, portfolioId, userId, job);
    if (result && result.success) {
      await Promise.all([
        portfolioCache.refreshPortfolioCache(portfolioId, userId),
        portfolioCache.updateConnectedPortfolioCache(userId, {
          id: portfolioId.toString(),
          broker: "DHAN",
          current_value: result.metrics?.currentValue ?? 0,
          invested_amount: result.metrics?.investedAmount ?? 0,
        }),
      ]);
      return result;
    } else {
      throw new Error(`Manual stock processing failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(userId, "Error while handleDhanStocks:", err.message);
    return err;
  }
};
