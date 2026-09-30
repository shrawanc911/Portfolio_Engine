// src/controllers/historical.controller.ts
import { Request, Response } from "express";
import dayjs from "dayjs";
import { fetchStockData } from "../utils/fetchStockData";
import portfolioModel from "../models/Portfolio.model";
import { PortfolioPerformance } from "../models/PortfolioPerformance.model";
import { transformToChartDataForFrontend } from "../utils/transformData";
import { getIndexHistoryData } from "../utils/indexHistoricalData";
import { GeneralData } from "../models/stock/GeneralData.model";
import { getCache, setCache } from "../utils/cache";
import { AuthenticatedRequest } from "../interface/file.interface";

export const getStockHistoricalData = async (req: Request, res: Response) => {
  try {
    const { isin = "INE118H01025", stockExchange = "NSE" } = req.query;
    const toDate = dayjs().format("YYYY-MM-DD");
    const fromDate: string = "1900-01-01";
    const cacheKey = `isin:${isin}:security_id`;
    const cache = await getCache(cacheKey);
    let security_id;
    if (cache) {
      security_id = cache;
    } else {
      const stock = await GeneralData.findOne({ isin });
      security_id = stock?.security_id;
      setCache(cacheKey, security_id);
    }

    if (!security_id) {
      return res.status(404).json({
        success: false,
        error: "Stock not found",
      });
    }

    const allResults = await fetchStockData(
      Number(security_id),
      String(stockExchange) + "_EQ" || "NSE_EQ",
      fromDate,
      toDate,
    );
    return res.status(200).json({
      success: true,
      fromDate,
      toDate,
      chartData: allResults?.chartData || [],
    });
  } catch (err: any) {
    console.error("❌ Error while getting stock history data:", err.message);
    return res.status(500).json({
      success: false,
      error: "Error while getting stock history data",
    });
  }
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
    const index_security_id_raw = req.query.index_security_id ?? "13";
    const id = req.params.id;

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
    const existingUser = await portfolioModel.findOne({
      _id: id,
      user_id: user_id,
    });
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, error: "Portfolio Not found" });
    }

    const existingPortfolioPerformance = await PortfolioPerformance.findOne({
      portfolio_id: existingUser?._id,
    });
    let allResults: any[] = [];

    const chartData = transformToChartDataForFrontend(
      existingPortfolioPerformance?.chartData || [],
    );
    allResults.push({ display_name: "Portfolio", chartData });
    const index = await getIndexHistoryData(index_security_id);
    allResults.push({
      display_name: indexDisplayName[index_security_id] ?? "Unknown Index",
      chartData: index?.chartData,
    });

    return res.status(200).json({
      success: true,
      allResults: allResults || [],
      existingPortfolioPerformance,
    });
  } catch (err: any) {
    console.error("❌ Error while getting stock history data:", err.message);
    return res.status(500).json({
      success: false,
      error: "Error while getting stock history data",
    });
  }
};
