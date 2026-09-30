import { Request, Response } from "express";
import { mmiCacheKey } from "../services/tools.service";
import { redis } from "../config/redis";

export const getMMIIndex = async (req: Request, res: Response) => {
  try {
    const cacheKey = mmiCacheKey();
    const cacheData = await redis.get(cacheKey);
    if (!cacheData) {
      return res.status(404).json({ success: false, error: "Data not found" });
    }
    const data = JSON.parse(cacheData);
    return res
      .status(200)
      .json({ success: true, message: "MMI Index value fetched", data });
  } catch (error: any) {
    console.error("Error while getting mmi index:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};
