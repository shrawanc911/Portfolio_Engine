import { Request, Response } from "express";
import { PortfolioViewEvent } from "../models/PortfolioViewEvent.model";
import portfolioModel from "../models/Portfolio.model";
import holdingModel from "../models/Holding.model";
import { StockViewEvent } from "../models/StockViewEvent.model";

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    // ⚠️ do not mutate now (important)
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [portfolioViewEventStats, portfolioStats, holdingStats] =
      await Promise.allSettled([
        PortfolioViewEvent.aggregate([
          // 🔥 global filter → reduces scanned docs
          {
            $match: {
              createdAt: { $gte: startOfMonth },
              event: { $in: ["portfolio", "resync"] },
            },
          },

          {
            $facet: {
              DAU: [
                {
                  $match: {
                    event: "portfolio",
                    createdAt: { $gte: startOfDay },
                  },
                },
                { $group: { _id: "$userId" } },
                { $count: "count" },
              ],

              WAU: [
                {
                  $match: {
                    event: "portfolio",
                    createdAt: { $gte: startOfWeek },
                  },
                },
                { $group: { _id: "$userId" } },
                { $count: "count" },
              ],

              MAU: [
                { $match: { event: "portfolio" } },
                { $group: { _id: "$userId" } },
                { $count: "count" },
              ],

              RESYNC: [{ $match: { event: "resync" } }, { $count: "count" }],
            },
          },
        ]),
        portfolioModel.aggregate([
          {
            $facet: {
              // 1️⃣ Total investment
              totalInvestment: [
                {
                  $group: {
                    _id: null,
                    total: { $sum: "$invested_amount" },
                  },
                },
              ],
              // 2️⃣ Current portfolio value
              currentValue: [
                {
                  $group: {
                    _id: null,
                    total: { $sum: "$current_value" },
                  },
                },
              ],
              // 3️⃣ Broker-wise totals
              brokersValues: [
                {
                  $group: {
                    _id: "$broker",
                    totalInvested: { $sum: "$invested_amount" },
                    totalCurrent: { $sum: "$current_value" },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    broker: "$_id",
                    totalInvested: 1,
                    totalCurrent: 1,
                  },
                },
              ],
              // 4 Total Portfolios
              totalPortfolios: [{ $count: "count" }],
            },
          },
        ]),
        holdingModel.aggregate([
          {
            $facet: {
              groupByInstrument: [
                {
                  $group: {
                    _id: "$instrument_type",
                    totalBuyValue: { $sum: "$buy_value" },
                    count: { $sum: 1 },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    instrument_type: "$_id",
                    totalBuyValue: 1,
                    count: 1,
                  },
                },
              ],
              groupByMarketCap: [
                {
                  $group: {
                    _id: "$capped_type",
                    totalBuyValue: { $sum: "$buy_value" },
                    count: { $sum: 1 },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    capped_type: "$_id",
                    totalBuyValue: 1,
                    count: 1,
                  },
                },
              ],
              totalAssets: [{ $count: "count" }],
            },
          },
        ]),
      ]);

    const result =
      portfolioViewEventStats.status == "fulfilled"
        ? portfolioViewEventStats.value[0]
        : {};

    const portfolioResult =
      portfolioStats.status == "fulfilled" ? portfolioStats.value[0] : {};

    const holdingResult =
      holdingStats.status == "fulfilled" ? holdingStats.value[0] : {};

    return res.status(200).json({
      success: true,
      data: {
        dau: result.DAU?.[0]?.count || 0,
        wau: result.WAU?.[0]?.count || 0,
        mau: result.MAU?.[0]?.count || 0,
        resync: result.RESYNC?.[0]?.count || 0,
      },
      portfolio: {
        totalInvestment: portfolioResult.totalInvestment?.[0]?.total || 0,
        currentValue: portfolioResult.currentValue?.[0]?.total || 0,
        brokersValues: portfolioResult.brokersValues || [],
        totalPortfolios: portfolioResult.totalPortfolios?.[0]?.count || 0,
      },
      holding: {
        groupByInstrument: holdingResult.groupByInstrument || 0,
        groupByMarketCap: holdingResult.groupByMarketCap || 0,
        totalAssets: holdingResult.totalAssets?.[0].count || 0,
      },
    });
  } catch (error) {
    console.error("[DASHBOARD_ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard data",
    });
  }
};

export const getUsersPortfolioValue = async (req: Request, res: Response) => {
  try {
    const { user_list } = req.body;

    if (!Array.isArray(user_list) || user_list.length === 0) {
      return res.status(400).json({
        success: false,
        error: "user_list must be a non-empty array",
      });
    }

    // 1️⃣ Aggregate portfolio values per user
    const portfolioAgg = await portfolioModel.aggregate([
      { $match: { user_id: { $in: user_list } } },
      {
        $group: {
          _id: "$user_id",
          totalInvested: { $sum: "$invested_amount" },
          totalCurrentValue: { $sum: "$current_value" },
          portfoliosCount: { $sum: 1 },
        },
      },
    ]);

    // 2️⃣ Last active per user
    const lastActiveAgg = await PortfolioViewEvent.aggregate([
      { $match: { user_id: { $in: user_list } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$user_id",
          lastActiveAt: { $first: "$createdAt" },
        },
      },
    ]);

    // 3️⃣ Build lookup maps
    const portfolioMap = new Map(portfolioAgg.map((p) => [String(p._id), p]));

    const lastActiveMap = new Map(
      lastActiveAgg.map((u) => [String(u._id), u.lastActiveAt]),
    );

    // 4️⃣ Final response (aligned to input order)
    const result: Record<string, any> = {};

    user_list.forEach((id: any) => {
      const key = String(id);
      const portfolio = portfolioMap.get(key);

      result[key] = {
        totalInvested: portfolio?.totalInvested || 0,
        totalCurrentValue: portfolio?.totalCurrentValue || 0,
        portfoliosCount: portfolio?.portfoliosCount || 0,
        lastActiveAt: lastActiveMap.get(key) || null,
      };
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[getUsersPortfolioValue]", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

export const getMostTrackedAssets = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page);
    if (!Number.isInteger(page) || page < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid page number",
      });
    }

    const LIMIT = 10;
    const skip = page * LIMIT;

    const result = await holdingModel.aggregate([
      // 1️⃣ group first
      {
        $group: {
          _id: "$isin",
          name: { $first: "$display_name" },
          symbol: { $first: "$underlying_symbol" },
          trackedBy: { $sum: 1 },
          invested_amount: { $sum: "$buy_value" },
        },
      },

      // 2️⃣ sort by most tracked
      {
        $sort: {
          trackedBy: -1, // primary sort
          invested_amount: -1, // secondary sort (tie breaker)
        },
      },

      // 3️⃣ facet for pagination + total count
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: LIMIT }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const data = result[0]?.data ?? [];
    const total = result[0]?.total?.[0]?.count ?? 0;

    return res.status(200).json({
      success: true,
      data: data.map((d: any) => ({
        ...d,
        avgHolding: (d.invested_amount / d.trackedBy).toFixed(2),
      })),
      page,
      count: data.length,
      totalPages: Math.ceil(total / LIMIT),
      total,
    });
  } catch (error: any) {
    console.error("[GET_MOST_TRACKED_ASSETS_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getMostQueriedStocks = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page);
    if (!Number.isInteger(page) || page < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid page number",
      });
    }

    const LIMIT = 10;
    const skip = page * LIMIT;

    const result = await StockViewEvent.aggregate([
      // 1️⃣ group first
      {
        $group: {
          _id: "$isin",
          name: { $first: "$display_name" },
          symbol: { $first: "$underlying_symbol" },
          queries: { $sum: 1 },
        },
      },

      // 2️⃣ sort by most tracked
      {
        $sort: {
          queries: -1, // primary sort
        },
      },

      // 3️⃣ facet for pagination + total count
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: LIMIT }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const data = result[0]?.data ?? [];
    const total = result[0]?.total?.[0]?.count ?? 0;

    return res.status(200).json({
      success: true,
      data,
      page,
      count: data.length,
      totalPages: Math.ceil(total / LIMIT),
      total,
    });
  } catch (error: any) {
    console.error("[GET_MOST_QUERIED_STOCK_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSectorDistribution = async (req: Request, res: Response) => {
  try {
    const result = await holdingModel.aggregate([
      {
        $group: {
          _id: { $ifNull: ["$industry", "Unknown Industry"] },
          totalInvested: { $sum: "$buy_value" },
          totalCurrent: { $sum: "$current_value" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          sector: "$_id",
          value: "$totalCurrent",
          change: {
            $cond: [
              { $gt: ["$totalInvested", 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ["$totalCurrent", "$totalInvested"] },
                      "$totalInvested",
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $sort: { value: -1 },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[GET_SECTOR_DISTRIBUTION_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// export const getDashboardData = async (req: Request, res: Response) => {
//   const userIds = await fetch("http://localhost:5001/api/dashboard/get_data");
//   const x = await userIds.json();
//   const result = await portfolioModel.deleteMany({
//     userId: { $nin: x },
//   });
//   res.send(result);
// };
