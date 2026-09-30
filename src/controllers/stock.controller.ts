import { Request, Response } from "express";
import { stockCache } from "../services/stockCache.service";
import { StockViewEvent } from "../models/StockViewEvent.model";
import { AuthenticatedRequest } from "../interface/file.interface";
// import { redis } from "../config/redis";
import {
  incrementStockView,
  warmupStockViewCount,
} from "../services/stockViewCounter.service";
// import { GeneralData } from "../models/stock/GeneralData.model";
import { searchStockService } from "../services/stockSearch.service";
import { GeneralData } from "../models/stock/GeneralData.model";
import { TechnicalData } from "../models/stock/TechnicalData.model";
import { FinancialData } from "../models/stock/FinancialData.model";
import { withGrowthRate, pickLastNYears } from "../utils/stockReports";
import { fetchStockData } from "../utils/fetchStockData";
import { getIndexHistoryData } from "../utils/indexHistoricalData";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { CorporateActionData } from "../models/stock/CorporateActionData.model";

dayjs.extend(customParseFormat);

function getLatestKey(data: Record<string, number>): string | undefined {
  const keys = Object.keys(data);

  if (keys.length === 0) return undefined;

  const sorted = keys.sort((a, b) => {
    const yearA = parseInt(a.match(/\d{4}/)?.[0] || "0", 10);
    const yearB = parseInt(b.match(/\d{4}/)?.[0] || "0", 10);
    return yearA - yearB;
  });

  return sorted[sorted.length - 1];
}

export const getStockAuth = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const isin = req.query.isin as string;
    const userId = req.user?.userId;

    if (!isin) {
      return res.status(400).json({
        success: false,
        message: "ISIN is required",
      });
    }

    // Use stockCache - handles Redis + MongoDB fallback + auto-population
    const stockData = await stockCache.getByISIN(isin);

    if (!stockData) {
      return res.status(404).json({
        success: false,
        message: "Stock not found",
      });
    }

    // 1️⃣ Ensure Redis is initialized (rare)
    await warmupStockViewCount(isin);

    // 2️⃣ Atomic increment (fast)
    const viewCount = await incrementStockView(isin);

    queueMicrotask(async () => {
      try {
        await StockViewEvent.create({
          isin,
          userId,
          display_name: stockData.general.display_name,
          underlying_symbol: stockData.general.underlying_symbol,
          viewedAt: new Date(),
        });
      } catch (err) {
        console.error("Stock view tracking failed:", err);
      }
    });

    res.status(200).json({
      success: true,
      general: stockData.general,
      technical: stockData.technical,
      financial: stockData.financial,
      document: stockData.document,
      corporateAction: stockData.corporateAction,
      viewCount,
    });
  } catch (err: any) {
    console.error("Error while fetching stock from db:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getStock = async (req: Request, res: Response) => {
  try {
    const isin = req.query.isin as string;

    if (!isin) {
      return res.status(400).json({
        success: false,
        message: "ISIN is required",
      });
    }

    // Use stockCache - handles Redis + MongoDB fallback + auto-population
    const stockData = await stockCache.getByISIN(isin);

    if (!stockData) {
      return res.status(404).json({
        success: false,
        message: "Stock not found",
      });
    }

    // 1️⃣ Ensure Redis is initialized (rare)
    await warmupStockViewCount(isin);

    // 2️⃣ Atomic increment (fast)
    const viewCount = await incrementStockView(isin);

    queueMicrotask(async () => {
      try {
        await StockViewEvent.create({
          isin,
          display_name: stockData.general.display_name,
          underlying_symbol: stockData.general.underlying_symbol,
          viewedAt: new Date(),
        });
      } catch (err) {
        console.error("Stock view tracking failed:", err);
      }
    });

    res.status(200).json({
      success: true,
      general: stockData.general,
      technical: stockData.technical,
      financial: stockData.financial,
      document: stockData.document,
      corporateAction: stockData.corporateAction,
      viewCount,
    });
  } catch (err: any) {
    console.error("Error while fetching stock from db:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSearchResult = async (req: Request, res: Response) => {
  try {
    const q = req.query.q?.toString().trim();
    if (!q) return res.json({ success: true, data: [] });

    const data = await searchStockService(q);

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error while getting search result:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getStockReportData = async (req: Request, res: Response) => {
  try {
    const isin = req.params.isin;

    if (typeof isin != "string") {
      return res.status(400).json({ success: false, error: "Invalid ISIN" });
    }
    const generalData = await GeneralData.findOne({ isin })
      .lean()
      .select(
        "isin display_name underlying_symbol security_id current_price market_cap description year_high year_low",
      );

    const technicalData = await TechnicalData.findOne({ isin })
      .lean()
      .select("roe roce debtToEquity evToEbitda peRatio pegRatio pbRatio");

    const financialData = await FinancialData.findOne({ isin })
      .lean()
      .select("yoy_results -_id");

    if (!generalData || !financialData || !technicalData) {
      return res.status(404).json({
        success: false,
        message: "Stock data not found",
      });
    }

    const sales = financialData?.yoy_results.sales || {};
    const expenses = financialData?.yoy_results.expenses || {};
    const opmPercentage = financialData?.yoy_results?.["opm %"] || {};
    const netProfit = financialData?.yoy_results?.["net profit"] || {};
    const eps = financialData?.yoy_results?.["eps in rs"] || {};
    const dividendPayoutPercentage =
      financialData?.yoy_results?.["dividend payout %"] || {};
    const operatingProfit =
      financialData?.yoy_results?.["operating profit"] || {};
    const interestExpenses = financialData?.yoy_results?.["interest"] || {};
    const taxPercentage = financialData?.yoy_results?.["tax %"] || {};
    const profitBerofeTax =
      financialData?.yoy_results?.["profit before tax"] || {};
    const interestExpensesPercentage = Object.keys(operatingProfit).reduce(
      (acc: Record<string, number>, key) => {
        if (key == "ttm") {
          return acc;
        }
        const interest = interestExpenses[key] ?? 0;
        const opProfit = operatingProfit[key] ?? 0;

        const percentage = opProfit !== 0 ? (interest / opProfit) * 100 : 0;

        acc[key] = percentage;
        return acc;
      },
      {},
    );
    const taxRate = Object.keys(taxPercentage).reduce(
      (acc: Record<string, number>, key) => {
        if (key == "ttm") {
          return acc;
        }
        const pbt = profitBerofeTax[key] ?? 0;
        const tp = taxPercentage[key] ?? 0;
        const tv = (pbt * tp) / 100;

        acc[key] = pbt - tv;
        return acc;
      },
      {},
    );

    const finalSales = pickLastNYears(sales, 5);
    const finalNetProfit = pickLastNYears(netProfit, 5);

    const latestKey = getLatestKey(finalSales);

    let PATMargin = 0;

    if (latestKey) {
      const salesValue = finalSales[latestKey] ?? 0;
      const netProfitValue = finalNetProfit[latestKey] ?? 0;

      PATMargin = salesValue !== 0 ? (netProfitValue / salesValue) * 100 : 0;
    }

    const financial = {
      revenue: finalSales,
      expenses: pickLastNYears(expenses, 5),
      "opm %": pickLastNYears(opmPercentage, 5),
      "operating profit": pickLastNYears(operatingProfit, 5),
      "interest expenses": pickLastNYears(interestExpenses, 5),
      "interest expenses %": pickLastNYears(interestExpensesPercentage, 5),
      "tax rate": pickLastNYears(taxRate, 5),
      "net profit": finalNetProfit,
      eps: pickLastNYears(eps, 5),
      "dividend payout %": pickLastNYears(dividendPayoutPercentage, 5),
    };

    const salesGrowthRate = withGrowthRate(sales, 6);
    const operatingProfitGrowthRate = withGrowthRate(operatingProfit, 6);
    const netProfitGrowthRate = withGrowthRate(netProfit, 6);
    const epsGrowthRate = withGrowthRate(eps, 6);

    const financialGrowth = {
      "revenue %": salesGrowthRate,
      "operating profit %": operatingProfitGrowthRate,
      "net profit %": netProfitGrowthRate,
      "eps %": epsGrowthRate,
    };

    // Fetch latest dividend amount from CorporateActionData
    const corporateActionData = await CorporateActionData.findOne({ isin })
      .select("dividends")
      .lean();

    let latestDividend: string | null = null;
    const divEntries = corporateActionData?.dividends?.data || [];
    if (divEntries.length > 0) {
      // Find the most recent dividend by parsing exDate
      let latest: any = divEntries[0];
      let latestDate = dayjs((latest as any).exDate, [
        "DD-MM-YYYY",
        "DD/MM/YYYY",
        "YYYY-MM-DD",
      ]);

      for (let i = 1; i < divEntries.length; i++) {
        const entry = divEntries[i] as any;
        const entryDate = dayjs(entry.exDate, [
          "DD-MM-YYYY",
          "DD/MM/YYYY",
          "YYYY-MM-DD",
        ]);
        if (entryDate.isValid() && entryDate.isAfter(latestDate)) {
          latest = entry;
          latestDate = entryDate;
        }
      }
      latestDividend = (latest as any).dividendPercent || null;
    }

    return res.status(200).json({
      success: true,
      message: "Stock report data fetched from DB",
      generalData: {
        ...generalData,
        totalNoOfShares: generalData?.market_cap
          ? generalData.market_cap / generalData?.current_price
          : 0,
      },
      technicalData: { ...technicalData, PATMargin },
      financialData: { valuation: financial, growth: financialGrowth },
      latestDividend,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

export const getStockChartData = async (req: Request, res: Response) => {
  try {
    const isin = req.params.isin;

    if (typeof isin != "string") {
      return res.status(400).json({ success: false, error: "Invalid ISIN" });
    }

    // 1. Get Security ID from ISIN
    const stock = await GeneralData.findOne({ isin })
      .select("security_id exchange")
      .lean();

    if (!stock || !stock.security_id) {
      return res.status(404).json({ success: false, error: "Stock not found" });
    }

    const toDate = dayjs().format("YYYY-MM-DD");
    const fromDate = dayjs().subtract(5, "year").format("YYYY-MM-DD"); // Fetch last 5 years

    // 2. Fetch Stock History
    const exchange = stock.exchange ? `${stock.exchange}_EQ` : "NSE_EQ";

    const stockHistoryPromise = fetchStockData(
      Number(stock.security_id),
      exchange,
      fromDate,
      toDate,
    );

    // 3. Fetch Nifty 50 History (ID 13)
    const niftyHistoryPromise = getIndexHistoryData(13, fromDate);

    const [stockResult, niftyResult] = await Promise.all([
      stockHistoryPromise,
      niftyHistoryPromise,
    ]);

    // 4. Aggregate daily data to yearly data points
    const aggregateToYearly = (chartData: any[]) => {
      const yearMap: Record<string, { price: number; day: string }> = {};

      for (const item of chartData) {
        if (!item.day) continue;
        const [d, m, y] = item.day.split("/");
        if (!y) continue;

        // Keep overwriting — last entry for each year wins (most recent trading day)
        yearMap[y] = { price: item.price, day: item.day };
      }

      // Sort by year ascending and return with labels
      return Object.entries(yearMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, data]) => ({
          year,
          label: year,
          price: data.price,
          lastTradingDay: data.day,
        }));
    };

    const stockYearly = aggregateToYearly(stockResult?.chartData || []).slice(
      -5,
    );
    const niftyYearly = aggregateToYearly(niftyResult?.chartData || []).slice(
      -5,
    );

    return res.status(200).json({
      success: true,
      data: {
        stock: stockYearly,
        nifty: niftyYearly,
        sector: null,
      },
    });
  } catch (error: any) {
    console.error("Error in getStockChartData:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getIndexData = async (req: Request, res: Response) => {
  const securityId = req.params.securityId;
  if (!securityId) {
    return res
      .status(400)
      .json({ success: false, error: "securityId not provided" });
  }
  try {
    const indexData = await stockCache.getIndexBySecurityId(securityId);
    if (!indexData || !indexData.general) {
      return res.status(404).json({
        success: false,
        error: "Index data not found for this securityId:" + securityId,
      });
    }
    const data = {
      securityId,
      underlying_symbol: indexData.general.underlying_symbol,
      symbol_name: indexData.general.symbol_name,
      display_name: indexData.general.display_name,
      exchange: indexData.general.exchange,
      current_price: indexData.general.current_price,
      today_net_change: indexData.general.today_net_change,
      today_percent_change: indexData.general.today_percent_change,
    };
    return res.json({
      success: true,
      message: "Index Data fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error(
      "[getIndexData] error while getting index data:",
      error.message,
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};
