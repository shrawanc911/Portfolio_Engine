import { GeneralData } from "../models/stock/GeneralData.model";
import fnoStocks from "../data/fno_stocks_list.json";
import dayjs from "dayjs";
import { fetchDhanIntradayData } from "../services/dhan.service";
import { ENV } from "../config/env";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateSMA(values: number[], period: number): number {
  if (values.length < period) {
    throw new Error("Not enough data to calculate SMA");
  }
  const recent = values.slice(-period);
  const sum = recent.reduce((a, b) => a + b, 0);
  return sum / period;
}

export const calculateNifty500StocksScore = async () => {
  try {
    const breadthAgg = await GeneralData.aggregate([
      {
        $match: {
          isin: { $in: fnoStocks },
          today_net_change: { $type: "number" },
        },
      },
      {
        $group: {
          _id: null,
          positive: {
            $sum: { $cond: [{ $gt: ["$today_net_change", 0] }, 1, 0] },
          },
          negative: {
            $sum: { $cond: [{ $lt: ["$today_net_change", 0] }, 1, 0] },
          },
          unchanged: {
            $sum: { $cond: [{ $eq: ["$today_net_change", 0] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    const breadthData = breadthAgg[0] || {
      positive: 0,
      negative: 0,
      unchanged: 0,
      total: 0,
    };

    if (breadthData.total === 0) {
      throw new Error("NO_DATA_FOUND");
    }

    const breadthRaw =
      ((breadthData.positive - breadthData.negative) / breadthData.total) * 100;

    const breadthScore = clamp(breadthRaw, -100, 100);
    return breadthScore;
  } catch (error: any) {
    throw error;
  }
};

export const calculateVixScore = async () => {
  try {
    const toDate = dayjs().format("YYYY-MM-DD");
    const fromDate = dayjs().subtract(20, "day").format("YYYY-MM-DD");
    const raw = await fetchDhanIntradayData(
      {
        securityId: 21, // India VIX
        exchangeSegment: "IDX_I",
        instrument: "INDEX",
        interval: 60,
        oi: false,
        fromDate,
        toDate,
      },
      ENV.BROKER_NAME,
      ENV.DHAN_CLIENT_ID_ONE,
    );

    const closes: number[] = raw?.close || [];

    if (closes.length < 50) {
      throw new Error("NOT_ENOUGH_VIX_DATA");
    }

    const latestVix = closes[closes.length - 1] ?? 0;
    const sma50 = calculateSMA(closes, 50);
    const vixDiffPct = ((latestVix - sma50) / sma50) * 100;
    const vixScore = clamp(-vixDiffPct, -20, 20) * 5; // [-100, +100]
    return vixScore;
  } catch (error: any) {
    throw error;
  }
};
