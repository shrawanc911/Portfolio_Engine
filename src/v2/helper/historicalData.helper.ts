import { getCache, setCache } from "../../utils/cache";
import { GeneralData } from "../../models/stock/GeneralData.model";
import { fetchStockData, getFromDateByPeriod } from "../utils/fetchStockData";

export const getStockCandleData = async (
  isin: string,
  exchange: "NSE" | "BSE",
  period: string,
) => {
  try {
    const cacheKey = `isin:${isin}:security_id`;
    const cache = await getCache(cacheKey);
    let securityId;
    if (cache) {
      securityId = cache;
    } else {
      const stock = await GeneralData.findOne({ isin });
      securityId = stock?.security_id;
      setCache(cacheKey, securityId);
    }

    if (!securityId) {
      return {
        status: 404,
        success: false,
        error: "Stock not found",
      };
    }

    const fromDate = getFromDateByPeriod(period);

    const allResults = await fetchStockData(
      Number(securityId),
      ((String(exchange) + "_EQ") as "NSE_EQ" | "BSE_EQ") || "NSE_EQ",
      fromDate,
      isin,
    );
    return {
      status: 200,
      success: true,
      chartData: allResults?.chartData || [],
    };
  } catch (err: any) {
    console.error(
      "[getStockHistoricalData] ❌ Error while getting stock history data:",
      err.message,
    );
    return {
      status: 500,
      success: false,
      error: "Error while getting stock history data",
    };
  }
};
