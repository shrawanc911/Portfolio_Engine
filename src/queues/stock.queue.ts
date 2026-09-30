import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const STOCK_QUEUE_NAME = "stock-fetch-queues";

// Create a queue instance
export const stockQueue = new Queue(STOCK_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // wait 5s before first retry, then 10s, 20s
    },
    removeOnComplete: true,
    removeOnFail: 500, // keep last 500 failed jobs
  },
});

export const addStockJob = async (isin: string) => {
  const processingKey = `stock_processing:${isin}`;

  // 1. Check if already processing
  // const existing = await redis.get(processingKey);
  // if (existing) {
  //   console.log(`Skipping duplicate job for ${isin}`);
  //   return false; // Job not added
  // }

  // 2. Set processing flag (TTL 10 mins)
  // await redis.set(processingKey, "true", "EX", 600);

  // 3. Add to queue
  await stockQueue.add("fetch-stock-data", { isin });
  return true; // Job added
};
