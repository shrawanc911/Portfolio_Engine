import mongoose from "mongoose";
import axios from "axios";
import { createCronLogger } from "../utils/logger";
import { ENV } from "../config/env";
import { mmiCacheKey } from "../services/tools.service";
import { redis } from "../config/redis";

const logger = createCronLogger("market-report-cron");

// ── User Email Fetching ─────────────────────────────────────────

interface IUserEmail {
    _id: mongoose.Types.ObjectId;
    name?: string;
    email?: string;
}

/**
 * Fetch all subscribed users with email addresses
 */
async function getUsersWithEmail(): Promise<IUserEmail[]> {
    try {
        const mainDb = mongoose.connection.useDb("AARTHIK_CHAT_BOT");
        const usersCollection = mainDb.collection("users");
        const users = await usersCollection
            .find({
                email: { $exists: true, $nin: [null, ""] },
                getEmail: { $ne: false },
            })
            .project({ _id: 1, name: 1, email: 1 })
            .toArray();

        return users.map((u: any) => ({
            _id: u._id as mongoose.Types.ObjectId,
            name: (u.name as string) || "User",
            email: u.email as string,
        }));
    } catch (error: any) {
        logger.error("Failed to fetch users with email", { error: error.message });
        return [];
    }
}

// ── MMI → moodType Mapping ──────────────────────────────────────

async function getMoodTypeFromMMI(): Promise<string> {
    try {
        const cacheKey = mmiCacheKey();
        const cached = await redis.get(cacheKey);

        if (cached) {
            const mmiData = JSON.parse(cached);
            // mmiData.sentiment: "Bullish" | "Bearish" | "Neutral"
            return mmiData.sentiment || "Cautious";
        }

        logger.warn("MMI data not found in cache, defaulting to Cautious");
        return "Cautious";
    } catch (error: any) {
        logger.error("Failed to read MMI from cache", { error: error.message });
        return "Cautious";
    }
}

// ── Report Generation Pipeline ──────────────────────────────────

export async function generateAndSendMarketReport(isPreMarket: boolean): Promise<void> {
    const reportType = isPreMarket ? "Pre-Market" : "Post-Market";

    console.log(`📊 [${reportType}] Report generation started`);
    logger.info(`${reportType} report generation started`);

    try {
        // Step 1: Fetch report data from market-service
        const marketServiceUrl = ENV.MARKET_SERVICE_URL || "http://localhost:5003";
        console.log(`📊 [${reportType}] Step 1: Fetching data from ${marketServiceUrl}/generate-report-data`);

        const dataResponse = await axios.post(
            `${marketServiceUrl}/generate-report-data`,
            { isPreMarket },
            { timeout: 60000 } // 60s timeout for Perplexity API
        );

        if (!dataResponse.data?.success || !dataResponse.data?.reportData) {
            throw new Error("market-service returned invalid response");
        }

        const reportData = dataResponse.data.reportData;
        console.log(`📊 [${reportType}] Step 1 ✅ Report data fetched successfully`);

        // Step 2: Override moodType with MMI for pre-market
        if (isPreMarket) {
            const mmiMood = await getMoodTypeFromMMI();
            reportData.moodType = mmiMood;
            console.log(`📊 [${reportType}] Step 2 ✅ MMI mood applied: ${mmiMood}`);
        }

        // Step 3: Fetch users with email
        const users = await getUsersWithEmail();
        console.log(`📊 [${reportType}] Step 3 ✅ Found ${users.length} users with email`);

        if (users.length === 0) {
            console.log(`📊 [${reportType}] ⚠️ No users with email found, skipping`);
            return;
        }

        // Step 4: Send to pdf-service for PDF generation + email delivery
        const pdfServiceUrl = ENV.PDF_SERVICE_URL || "http://localhost:5008";
        const emailUrl = `${pdfServiceUrl}/send-market-report-email`;
        console.log(`📊 [${reportType}] Step 4: Sending to pdf-service at ${emailUrl}`);

        const emailResponse = await axios.post(
            emailUrl,
            {
                reportData,
                users: users.map((u) => ({ email: u.email, name: u.name || "User" })),
            },
            { timeout: 60000 }
        );

        if (emailResponse.data?.success) {
            console.log(`📊 [${reportType}] Step 4 ✅ Email delivery queued! JobId: ${emailResponse.data.emailJobId}, Users: ${users.length}`);
            logger.info(`${reportType} report email delivery queued`, {
                emailJobId: emailResponse.data.emailJobId,
                userCount: users.length,
            });
        } else {
            console.log(`📊 [${reportType}] ❌ Email delivery failed:`, emailResponse.data);
            logger.error(`${reportType} report email delivery failed`, {
                response: emailResponse.data,
            });
        }
    } catch (error: any) {
        const responseData = error.response?.data;
        console.error(`📊 [${reportType}] ❌ FAILED:`, error.message);
        if (responseData) {
            console.error(`📊 [${reportType}] ❌ Response body:`, JSON.stringify(responseData));
        }
        logger.error(`${reportType} report generation failed`, {
            error: error.message,
            responseData,
            stack: error.stack,
        });
    }
}


/**
 * Manually trigger market report generation (for testing)
 */
export async function triggerMarketReportManually(isPreMarket: boolean): Promise<{
    success: boolean;
    message: string;
}> {
    try {
        await generateAndSendMarketReport(isPreMarket);
        return {
            success: true,
            message: `${isPreMarket ? "Pre" : "Post"}-market report generation triggered`,
        };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
