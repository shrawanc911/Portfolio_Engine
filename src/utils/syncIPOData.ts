import { redis } from "../config/redis";
import IPOModel from "../models/IPO.model";
import { fetchIPOData } from "./indianAPIFetching";

export const syncIPOData = async () => {
  try {
    const data = await fetchIPOData();
    const bulkOps: any[] = [];

    Object.keys(data).forEach((key: string) => {
      data[key].forEach((ipo: any) => {
        bulkOps.push({
          updateOne: {
            filter: { symbol: ipo.symbol },
            update: { $set: ipo },
            upsert: true,
          },
        });
      });
    });

    if (bulkOps.length > 0) {
      const result = await IPOModel.bulkWrite(bulkOps, { ordered: false });
      console.log("Bulk upsert result:", {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
      });
    }

    await deleteIPOCache();
  } catch (error: any) {
    console.error("Error while syncing ipo data:", error.message);
  }
};

async function deleteIPOCache() {
  let cursor = "0";
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      "IPO:*",
      "COUNT",
      100,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== "0");

  console.log(`🧹 Cleared ${deleted} IPO cache keys`);
}
