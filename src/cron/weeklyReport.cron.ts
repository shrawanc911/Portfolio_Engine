
import mongoose from "mongoose";
import { addWeeklyReportJob } from "../queues/report.queue";
import { createCronLogger } from "../utils/logger";
import { ENV } from "../config/env";

const logger = createCronLogger("weekly-report-cron");

// User interface for shared MongoDB
interface IUserBasic {
    _id: mongoose.Types.ObjectId;
    name?: string;
    phone?: string;
    isSubscribed?: boolean;
}

/**
 * Get the start and end dates of the previous week
 */
function getPreviousWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Get last Sunday (end of previous week)
    const end = new Date(now);
    end.setDate(now.getDate() - dayOfWeek);
    end.setHours(23, 59, 59, 999);

    // Get previous Monday (start of previous week)
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    return { start, end };
}

/**
 * Fetch all subscribed users with phone numbers
 * Users are in the main AARTHIK database, not PORTFOLIO_MANAGER
 */
async function getSubscribedUsers(): Promise<IUserBasic[]> {
    try {
        // Use useDb to access the AARTHIK database where users are stored
        const mainDb = mongoose.connection.useDb("AARTHIK");
        const usersCollection = mainDb.collection("users");
        const users = await usersCollection
            .find({
                isSubscribed: true,
                phone: { $exists: true, $nin: [null, ""] },
            })
            .project({ _id: 1, name: 1, phone: 1 })
            .toArray();

        return users.map((u: any) => ({
            _id: u._id as mongoose.Types.ObjectId,
            name: (u.name as string) || "User",
            phone: u.phone as string,
        }));
    } catch (error: any) {
        logger.error("Failed to fetch subscribed users", { error: error.message });
        return [];
    }
}

/**
 * Enqueue weekly report jobs for all subscribed users
 */
export async function enqueueWeeklyReports(): Promise<void> {
    const { start, end } = getPreviousWeekRange();

    logger.info("Weekly report cron triggered", {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
    });

    try {
        const users = await getSubscribedUsers();
        logger.info("Fetched subscribed users", { userCount: users.length });

        let enqueuedCount = 0;
        for (const user of users) {
            try {
                await addWeeklyReportJob(
                    user._id.toString(),
                    user.name || "User",
                    user.phone || "",
                    start,
                    end
                );
                enqueuedCount++;
                logger.debug("Job enqueued", {
                    userId: user._id.toString(),
                    jobId: `weekly-report-${user._id}-${start.toISOString().split("T")[0]}`,
                });
            } catch (error: any) {
                // If job already exists (idempotency), log and continue
                if (error.message?.includes("already exists")) {
                    logger.debug("Job already exists, skipping", {
                        userId: user._id.toString(),
                    });
                } else {
                    logger.error("Failed to enqueue job for user", {
                        userId: user._id.toString(),
                        error: error.message,
                    });
                }
            }
        }

        logger.info("Weekly report jobs enqueued", {
            totalUsers: users.length,
            enqueuedJobs: enqueuedCount,
        });
    } catch (error: any) {
        logger.error("Failed to enqueue weekly reports", {
            error: error.message,
        });
    }
}

/**
 * Manually trigger weekly report generation (for testing)
 */
export async function triggerWeeklyReportsManually(): Promise<{
    usersCount: number;
    period: { start: string; end: string };
}> {
    const { start, end } = getPreviousWeekRange();
    await enqueueWeeklyReports();

    const users = await getSubscribedUsers();
    return {
        usersCount: users.length,
        period: { start: start.toISOString(), end: end.toISOString() },
    };
}
