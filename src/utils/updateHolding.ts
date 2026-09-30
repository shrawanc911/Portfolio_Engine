import holdingModel from "../models/Holding.model";
import { GeneralData } from "../models/stock/GeneralData.model";
import { stockCache } from "../services/stockCache.service";

export const UpdateHolding = async (portfolio_id: string) => {
  try {
    const holdings = await holdingModel.find({ portfolio_id }).lean();

    if (!holdings.length) {
      console.log(`⚠️ No holdings found for portfolio: ${portfolio_id}`);
      return 0;
    }

    // 1️⃣ Fetch all required stocks in ONE query
    const isins = holdings.map((h) => h.isin);
    const cachedResults = await stockCache.getGenerals(isins);

    const stockMap = new Map();
    cachedResults.forEach((s) => {
      if (s && s.isin) {
        stockMap.set(s.isin, s);
      }
    });

    let total_value = 0;
    const bulkOps: any[] = [];

    for (const holding of holdings) {
      const stock = stockMap.get(holding.isin);
      if (!stock) {
        console.log(`⚠️ Stock not found for ISIN: ${holding.isin}`);
        continue;
      }
      const current_price = stock.current_price ?? holding.current_price ?? 0;
      const previous_day_close =
        stock.previous_day_close ?? holding.current_price ?? 0;
      const current_holding_value = current_price * holding.quantity;

      const today_net_change =
        current_holding_value - (previous_day_close * holding.quantity || 0);
      const profit_loss = current_holding_value - holding.buy_value;

      bulkOps.push({
        updateOne: {
          filter: { _id: holding._id },
          update: {
            $set: {
              current_price: current_price,
              current_holding_value,
              profit_loss,
              today_percent_change: stock.today_percent_change ?? 0,
              today_net_change,
              updated_at: new Date(),
            },
          },
        },
      });
      total_value += current_holding_value;
    }
    if (bulkOps.length) {
      await holdingModel.bulkWrite(bulkOps, { ordered: false });
    }

    console.log(
      `✅ Holdings updated for portfolio: ${portfolio_id} and holdings length: ${holdings.length}`,
    );
    return total_value;
  } catch (err: any) {
    console.error(
      `❌ Portfolio Id ${portfolio_id} Error while updating holding:`,
      err.message || err,
    );
  }
};
