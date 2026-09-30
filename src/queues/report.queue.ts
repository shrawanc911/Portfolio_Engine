import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const WEEKLY_REPORT_QUEUE_NAME = "periodic-report-queue";

/**
 * Queue for processing weekly portfolio report generation and delivery
 */
export const weeklyReportQueue = new Queue(WEEKLY_REPORT_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: "exponential",
            delay: 5000, // 5s, then 10s
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 200, // Keep last 200 failed jobs for debugging
    },
});

/**
 * Add a weekly report job for a specific user
 */
export const addWeeklyReportJob = async (
    userId: string,
    userName: string,
    phone: string,
    periodStart: Date,
    periodEnd: Date
) => {
    const jobId = `weekly-report-${userId}-${periodStart.toISOString().split("T")[0]}`;

    return weeklyReportQueue.add(
        "generate-weekly-report",
        {
            userId,
            userName,
            phone,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
        },
        {
            jobId, // Ensures idempotency - same user+week = same job ID
        }
    );
};
