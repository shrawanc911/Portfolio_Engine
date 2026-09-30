import { Worker } from "bullmq";
import { updateLTPofIndexes, updateLTPofStocks, updateStocksDetail } from "../utils/updateStock";
import { updatePortfolios } from "../utils/updatePortfolios";
import {
  createCronLogger,
  logJobStart,
  logJobSuccess,
  logJobError,
} from "../utils/logger";
import { redis, redisConnection } from "../config/redis";
import { ENV } from "../config/env";
import { calculateMMIIndex } from "../services/tools.service";
import {
  compute200DMA,
  computeDMA199BaseSum,
} from "../services/dmaScreener.service";
import { computeScreeners } from "../services/computeScreener.service";
import { historicalCache } from "../v2/services/cache/historicalCache.service";

const cronLogger = createCronLogger("cron-worker");

redis.on("connect", () => {
  cronLogger.info("Connected to Redis successfully");
});

redis.on("error", (err) => {
  cronLogger.error("Redis connection error", { error: err.message });
});

export const executerDhanOne = async (query?: string) => {
  await updateLTPofStocks();
  await Promise.allSettled([updateLTPofIndexes(), updatePortfolios()]);
  await Promise.allSettled([compute200DMA(), calculateMMIIndex()]);
  if (query && query === "FINAL_LTP_CALL") {
    await Promise.allSettled([
      historicalCache.finalLTPCallIndex(),
      historicalCache.finalLTPCallStock(),
    ]);
  }
};
const executerDhanTwo = async () => {
  await computeScreeners();
};

/**
 * Worker for handling Cron Job tasks (Stock Updates, Portfolio Updates)
 * This keeps the main API server responsive by offloading heavy loops.
 */
new Worker(
  "stock-update",
  async (job) => {
    const startTime = Date.now();
    const jobId = job.id;

    logJobStart(cronLogger, job.name, jobId);

    try {
      switch (job.name) {
        case "update-ltp":
          await executerDhanOne();
          break;
        case "update-ltp-final-call":
          await executerDhanOne("FINAL_LTP_CALL");
        case "compute-screener":
          await executerDhanTwo();
          break;
        case "update-details":
          await updateStocksDetail(job.data.isin);
          break;
        case "initialize-199dma":
          await computeDMA199BaseSum();
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      logJobSuccess(cronLogger, job.name, duration, jobId);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logJobError(cronLogger, job.name, err, jobId);
      cronLogger.debug("Job execution time before failure", {
        duration,
        jobName: job.name,
      });
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 1 },
);

new Worker(
  "portfolio-update",
  async (job) => {
    const startTime = Date.now();
    const jobId = job.id;

    logJobStart(cronLogger, job.name, jobId);

    try {
      // if (job.name === "update-portfolios") {
      //   await updatePortfolios();
      // }

      switch (job.name) {
        case "update-portfolios":
          await updatePortfolios();
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      logJobSuccess(cronLogger, job.name, duration, jobId);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logJobError(cronLogger, job.name, err, jobId);
      cronLogger.debug("Job execution time before failure", {
        duration,
        jobName: job.name,
      });
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 1 },
);

cronLogger.info("Cron Worker initialized and listening for scheduled tasks", {
  queues: ["stock-update", "portfolio-update"],
  redisHost: ENV.REDIS_HOST,
});
