import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { WeeklyReport, IWeeklyReport } from "../models/WeeklyReport.model";
import { addWeeklyReportJob } from "../queues/report.queue";
import { ENV } from "../config/env";
import { createCronLogger } from "../utils/logger";
import { triggerWeeklyReportsManually } from "../cron/weeklyReport.cron";
import Portfolio from "../models/Portfolio.model";
import Holding from "../models/Holding.model";

const router = Router();
const logger = createCronLogger("weekly-report-test");

// User interface for shared MongoDB
interface IUserBasic {
  _id: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
  phone?: string;
  isSubscribed?: boolean;
}

// Get user by ID - users are in the main aarthik database, not PORTFOLIO_MANAGER
const getUserById = async (userId: string): Promise<IUserBasic | null> => {
  try {
    const mainDb = mongoose.connection.useDb("AARTHIK");
    const usersCollection = mainDb.collection("users");
    const user = await usersCollection.findOne({
      _id: new mongoose.Types.ObjectId(userId),
    });
    return user as IUserBasic | null;
  } catch (error) {
    logger.error("Failed to get user by ID", { userId, error });
    return null;
  }
};

/**
 * POST /internal/test/weekly-report
 * Test endpoint to queue weekly report generation for a specific user
 * PDF generation and WhatsApp sending are now handled by pdf-service
 */
router.post("/test/weekly-report", async (req: Request, res: Response) => {
  const { userId, skipWhatsApp } = req.query;

  if (!userId || typeof userId !== "string") {
    res.status(400).json({
      success: false,
      error: "userId query parameter is required",
    });
    return;
  }

  logger.info("Test endpoint triggered", { userId, skipWhatsApp });

  try {
    // Fetch user
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: `User not found: ${userId}`,
      });
      return;
    }

    // Get phone from test config or user
    const phone = ENV.WEEKLY_REPORT_TEST_PHONE || user.phone;
    if (!phone && skipWhatsApp !== "true") {
      res.status(400).json({
        success: false,
        error:
          "No phone number available. Set WEEKLY_REPORT_TEST_PHONE or provide user with phone.",
      });
      return;
    }

    // Fetch portfolio
    const portfolio = await Portfolio.findOne({ user_id: userId });
    if (!portfolio) {
      res.status(404).json({
        success: false,
        error: `Portfolio not found for user: ${userId}`,
      });
      return;
    }

    const holdings = await Holding.find({ portfolio_id: portfolio._id });

    // Calculate period (previous week)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const end = new Date(now);
    end.setDate(now.getDate() - dayOfWeek);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    // Calculate sector data
    const totalValue = holdings.reduce(
      (sum, h) => sum + (h.current_holding_value || 0),
      0,
    );
    const sectorMap = new Map<string, number>();
    for (const h of holdings) {
      const sector = h.industry || "Other";
      const value = h.current_holding_value || 0;
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + value);
    }

    const allocation = Array.from(sectorMap.entries())
      .map(([sector, value]) => ({
        sector,
        percentage: Math.round((value / (totalValue || 1)) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 7);

    const sectorPerfMap = new Map<string, { total: number; count: number }>();
    for (const h of holdings) {
      const sector = h.industry || "Other";
      const change = h.today_percent_change || 0;
      const existing = sectorPerfMap.get(sector) || { total: 0, count: 0 };
      sectorPerfMap.set(sector, {
        total: existing.total + change,
        count: existing.count + 1,
      });
    }

    const sectorPerformance = Array.from(sectorPerfMap.entries())
      .map(([sector, data]) => ({
        sector,
        percentage: data.total / data.count,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 7);

    // Build report
    const weeklyReturns = portfolio.today_net_change || 0;
    const userName = user.name || "User";

    const reportData: Partial<IWeeklyReport> = {
      userId: new mongoose.Types.ObjectId(userId),
      userName,
      phone: phone || "",
      period: { start, end },
      summary: {
        weeklyReturns,
        weeklyReturnsPercentage:
          portfolio.current_value > 0
            ? (weeklyReturns / portfolio.current_value) * 100
            : 0,
        currentValue: portfolio.current_value || 0,
        totalReturns: portfolio.total_returns || 0,
        totalReturnsPercentage:
          portfolio.invested_amount > 0
            ? ((portfolio.total_returns || 0) / portfolio.invested_amount) * 100
            : 0,
        investedAmount: portfolio.invested_amount || 0,
        weekSummary: `Your portfolio ${weeklyReturns >= 0 ? "gained" : "lost"} ₹${Math.abs(weeklyReturns).toLocaleString("en-IN")}, ${weeklyReturns >= 0 ? "slightly outperforming" : "slightly underperforming"} the market.`,
      },
      contribution: holdings.slice(0, 2).map((h, i) => ({
        stockName: h.display_name,
        stockIcon: h.image_url,
        amount: Math.abs(h.profit_loss || 0),
        isGain: i === 0 ? (h.profit_loss || 0) >= 0 : (h.profit_loss || 0) < 0,
        description:
          (h.profit_loss || 0) >= 0
            ? "A major driver of total portfolio gains."
            : "Facing short-term downside pressure.",
      })),
      sectorPerformance,
      allocation,
      insights: [
        {
          title: `High Concentration in ${allocation[0]?.sector || "Top Sector"} (${allocation[0]?.percentage || 0}%)`,
          description:
            "This sector holds a significant portion of your portfolio, increasing overall volatility and sector dependency.",
        },
        {
          title: "Key Drags Affecting Stability",
          description:
            "Some holdings face pressure from short-term market conditions. Monitor them closely.",
        },
        {
          title: "Strong Performers Powering Growth",
          description:
            "Solid performers are adding resilience and consistent upside to your portfolio.",
        },
        {
          title: "Overall Risk Level: Moderate",
          description:
            "Your portfolio shows healthy long-term potential with manageable volatility.",
        },
      ],
      marketOverview: {
        snapshot: {
          title: "Market Snapshot",
          description:
            "Markets remained volatile, with indices showing mixed performance amid global uncertainty.",
        },
        keyDrivers: {
          title: "Key Drivers",
          description:
            "Domestic flows supported markets, while global tech sentiment weighed on IT stocks.",
        },
        risks: {
          title: "Risks / What to Watch",
          description:
            "Potential FII outflows and key global events could drive short-term volatility.",
        },
        globalCues: {
          title: "Global Cues",
          description:
            "Global markets showed cautious trading amid policy uncertainty and currency fluctuations.",
        },
      },
      stockUpdates: holdings.slice(0, 3).map((h) => ({
        stockName: h.display_name,
        stockIcon: h.image_url,
        trend: ((h.today_percent_change || 0) > 0.5
          ? "up"
          : (h.today_percent_change || 0) < -0.5
            ? "down"
            : "neutral") as "up" | "down" | "neutral",
        description: `${h.display_name} ${(h.today_percent_change || 0) >= 0 ? "shows steady performance with consistent growth" : "is stabilizing but faces near-term pressure"}.`,
      })),
      delivery: {
        channel: "whatsapp",
        status: "pending",
      },
    };

    // Save to MongoDB
    const savedReport = await WeeklyReport.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        "period.start": start,
      },
      reportData,
      { upsert: true, new: true },
    );

    const reportId = (savedReport._id as mongoose.Types.ObjectId).toString();
    logger.info("Report saved to MongoDB", { reportId });

    // Queue the job for pdf-service to process
    // pdf-service will generate PDF and send WhatsApp
    await addWeeklyReportJob(
      userId,
      userName,
      phone || "",
      start,
      end
    );

    res.json({
      success: true,
      reportId,
      message: "Report saved and queued for PDF generation by pdf-service",
      note: skipWhatsApp === "true" ? "WhatsApp will be skipped by worker" : "WhatsApp will be sent after PDF generation",
    });

  } catch (error: any) {
    logger.error("Test endpoint failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /internal/test/trigger-all-reports
 * Manually trigger weekly report generation for all subscribed users
 */
router.post(
  "/test/trigger-all-reports",
  async (req: Request, res: Response) => {
    logger.info("Trigger all reports endpoint called");

    try {
      const result = await triggerWeeklyReportsManually();
      res.json({
        success: true,
        message: "Weekly reports queued for processing by pdf-service",
        ...result,
      });
    } catch (error: any) {
      logger.error("Trigger all reports failed", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * GET /internal/test/preview-info
 * Get info about how to preview the weekly report
 */
router.get("/test/preview-info", async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "PDF generation has been migrated to pdf-service",
    instructions: [
      "1. Run: POST /internal/test/weekly-report?userId=<USER_ID>&skipWhatsApp=true",
      "2. The job will be queued for pdf-service to process",
      "3. Check pdf-service logs for PDF generation status",
      "4. WhatsApp will be sent automatically unless skipWhatsApp=true",
    ],
    note: "Local PDF preview is no longer available. Use pdf-service for all PDF generation.",
  });
});

export default router;
