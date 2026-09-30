import { Response } from "express";
import HoldingModel from "../models/Holding.model";
import { PortfolioAnalysis } from "../models/PortfolioAnalysis.model";
import disconnectedPortfolioModel from "../models/DisconnectedPortfolio.model";
import mongoose from "mongoose";
import { AuthenticatedRequest } from "../interface/file.interface";
import { safePercent } from "../helper/portfolio.helper";
import {
  portfolioCache,
  ConnectedPortfolio,
} from "../services/portfolioCache.service";
import { PortfolioViewEvent } from "../models/PortfolioViewEvent.model";
import PortfolioModel from "../models/Portfolio.model";
import { BrokerMetaData } from "../models/BrokerMetaData.model";

export const getPortfolioData = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user_id = req.user?.userId;
  const id = req.params.id;
  try {
    // 1. Validation
    if (!user_id || !id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid portfolio id" });
    }

    PortfolioViewEvent.create({
      user_id,
      event: "portfolio",
    }).catch((err) => {
      console.error("Event log failed", err);
    });
    console.log(`Portfolio fetching userId:${user_id} and portfolioId:${id}`);

    // 2. Cache Check
    const objectId = new mongoose.Types.ObjectId(id);
    try {
      const cache = await portfolioCache.getPortfolioById(objectId);

      if (cache) {
        if (cache.available) {
          return res.status(200).json({
            success: true,
            message: "Portfolio fetched from cache",
            portfolio: cache.portfolioData,
            holdings: cache.holdings,
            portfolioAnalysis: cache.portfolioAnalysis,
          });
        } else {
          return res
            .status(404)
            .json({ success: false, error: "Portfolio not found" });
        }
      }
    } catch (cacheErr) {
      console.warn("Cache read failed:", cacheErr);
      // Continue to DB if cache fails
    }

    // 3. Database Fetch
    const portfolioData = await PortfolioModel.findOne({
      _id: id,
      user_id: user_id,
    }).lean();

    if (!portfolioData) {
      // Cache the "not found" state
      await portfolioCache.setPortfolioById(objectId, { available: false });
      return res
        .status(404)
        .json({ success: false, error: "Portfolio not found" });
    }

    const portfolio_id = portfolioData._id;

    // Parallel fetch for reliability and speed
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

    // 7. Response Construction
    const responseData = {
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

    // 8. Cache & Return
    await portfolioCache.setPortfolioById(objectId, responseData);

    return res.status(200).json({
      success: true,
      portfolio: responseData.portfolioData,
      holdings: responseData.holdings,
      portfolioAnalysis: responseData.portfolioAnalysis,
    });
  } catch (err: any) {
    console.error(`[PORTFOLIO_ERROR] User: ${user_id}`, err);
    return res.status(500).json({
      success: false,
      error: "Internal server error while fetching portfolio data",
    });
  }
};

export const disconnectBroker = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user_id = req.user?.userId;
  const id = req.params.id;

  if (!user_id) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized access",
    });
  }

  if (!id) {
    return res.status(400).json({
      success: false,
      error: "Portfolio id is required",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid portfolio id",
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const portfolio = await PortfolioModel.findOne({ _id: id, user_id }) // 🔐 ownership check
      .session(session);

    if (!portfolio) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: "Portfolio not found",
      });
    }

    const disconnected_portfolio = {
      portfolio_id: portfolio._id,
      user_id: portfolio.user_id,
      broker: portfolio.broker,
      portfolio_score: portfolio.portfolio_score,
      xirr: portfolio.xirr,
      today_net_change: portfolio.today_net_change,
      today_percent_change: portfolio.today_percent_change,
      total_returns: portfolio.total_returns,
      current_value: portfolio.current_value,
      invested_amount: portfolio.invested_amount,
      disconnected_at: new Date(),
    };

    await disconnectedPortfolioModel.create([disconnected_portfolio], {
      session,
    });
    await HoldingModel.deleteMany({ portfolio_id: portfolio._id }, { session });

    await PortfolioModel.deleteOne({ _id: portfolio._id }, { session });

    await BrokerMetaData.deleteOne({
      broker: portfolio.broker,
      user_id: user_id,
    });

    await session.commitTransaction();
    session.endSession();

    // cache invalidation AFTER commit
    try {
      await Promise.all([
        portfolioCache.removeConnectedPortfolioCache(user_id, id),
        portfolioCache.invalidatePortfolioById(
          portfolio._id as unknown as mongoose.Types.ObjectId,
        ),
      ]);
    } catch (cacheError) {
      console.error("Cache invalidation failed:", cacheError);
    }

    return res.status(200).json({
      success: true,
      message: "Broker disconnected successfully",
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error while disconnecting broker:", err);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getConnectedPortfolios = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  try {
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const cached = await portfolioCache.getConnectedPortfoliosByUserId(userId);
    if (cached) {
      const data = cached?.data;
      return res.status(200).json({
        success: true,
        message: "Portfolios fetched from cache",
        data,
      });
    }
    const portfolios = await PortfolioModel.find({ user_id: userId });
    const response: ConnectedPortfolio[] = portfolios.map((portfolio) => ({
      id: portfolio._id as unknown as string,
      broker: portfolio.broker,
      current_value: portfolio.current_value,
      invested_amount: portfolio.invested_amount,
    }));

    await portfolioCache.setConnectedPortfoliosByUserId(userId, {
      data: response,
    });

    return res.status(200).json({
      success: true,
      message: "Portfolio fetched",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting connected portfolios :", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};
