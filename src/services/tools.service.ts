import { redis } from "../config/redis";
import {
  calculateNifty500StocksScore,
  calculateVixScore,
  clamp,
} from "../utils/toolsHelperFunctions";

export const CACHE_VERSION = 1;
export const mmiCacheKey = () => {
  return `MMIIndex:${CACHE_VERSION}`;
};

export const calculateMMIIndex = async () => {
  try {
    const [breadthResult, vixResult] = await Promise.allSettled([
      calculateNifty500StocksScore(),
      calculateVixScore(),
    ]);

    const breadthScore =
      breadthResult.status == "fulfilled" ? breadthResult.value : 0;
    const vixScore = vixResult.status == "fulfilled" ? vixResult.value : 0;

    const rawScore = 0.4 * vixScore + 0.6 * breadthScore;
    // convert [-100,100] → [0,100]
    const finalScore = clamp((rawScore + 100) / 2, 0, 100);
    
    let sentiment:
      | "Strong Bullish"
      | "Bullish"
      | "Bearish"
      | "Neutral"
      | "Strong Bearish" = "Neutral";

    if (finalScore >= 70) sentiment = "Strong Bullish";
    else if (finalScore >= 55) sentiment = "Bullish";
    else if (finalScore > 45) sentiment = "Neutral";
    else if (finalScore > 30) sentiment = "Bearish";
    else sentiment = "Strong Bearish";

    const data = { finalScore: Number(finalScore.toFixed(2)), sentiment };

    const cacheKey = mmiCacheKey();
    await redis.set(cacheKey, JSON.stringify(data));
  } catch (error: any) {
    if (error.message == "NO_DATA_FOUND") {
      console.error("No data found for nifty 500");
    } else if (error.message == "NOT_ENOUGH_VIX_DATA") {
      console.error("VIX historical data is not found or less then 50");
    } else {
      console.error("Error while calculating mmi index value:", error.message);
    }
  }
};
