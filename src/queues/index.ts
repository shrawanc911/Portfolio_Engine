import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const portfolioProcessorQueue = new Queue("portfolio-processor", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs for debugging
  },
});

export const portfolioAnalysisQueue = new Queue("portfolio-analysis", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const stockUpdateQueue = new Queue("stock-update", {
  connection: redis,
  defaultJobOptions: { attempts: 5 },
});

// Re-export weekly report queue
export { weeklyReportQueue, addWeeklyReportJob } from "./report.queue";
