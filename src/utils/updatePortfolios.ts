import mongoose from "mongoose";
import portfolioModel from "../models/Portfolio.model";
import { portfolioPerformanceCache } from "../v2/services/cache/portfolioPerformanceCache.service";
import { getTodayDateIST } from "./indicators/time";
import { UpdateHolding } from "./updateHolding";
import { addNewDataToPortfolioHistory } from "./updatePortfolioPerformance";

export const updatePortfolios = async () => {
  console.log("[PORTFOLIO] Starting portfolio update job");

  try {
    const allPortfolios = await portfolioModel.find().lean();

    for (const portfolio of allPortfolios) {
      if (!portfolio._id) continue;
      const portfolioId = portfolio._id.toString();
      const session = await portfolioModel.startSession();
      session.startTransaction();

      try {
        // 1️⃣ Recalculate holdings using latest stock prices
        const totalValue = (await UpdateHolding(portfolioId)) || 0;

        const prevValue = portfolio.previous_day_close || 0;
        const invested = portfolio.invested_amount || 0;

        const todayNetChange = totalValue - prevValue;
        const todayPercentChange =
          prevValue > 0 ? (todayNetChange / prevValue) * 100 : 0;

        const totalReturns = totalValue - invested;

        // 2️⃣ Add portfolio history snapshot
        await Promise.allSettled([
          addNewDataToPortfolioHistory(
            portfolioId,
            totalValue,
            totalReturns,
            todayNetChange,
            invested,
            todayPercentChange,
            portfolio.xirr || 0,
            session,
          ),
          portfolioPerformanceCache.set(
            portfolioId as unknown as mongoose.Types.ObjectId,
            {
              date: getTodayDateIST(),
              price: totalValue,
              totalReturns,
              todayNetChange,
              todayPercentChange,
              investedAmount: invested,
            },
            session,
          ),
        ]);

        // 3️⃣ Update portfolio summary
        await portfolioModel.updateOne(
          { _id: portfolio._id },
          {
            $set: {
              current_value: totalValue,
              total_returns: totalReturns,
              today_percent_change: todayPercentChange,
              today_net_change: todayNetChange,
              updated_at: new Date(),
            },
          },
          { session },
        );

        await session.commitTransaction();
        session.endSession();

        console.log(
          `[PORTFOLIO] Updated portfolio for userId=${portfolio.user_id}`,
        );
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(
          `[PORTFOLIO] Failed to update portfolio ${portfolio._id}`,
          err,
        );
      }
    }

    console.log("[PORTFOLIO] Portfolio update job completed");
  } catch (err) {
    console.error("[PORTFOLIO] Fatal error while updating portfolios:", err);
  }
};
