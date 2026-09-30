import { addNewDataToPortfolioHistory } from "../utils/updatePortfolioPerformance";
import portfolioModel from "../models/Portfolio.model";
import type { Job } from "bullmq";

import PortfolioUpdatesModel from "../models/PortfolioUpdates.model";
import { saveHoldingsBulk } from "../utils/holding";
import { InputHolding } from "../interface/file.interface";
import mongoose from "mongoose";
import { stockCache } from "./stockCache.service";
import { addPortfolioAnalysis } from "../helper/portfolioAnalysis.helper";
import HoldingModel from "../models/Holding.model";
import { portfolioPerformanceCache } from "../v2/services/cache/portfolioPerformanceCache.service";
import { getTodayDateIST } from "../utils/indicators/time";

export async function addNewPortfolioUpdate(
  holdings: InputHolding[],
  portfolio_id: mongoose.Types.ObjectId,
  user_id: mongoose.Types.ObjectId,
) {
  try {
    const isins = holdings.map((h) => h.isin);
    const stocksData = await stockCache.getGenerals(isins);
    const stockMap = new Map();
    stocksData.forEach((s) => {
      if (s) stockMap.set(s.isin, s);
    });

    const stocks = [];

    for (const holding of holdings) {
      const stock = stockMap.get(holding.isin);
      if (stock) {
        stocks.push({
          isin: holding.isin,
          security_id: stock?.security_id,
          display_name: stock?.display_name,
          instrument_type: stock?.instrument_type,
          quantity: holding?.quantity || 0,
          average_buy_price: holding?.average_buy_price || 0,
          buy_value: holding?.buy_value || 0,
        });
      }
    }

    const portfolioUpdate = new PortfolioUpdatesModel({
      portfolio_id,
      user_id,
      stocks,
    });

    await portfolioUpdate.save();
  } catch (err: any) {
    console.error("Error while adding new updates:", err);
  }
}

export const processPortfolio = async (
  holdings: InputHolding[],
  portfolioId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  metrics: any,
  job?: Job,
) => {
  try {
    let todayNetChange = 0;
    let totalReturns = 0;
    let currentValue = 0;
    let investedAmount = 0;
    let previousDayValue = 0;

    if (job) await job.updateProgress(50);

    await addNewPortfolioUpdate(holdings, portfolioId, userId);

    if (job) await job.updateProgress(70);

    // Calculate totals
    todayNetChange = metrics.ODR;
    currentValue = metrics.CV;
    investedAmount = metrics.BV;
    previousDayValue = metrics.PDV;

    totalReturns = currentValue - investedAmount;
    const todayPercentChange =
      previousDayValue > 0 ? (todayNetChange / previousDayValue) * 100 : 0;

    // Update portfolio
    const portfolio = await portfolioModel.findById(portfolioId);
    if (portfolio) {
      portfolio.previous_day_close = previousDayValue;
      portfolio.current_value = currentValue;
      portfolio.today_net_change = todayNetChange;
      portfolio.invested_amount = investedAmount;
      portfolio.total_returns = totalReturns;
      portfolio.today_percent_change = todayPercentChange;

      await portfolio.save();

      // Add history
      await Promise.allSettled([
        addNewDataToPortfolioHistory(
          portfolioId.toString(),
          currentValue,
          totalReturns,
          todayNetChange,
          investedAmount,
          0,
          0, // xirr
        ),
        portfolioPerformanceCache.set(portfolioId, {
          date: getTodayDateIST(),
          price: currentValue,
          totalReturns: totalReturns,
          todayNetChange: todayNetChange,
          todayPercentChange: todayPercentChange,
          investedAmount: investedAmount,
        }),
      ]);
    }

    if (job) await job.updateProgress(90);

    const analysisResult = await addPortfolioAnalysis(portfolioId);

    if (job) await job.updateProgress(100);
    return {
      success: true,
      metrics: {
        currentValue: currentValue,
        investedAmount: investedAmount,
        totalReturns: totalReturns,
      },
      analysisResult,
    };
  } catch (err: any) {
    console.error("Manual stock processing failed ❌", err.message);
    console.timeEnd("TotalManualProcessing");
    return { success: false, error: err };
  }
};

export const processHoldings = async (
  holdings: InputHolding[],
  portfolioId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  job?: Job,
) => {
  try {
    if (job) await job.updateProgress(10);
    // Use bulk write
    const metrics = await saveHoldingsBulk(holdings, portfolioId);
    const portfolioResponse = await processPortfolio(
      holdings,
      portfolioId,
      userId,
      metrics,
      job,
    );
    return portfolioResponse;
  } catch (err) {
    console.error("Manual stock processing failed ❌", err);
    console.timeEnd("TotalManualProcessing");
    return { success: false, error: err };
  }
};

export const processResyncHoldings = async (
  newHoldings: InputHolding[],
  portfolioId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  job?: Job,
) => {
  try {
    if (job) await job.updateProgress(10);

    const oldHoldings = await HoldingModel.find({ portfolio_id: portfolioId });

    const oldMap = new Map<string, InputHolding>();

    for (const h of oldHoldings) {
      oldMap.set(h.isin, h);
    }

    const newIsinSet = new Set(newHoldings.map((h) => h.isin));

    const holdingsToDelete = oldHoldings.filter((h) => !newIsinSet.has(h.isin));
    const isinsToDelete = holdingsToDelete.map((h) => h.isin);

    await HoldingModel.deleteMany({
      portfolio_id: portfolioId,
      isin: { $in: isinsToDelete },
    });

    // Use bulk write
    const metrics = await saveHoldingsBulk(newHoldings, portfolioId);

    const portfolioResponse = await processPortfolio(
      newHoldings,
      portfolioId,
      userId,
      metrics,
      job,
    );

    return portfolioResponse;
  } catch (err) {
    console.error("Manual stock processing failed ❌", err);
    return { success: false, error: err };
  }
};

export const processManualHoldings = async (
  holdings: InputHolding[],
  portfolioId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  job?: Job,
) => {
  try {
    if (job) await job.updateProgress(10);

    const dbHoldings = await HoldingModel.find({ portfolio_id: portfolioId });

    const map = new Map<string, InputHolding>();
    for (const h of holdings) {
      map.set(h.isin, { ...h });
    }

    for (const h of dbHoldings) {
      if (map.has(h.isin)) {
        const existing = map.get(h.isin)!;

        const totalQty = existing.quantity + h.quantity;
        const totalBuyValue = existing.buy_value + h.buy_value;
        map.set(h.isin, {
          isin: h.isin,
          quantity: totalQty,
          buy_value: totalBuyValue,
          average_buy_price: totalQty > 0 ? totalBuyValue / totalQty : 0,
        });
      } else {
        map.set(h.isin, {
          isin: h.isin,
          quantity: h.quantity,
          buy_value: h.buy_value,
          average_buy_price: h.average_buy_price,
        });
      }
    }

    const mergedArray = Array.from(map.values());

    // Use bulk write
    const metrics = await saveHoldingsBulk(mergedArray, portfolioId);

    const portfolioResponse = await processPortfolio(
      mergedArray,
      portfolioId,
      userId,
      metrics,
      job,
    );

    return portfolioResponse;
  } catch (err) {
    console.error("Manual stock processing failed ❌", err);
    console.timeEnd("TotalManualProcessing");
    return { success: false, error: err };
  }
};
