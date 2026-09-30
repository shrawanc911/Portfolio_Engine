// src/controllers/historical.controller.ts
import { Request, Response } from "express";
import portfolioModel from "../../models/Portfolio.model";
import { AuthenticatedRequest } from "../../interface/file.interface";
import { getStockCandleData } from "../helper/historicalData.helper";
import mongoose from "mongoose";
import { portfolioCache } from "../../services/portfolioCache.service";
import { fetchStockData, getFromDateByPeriod } from "../utils/fetchStockData";
import { portfolioPerformanceCache } from "../services/cache/portfolioPerformanceCache.service";

export const getStockHistoricalData = async (req: Request, res: Response) => {
  const isin = (req.query.isin as string) || "";
  const exchange = (req.query.exchange as "NSE" | "BSE") || "NSE";
  const period = (req.query.period as string) || "6M";
  if (!isin) {
    return res.status(400).json({ success: false, error: "ISIN not provided" });
  }
  const data = await getStockCandleData(isin, exchange, period);
  return res.status(data.status).json({ ...data });
};

const indexDisplayName: Record<number, string> = {
  13: "Nifty 50",
  25: "Nifty Bank",
  51: "Sensex",
};

export const getPortfolioPerformanceHistoricalData = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const index_security_id_raw =
      (req.query.index_security_id as string) || "13";
    const id = (req.params.id as unknown as mongoose.Types.ObjectId) || "";
    const period = (req.query.period as string) || "6M";

    const index_security_id = Number(index_security_id_raw);

    if (Number.isNaN(index_security_id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid index_security_id",
      });
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid portfolio id",
      });
    }

    const user_id = req.user?.userId;
    if (!user_id || !mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(401).json({
        success: false,
        error: "User Authentication Failed",
      });
    }
    const cached = await portfolioCache.getPortfolioById(id);
    if (!cached) {
      const existingUser = await portfolioModel.findOne({
        _id: id,
        user_id: user_id,
      });
      if (!existingUser) {
        return res
          .status(404)
          .json({ success: false, error: "Portfolio Not found" });
      }
    }

    const fromDate: string = getFromDateByPeriod(period);
    const portfolioPerformanceHistoricalData =
      await portfolioPerformanceCache.get(id, fromDate);
    let allResults: any[] = [];

    allResults.push({
      display_name: "Portfolio",
      chartData: portfolioPerformanceHistoricalData?.chartData || [],
    });

    const index = await fetchStockData(
      index_security_id,
      "IDX_I",
      portfolioPerformanceHistoricalData?.chartData[0]?.date || fromDate,
    );
    allResults.push({
      display_name: indexDisplayName[index_security_id] ?? "Unknown Index",
      chartData: index?.chartData,
    });

    return res.status(200).json({
      success: true,
      allResults: allResults || [],
    });
  } catch (err: any) {
    console.error("❌ Error while getting stock history data:", err.message);
    return res.status(500).json({
      success: false,
      error: "Error while getting stock history data",
    });
  }
};
