import holdingModel, { IHolding } from "../models/Holding.model";
import mongoose from "mongoose";
import { InputHolding } from "../interface/file.interface";
import { stockCache } from "../services/stockCache.service";

async function createHoldingDoc(holdingData: any) {
  const holding = new holdingModel(holdingData);
  await holding.save();
  return holding;
}

// This is updated
// Helper to prepare holding data (pure function logic)
export function prepareHoldingData(
  holding: InputHolding,
  portfolio_id: mongoose.Types.ObjectId,
  stockGeneralData: any,
) {
  if (!holding || !stockGeneralData) return null;

  const { isin, quantity = 0, average_buy_price = 0, buy_value = 0 } = holding;
  const currentPrice = stockGeneralData.current_price || 0;
  const closingValue = currentPrice * quantity;
  const previousDayValue = stockGeneralData.previous_day_close * quantity;
  const todayNetChange = closingValue - previousDayValue;
  const profitLoss = (currentPrice - average_buy_price) * quantity;

  const holdingDoc = {
    portfolio_id,
    isin,
    security_id: stockGeneralData.security_id,
    image_url: stockGeneralData?.image_url || "",
    display_name: stockGeneralData.display_name,
    underlying_symbol: stockGeneralData.underlying_symbol,
    exchange: stockGeneralData.exchange as "NSE" | "BSE",
    instrument_type: stockGeneralData.instrument_type as
      | "EQUITY"
      | "ETF"
      | "MF",
    industry: stockGeneralData.industry || stockGeneralData.sector || "Unknown",
    market_cap: stockGeneralData.market_cap,
    capped_type: stockGeneralData.capped_type,
    quantity,
    average_buy_price,
    buy_value,
    current_price: currentPrice,
    current_holding_value: closingValue,
    today_percent_change: stockGeneralData.today_percent_change,
    today_net_change: todayNetChange,
    profit_loss: profitLoss,
  };

  const metrics = {
    ODR: todayNetChange || 0,
    CV: closingValue || 0,
    BV: buy_value || 0,
    PDV: previousDayValue || 0,
  };

  return { holdingDoc, metrics };
}

export async function saveHoldingsBulk(
  holdings: InputHolding[],
  portfolio_id: mongoose.Types.ObjectId,
) {
  if (!holdings || holdings.length === 0) {
    return { ODR: 0, CV: 0, BV: 0, PDV: 0 };
  }

  // Bulk fetch stock data
  const isins = holdings.map((h) => h.isin);
  const stockGenerals = await stockCache.getGenerals(isins);
  const stockMap = new Map();
  stockGenerals.forEach((stock) => {
    if (stock) stockMap.set(stock.isin, stock);
  });

  const bulkOps: any[] = [];
  const aggregatedMetrics = {
    ODR: 0,
    CV: 0,
    BV: 0,
    PDV: 0,
  };

  for (const holding of holdings) {
    const stock = stockMap.get(holding.isin);
    const prepared = prepareHoldingData(holding, portfolio_id, stock);

    if (!prepared) continue;
    bulkOps.push({
      updateOne: {
        filter: {
          portfolio_id,
          isin: prepared.holdingDoc.isin,
        },
        update: {
          $set: prepared.holdingDoc,
        },
        upsert: true,
      },
    });
    aggregatedMetrics.ODR += prepared.metrics.ODR;
    aggregatedMetrics.CV += prepared.metrics.CV;
    aggregatedMetrics.BV += prepared.metrics.BV;
    aggregatedMetrics.PDV += prepared.metrics.PDV;
  }

  if (bulkOps.length > 0) {
    await holdingModel.bulkWrite(bulkOps, { ordered: false });
  }

  return aggregatedMetrics;
}

// Kept for backward compatibility but internal refactor
export async function saveHoldings(
  holding: InputHolding,
  portfolio_id: mongoose.Types.ObjectId,
) {
  if (!holding || !portfolio_id) {
    return { ODR: 0, CV: 0, BV: 0, PDV: 0 };
  }

  const stockGeneralData = await stockCache.getGeneral(holding.isin);
  const prepared = prepareHoldingData(holding, portfolio_id, stockGeneralData);

  if (!prepared) {
    return { ODR: 0, CV: 0, BV: 0, PDV: 0 };
  }

  await createHoldingDoc(prepared.holdingDoc);

  return prepared.metrics;
}

export async function saveManualExistingHoldings(
  holding: InputHolding,
  existingHolding: IHolding,
) {
  if (holding) {
    const isin = holding.isin;
    // Use getGeneral() instead of getByISIN() to only fetch general data
    const stock = await stockCache.getGeneral(isin);
    if (!stock) {
      return {
        ODR: 0,
        CV: 0,
        BV: 0,
        PDV: 0,
      };
    }

    const existingQuantity = existingHolding.quantity || 0;
    const existingBuyValue = existingHolding.buy_value || 0;

    const newQuantity = holding.quantity || 0;
    const newBuyValue = holding.buy_value || 0;

    const totalQuantity = existingQuantity + newQuantity;
    const totalBuyValue = existingBuyValue + newBuyValue;
    const totalAverageBuyValue = totalBuyValue / totalQuantity;

    const currentPrice = stock.current_price || 0;
    const closingValue = currentPrice * totalQuantity;
    const previousDayValue = stock.previous_day_close * totalQuantity;

    const todayNetChange = closingValue - previousDayValue;

    const profitLoss = (currentPrice - totalAverageBuyValue) * totalQuantity;

    await holdingModel.findOneAndUpdate(
      { _id: existingHolding._id },
      {
        $set: {
          quantity: totalQuantity,
          average_buy_price: totalAverageBuyValue,
          buy_value: totalBuyValue,

          current_price: currentPrice,
          current_holding_value: closingValue,

          today_percent_change: stock.today_percent_change,
          today_net_change: todayNetChange,
          profit_loss: profitLoss,
        },
      },
    );

    const OLD_PDV = stock.previous_day_close * existingQuantity || 0;
    const OLD_CV = currentPrice * existingQuantity || 0;
    const OLD_BV = existingBuyValue;
    const OLD_ODR = OLD_CV - OLD_PDV;

    const ODR = todayNetChange - OLD_ODR;
    const CV = closingValue - OLD_CV;
    const BV = totalBuyValue - existingBuyValue;
    const PDV = previousDayValue - OLD_PDV;
    return {
      ODR,
      CV,
      BV,
      PDV,
    };
  }
  return {
    ODR: 0,
    CV: 0,
    BV: 0,
    PDV: 0,
  };
}
