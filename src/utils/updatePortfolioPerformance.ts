import mongoose from "mongoose";
import { PortfolioPerformance } from "../models/PortfolioPerformance.model";
import { deleteCache } from "./cache";

export const addNewDataToPortfolioHistory = async (
  portfolio_id: string,
  price: number,
  total_returns: number,
  today_net_change: number,
  invested_amount: number,
  today_percent_change: number,
  xirr: number,
  session?: mongoose.ClientSession
) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(portfolio_id)) {
      throw new Error("Invalid portfolio_id");
    }

    // Formatted day to show chartdata with consistency
    const today = new Date();
    const formattedDay = today.toLocaleDateString("en-GB").replace(/-/g, "/");

    // Object of chart Data that has day and price
    const chartDataObject = {
      day: formattedDay,
      price: price,
      total_returns,
      today_net_change,
      invested_amount,
      today_percent_change,
      xirr,
    };

    // ✅ Use atomic upsert (no race condition)
    await PortfolioPerformance.findOneAndUpdate(
      { portfolio_id },
      {
        // Prevent duplicate day entry
        $pull: { chartData: { day: formattedDay } },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );

    // Then push new data atomically
    await PortfolioPerformance.updateOne(
      { portfolio_id },
      { $push: { chartData: chartDataObject } },
      { session }
    );

    // Invalidate Redis cache to ensure fresh data on next fetch
    const portfolioCacheKey = `portfolio:${portfolio_id}:performance`;
    await deleteCache(portfolioCacheKey);

    return { success: true, message: "Portfolio history updated successfully" };
  } catch (err: any) {
    console.error("Error while add New Data to portfolio history:", err);
  }
};
