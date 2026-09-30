import { GeneralData } from "../models/stock/GeneralData.model";
import portfolioModel from "../models/Portfolio.model";

export const syncStockPreviousDayClose = async () => {
  console.log("[STOCK] Syncing previous_day_close with current_price");

  const result = await GeneralData.updateMany({}, [
    {
      $set: {
        previous_day_close: "$current_price",
        today_high: "$current_price",
        today_low: "$current_price",
      },
    },
  ]);

  console.log("[STOCK] Sync completed", {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
};

export const syncPortfolioPreviousDayValue = async () => {
  console.log("[PORTFOLIO] Syncing previous_day_close with current_value");

  const result = await portfolioModel.updateMany({}, [
    {
      $set: {
        previous_day_close: "$current_value",
      },
    },
  ]);

  console.log("[PORTFOLIO] Sync completed", {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
};

export const previousDaySync = async () => {
  console.log("[EOD] Starting end-of-day sync");

  await syncStockPreviousDayClose();
  await syncPortfolioPreviousDayValue();

  console.log("[EOD] End-of-day sync completed");
};
