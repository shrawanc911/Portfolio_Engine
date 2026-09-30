import { Job, Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import {
  handleDhanStocks,
  handleManualEditOrResync,
  handleManualStocks,
} from "./handler/portfolio.handler";

/**
 * BullMQ Worker for processing portfolio file uploads in the background.
 *
 * This worker:
 * - Receives file data from the queue
 * - Processes each row (validates, saves holdings, fetches stock data)
 * - Calculates portfolio metrics
 * - Updates portfolio document
 * - Calls AI portfolio analysis API
 * - Reports progress back to the job
 */

const jobHandlers: Record<string, (job: Job) => Promise<any>> = {
  "process-portfolio-resync": handleManualEditOrResync,
  "process-manual-edit": handleManualEditOrResync,
  "process-manual-stocks": handleManualStocks,
  "process-dhan-stocks": handleDhanStocks,
};

export const initPortfolioWorker = () => {
  const worker = new Worker(
    "portfolio-processor",
    async (job) => {
      const handler = jobHandlers[job.name];

      if (!handler) {
        throw new Error(`No handler registered for job: ${job.name}`);
      }

      try {
        return await handler(job);
      } catch (err: any) {
        console.error(`Error processing job ${job.name}:`, err);
        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // per second
      },
    },
  );

  console.log(
    "🚀 Portfolio Processor Worker is running and listening for jobs...",
  );

  return worker;
};
