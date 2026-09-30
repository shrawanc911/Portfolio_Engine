import holdingModel from "../models/Holding.model";
import { savePortfolioAnalysis } from "../utils/savePortfolioAnalysis";

export async function addPortfolioAnalysis(portfolio_id: any) {
  try {
    console.log("Fetching Holding for Portfolio Analaysis:", portfolio_id);
    if (!portfolio_id) {
      throw new Error("portfolio_id is required");
    }

    const holdings = await holdingModel.find({ portfolio_id });

    if (!holdings || holdings.length === 0) {
      return {
        success: false,
        message: "No holdings found for portfolio",
      };
    }

    const formattedHoldings = holdings.map((holding: any) => {
      const buyValue = holding.buy_value || 0;
      const profitLoss = holding.profit_loss || 0;

      return {
        ticker: holding.underlying_symbol,
        isin: holding.isin,
        market_value: holding.current_holding_value ?? 0,
        quantity: holding.quantity ?? 0,
        avg_price: holding.average_buy_price ?? 0,
        current_price: holding.current_price ?? 0,
        invested_value: buyValue,
        unrealized_pnl: profitLoss,
        unrealized_pnl_pct: buyValue > 0 ? (profitLoss / buyValue) * 100 : 0,
        sector: holding.industry || "Unknown",
      };
    });

    const result = await savePortfolioAnalysis(formattedHoldings, portfolio_id);

    return result;
  } catch (err: any) {
    console.error("Error in addPortfolioAnalysis:", err.message);

    return {
      success: false,
      message: "Failed to add portfolio analysis",
      error: err.message,
    };
  }
}
