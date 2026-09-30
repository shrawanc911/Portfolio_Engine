import { Request, Response } from "express";
import { GeneralData } from "../models/stock/GeneralData.model";
import { redis } from "../config/redis";
import { ScreenerSnapshot } from "../models/ScreenerSnapshot.model";
import IPOModel from "../models/IPO.model";
import { formatIST } from "../utils/indicators/time";

const CACHE_VERSION = 1;

function buildScreenerCacheKey(body: any) {
  const x = JSON.stringify(Object.values(body));
  return x;
}

function buildVWAPCacheKey(
  nifty: string,
  timeframe: string,
  page: number,
  limit: number,
) {
  return `VWAP:${nifty}:${timeframe}:${page}:${limit}`;
}

export const baseScreener = async (req: Request, res: Response) => {
  try {
    const limit = 20;
    const afterPrice = Number(req.query.afterPrice);

    const filter = afterPrice ? { current_price: { $lt: afterPrice } } : {};

    const screener = await GeneralData.find(filter, {
      display_name: 1,
      underlying_symbol: 1,
      industry: 1,
      sector: 1,
      current_price: 1,
      market_cap: 1,
      today_percent_change: 1,
    })
      .sort({ current_price: -1 })
      .limit(limit)
      .hint({ current_price: -1 })
      .lean();

    res.status(200).json({
      success: true,
      message: "Base screener fetched from server",
      data: screener,
    });
  } catch (err) {
    console.error("Base screener error:", err);
    res.status(500).json({ success: false });
  }
};

export const getSectors = async (req: Request, res: Response) => {
  try {
    const cacheKey = `screener:sectors:${CACHE_VERSION}`;
    const cacheData = await redis.get(cacheKey);
    if (cacheData) {
      return res.status(200).json({
        success: true,
        message: "Sectors fetched from cache",
        data: JSON.parse(cacheData),
      });
    }

    const results = await GeneralData.distinct("sector");
    const data = results.filter((result: any) => result != null);
    data.push("Unknown");
    await redis.set(cacheKey, JSON.stringify(data));
    return res
      .status(200)
      .json({ success: true, message: "Sectors fetched from db", data });
  } catch (error: any) {
    console.error("Error while getting sector data:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

export const getFilteredStocks = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const {
      sector = [],
      marketCap,
      price,
      pe,
      roe,
      change1d,
      page = 1,
      limit = 20,
    } = body;

    // 🔑 Build cache key
    const cacheKey = buildScreenerCacheKey({
      sector,
      marketCap,
      price,
      pe,
      roe,
      change1d,
      page,
      limit,
    });

    // 1️⃣ Try Redis first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        message: "Stocks fetched from Cache",
        data: JSON.parse(cached),
      });
    }

    const finalSectors = Array.isArray(sector)
      ? sector.map((sec: string) => (sec === "Unknown" ? null : sec))
      : [];

    const match: any = {};

    match.instrument_type = "EQUITY";
    // GeneralData filters
    if (price?.min !== undefined || price?.max !== undefined) {
      match.current_price = {};
      if (price.min !== undefined) match.current_price.$gte = price.min;
      if (price.max !== undefined) match.current_price.$lte = price.max;
    }

    if (marketCap?.min !== undefined || marketCap?.max !== undefined) {
      match.market_cap = {};
      if (marketCap.min !== undefined) match.market_cap.$gte = marketCap.min;
      if (marketCap.max !== undefined) match.market_cap.$lte = marketCap.max;
    }

    if (change1d?.min !== undefined || change1d?.max !== undefined) {
      match.today_percent_change = {};
      if (change1d.min !== undefined)
        match.today_percent_change.$gte = change1d.min;
      if (change1d.max !== undefined)
        match.today_percent_change.$lte = change1d.max;
    }

    if (finalSectors.length > 0) {
      match.sector = { $in: finalSectors };
    }

    // ❗ Sector is in TECH collection, so it should go into techMatch, not match
    const techMatch: any = {};

    if (roe?.min !== undefined || roe?.max !== undefined) {
      techMatch["tech.roe"] = {};
      if (roe.min !== undefined) techMatch["tech.roe"].$gte = roe.min;
      if (roe.max !== undefined) techMatch["tech.roe"].$lte = roe.max;
    }

    if (pe?.min !== undefined || pe?.max !== undefined) {
      techMatch["tech.peRatio"] = {};
      if (pe.min !== undefined) techMatch["tech.peRatio"].$gte = pe.min;
      if (pe.max !== undefined) techMatch["tech.peRatio"].$lte = pe.max;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const pipeline: any[] = [
      {
        $lookup: {
          from: "stock_technicals",
          localField: "isin",
          foreignField: "isin",
          as: "tech",
        },
      },
      {
        $unwind: {
          path: "$tech",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // Apply GeneralData filters BEFORE lookup
    if (Object.keys(match).length > 0) {
      pipeline.unshift({ $match: match });
    }

    // Apply tech filters AFTER lookup
    if (Object.keys(techMatch).length > 0) {
      pipeline.push({ $match: techMatch });
    }

    // Facet for pagination + total count
    pipeline.push({
      $facet: {
        data: [
          { $skip: skip },
          { $limit: lim },
          {
            $project: {
              isin: 1,
              display_name: 1,
              exchange: 1,
              underlying_symbol: 1,
              sector: 1,
              current_price: 1,
              market_cap: 1,
              today_percent_change: 1,
              "tech.sector": 1,
              "tech.roe": 1,
              "tech.peRatio": 1,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    });

    const result = await GeneralData.aggregate(pipeline);

    const data = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.count || 0;

    const responsePayload = {
      page: Number(page),
      limit: lim,
      total,
      totalPages: Math.ceil(total / lim),
      count: data.length,
      data: data.map((d: any) =>
        d.sector == null ? { ...d, sector: "Unknown" } : d,
      ),
    };

    // 2️⃣ Store in Redis (cache for 5 minutes)
    await redis.set(cacheKey, JSON.stringify(responsePayload), "EX", 300);

    return res.json({
      success: true,
      message: "Stocks fetched from DB",
      data: responsePayload,
    });
  } catch (err) {
    console.error("Screener error:", err);
    res.status(500).json({ success: false, error: "Screener failed" });
  }
};

export const getFilteredETF = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const { price, change1d, page = 1, limit = 20 } = body;

    // 🔑 Build cache key
    const cacheKey = buildScreenerCacheKey({
      price,
      change1d,
      page,
      limit,
    });

    // 1️⃣ Try Redis first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        message: "Stocks fetched from Cache",
        data: JSON.parse(cached),
      });
    }

    const match: any = {};

    match.instrument_type = "ETF";
    // GeneralData filters
    if (price?.min !== undefined || price?.max !== undefined) {
      match.current_price = {};
      if (price.min !== undefined) match.current_price.$gte = price.min;
      if (price.max !== undefined) match.current_price.$lte = price.max;
    }

    if (change1d?.min !== undefined || change1d?.max !== undefined) {
      match.today_percent_change = {};
      if (change1d.min !== undefined)
        match.today_percent_change.$gte = change1d.min;
      if (change1d.max !== undefined)
        match.today_percent_change.$lte = change1d.max;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const [result, total] = await Promise.all([
      GeneralData.find(match)
        .select(
          "isin display_name exchange underlying_symbol current_price today_net_change today_percent_change",
        )
        .skip(skip)
        .limit(limit)
        .lean(),
      GeneralData.countDocuments(match),
    ]);

    const responsePayload = {
      page: page,
      limit: limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: result.length,
      data: result,
    };

    // 2️⃣ Store in Redis (cache for 5 minutes)
    await redis.set(cacheKey, JSON.stringify(responsePayload), "EX", 300);

    return res.json({
      success: true,
      message: "Stocks fetched from DB",
      data: responsePayload,
    });
  } catch (err) {
    console.error("Screener error:", err);
    res.status(500).json({ success: false, error: "Screener failed" });
  }
};

export const getVWAPScreener = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "VWAP Screener data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {
          vwap_signal: { $in: ["Bullish", "Bearish"] },
        },
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          vwap_signal: 1,
          timeframe: 1,
          vwap: 1,
          security_id: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { a_aarthik_score_5_timeframe: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        { $match: { vwap_signal: { $in: ["Bullish", "Bearish"] } } },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "VWAP Screener data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting VWAP Screener:", error.message);
  }
};

export const getOversoldScreener = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `OVERSOLD:SCREENER:${page}:${limit}:15M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "Oversold Screener data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {
          rsi_signal: "Bullish",
        },
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          rsi_signal: 1,
          rsi_entry: 1,
          rsi_timeframe: 1,
          rsi: 1,
          security_id: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { rsi: 1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        { $match: { rsi_signal: "Bullish" } },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
        rsi_entry: stock.rsi_entry ? formatIST(stock.rsi_entry) : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "Oversold Screener data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting Oversold Screener:", error.message);
  }
};

export const getSwingTradingScreener = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `SWING:TRADING:SCREENER:${page}:${limit}:60M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "Swing Trading Screener data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {
          ema_signal: { $in: ["Bearish", "Bullish"] },
        },
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          ema_signal: 1,
          ema_timeframe: 1,
          ema10: 1,
          ema20: 1,
          security_id: 1,
          ema_cross_price: 1,
          ema_entry: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { a_aarthik_score_5_timeframe: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        {
          $match: {
            ema_signal: { $in: ["Bearish", "Bullish"] },
          },
        },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
        ema_entry: stock.ema_entry ? formatIST(stock.ema_entry) : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "Swing trading Screener data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting Swing trading Screener:", error.message);
  }
};

export const getVolumeScreener = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `VOLUME:SCREENER:${page}:${limit}:15M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "Volume Screener data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {
          volume_signal: "Hit",
        },
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          volume_signal: 1,
          volume_timeframe: 1,
          today_volume: 1,
          average_20_volume: 1,
          volume_ratio: 1,
          security_id: 1,
          volume_entry: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { volume_ratio: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        {
          $match: {
            volume_signal: "Hit",
          },
        },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
        volume_entry: stock.volume_entry ? formatIST(stock.volume_entry) : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "Volume Screener data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting Volume Screener:", error.message);
  }
};

export const get200DMAScreener = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `200DMA:SCREENER:${page}:${limit}:15M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "200 DMA Screener data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {
          dma_signal: "Hit",
        },
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          dma_signal: 1,
          dma_timeframe: 1,
          dma_200: 1,
          security_id: 1,
          dma_entry: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { a_aarthik_score_5_timeframe: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        {
          $match: {
            dma_signal: "Hit",
          },
        },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
        dma_entry: stock.dma_entry ? formatIST(stock.dma_entry) : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "200 DMA Screener data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error("Error while getting 200 DMA Screener:", error.message);
  }
};

export const getSouravJoshiAarthikScore = async (
  req: Request,
  res: Response,
) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `SOURAV_JOSHI:AARTHIK_SCORE:${page}:${limit}:15M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "Sourav Joshi aarthik score data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {},
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          security_id: 1,
          exchange: 1,
          s_adx_5_timeframe: 1,
          s_rsi_5_timeframe: 1,
          s_aarthik_score_5_timeframe: 1,
          s_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { s_aarthik_score_5_timeframe: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        {
          $match: {},
        },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        s_entry_5_timeframe: stock.s_entry_5_timeframe
          ? formatIST(stock.s_entry_5_timeframe)
          : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    // await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "Sourav Joshi aarthik score data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error(
      "Error while getting Sourav Joshi aarthik score:",
      error.message,
    );
  }
};

export const getAjitPatelAarthikScore = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    // const cacheKey = buildVWAPCacheKey("NIFTY100", "15m", page, limit);
    const cacheKey = `AJIT_PATEL:AARTHIK_SCORE:${page}:${limit}:15M`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res.json({
        success: true,
        message: "Ajit Patel aarthik score data fetched from cache",
        data,
      });
    }
    // Aggregate pipeline
    const pipeline: any[] = [
      {
        $match: {},
      },
      {
        $lookup: {
          from: "stock_generals",
          localField: "isin",
          foreignField: "isin",
          as: "gen",
        },
      },
      {
        $unwind: {
          path: "$gen",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isin: 1,
          security_id: 1,
          exchange: 1,
          a_tss_5_timeframe: 1,
          a_dms_5_timeframe: 1,
          a_mas_5_timeframe: 1,
          a_aarthik_score_5_timeframe: 1,
          a_entry_5_timeframe: 1,
          display_name: "$gen.display_name",
          underlying_symbol: "$gen.underlying_symbol",
          current_price: "$gen.current_price",
          today_net_change: "$gen.today_net_change",
          today_percent_change: "$gen.today_percent_change",
          market_cap: "$gen.market_cap",
          capped_type: "$gen.capped_type",
        },
      },
      { $sort: { a_aarthik_score_5_timeframe: -1 } }, // optional: sort by market cap
      { $skip: skip },
      { $limit: limit },
    ];

    const [stocksData, totalCountArr] = await Promise.all([
      ScreenerSnapshot.aggregate(pipeline),
      ScreenerSnapshot.aggregate([
        {
          $match: {},
        },
        { $count: "count" },
      ]),
    ]);

    const total = totalCountArr[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = stocksData.map((stock: any) => {
      return {
        ...stock,
        a_entry_5_timeframe: stock.a_entry_5_timeframe
          ? formatIST(stock.a_entry_5_timeframe)
          : null,
      };
    });

    const response = {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data: formattedData,
    };

    // Cache it (e.g., 60 seconds or 5 min depending on your needs)
    // await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    return res.json({
      success: true,
      message: "Ajit Patel aarthik score data fetched from DB",
      data: response,
    });
  } catch (error: any) {
    console.error(
      "Error while getting Ajit Patel aarthik score:",
      error.message,
    );
  }
};

export const getIPOData = async (req: Request, res: Response) => {
  try {
    const status = req.params.status;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, error: "status not provided" });
    }

    if (!["upcoming", "active", "closed", "listed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "status should be upcoming, active, closed or listed",
      });
    }

    const pageNum = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `IPO:${status}:${pageNum}:${limitNum}`;
    const cacheData = await redis.get(cacheKey);

    if (cacheData) {
      const data = JSON.parse(cacheData);
      return res
        .status(200)
        .json({ success: true, message: "IPO Data fetched from cache", data });
    }

    const IPOData = await IPOModel.find({ status })
      .select("-is_synced -updatedAt -__v")
      .skip(skip)
      .limit(limitNum);

    const total = await IPOModel.countDocuments({ status });

    const responsePayload = {
      page: pageNum,
      limit: limitNum,
      total,
      status,
      count: IPOData.length,
      totalPages: Math.ceil(total / limitNum),
      data: IPOData,
    };

    await redis.setex(cacheKey, 3600, JSON.stringify(responsePayload));

    return res.status(200).json({
      success: true,
      message: `IPO fetched for status: ${status}`,
      data: responsePayload,
    });
  } catch (error: any) {
    console.error("Error while getting IPO Data:", error.message);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
