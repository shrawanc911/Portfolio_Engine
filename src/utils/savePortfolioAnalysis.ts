import axios from "axios";
import { PortfolioAnalysis } from "../models/PortfolioAnalysis.model";
import { ENV } from "../config/env";

interface Holding {
  ticker: string;
  isin: string;
  market_value: number;
  quantity: number;
  avg_price: number;
  current_price: number;
  invested_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  sector: string;
}

const PORTFOLIO_SCORE_URL = `${ENV.PORTFOLIO_SCORE}/api/v1/score/json`;

export const savePortfolioAnalysis = async (
  holdings: Holding[],
  portfolio_id: string,
  lookback_days: number = 252,
  enable_gpt_analysis: boolean = true
) => {
  try {
    if (!holdings || holdings.length === 0) {
      return { success: false, message: "Holdings not provided" };
    }

    const payload = {
      holdings,
      lookback_days,
      user_id: portfolio_id,
      enable_gpt_analysis,
    };

    console.log("Calling Portfolio Analysis:", PORTFOLIO_SCORE_URL);
    // 1️⃣ Call scoring API
    console.time("ScoreAPI_ResponseTime");
    const response = await axios.post(PORTFOLIO_SCORE_URL, payload);
    console.timeEnd("ScoreAPI_ResponseTime");

    // response.data contains the full portfolio analysis JSON
    const finalData = response.data;

    // 2️⃣ Save into MongoDB
    const pa = new PortfolioAnalysis({ ...finalData, portfolio_id });
    await pa.save();
    console.log("Portfolio Analysis Done");
    return {
      success: true,
      message: "Portfolio analysis saved successfully",
      data: finalData,
    };
  } catch (err: any) {
    console.error("Error while saving Portfolio Analysis:", err.message);

    return {
      success: false,
      message: "Failed to save portfolio analysis",
      error: err.message,
    };
  }
};
