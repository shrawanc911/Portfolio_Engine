import express from "express";
import { verifyCronSecret } from "../middlewares/cron.middleware";

import { stockUpdateQueue } from "../queues";
import { previousDaySync } from "../utils/previousDaySync";
import { stockCache } from "../services/stockCache.service";
import { isMarketClosedToday } from "../utils/checkHoliday";
import { syncIPOData } from "../utils/syncIPOData";
import { generateAndSendMarketReport } from "../cron/marketReport.cron";
import { enqueueWeeklyReports } from "../cron/weeklyReport.cron";
import { refreshDhanToken } from "../services/dhanTokenManager.service";
import { ENV } from "../config/env";

const router = express.Router();

router.use(verifyCronSecret);

// /internal/cron/update-ltp
router.post("/update-ltp", async (req, res) => {
  try {
    if (isMarketClosedToday()) {
      res.status(200).json({ message: "Market is closed today. Skipped." });
      return;
    }

    const query = req.query.query as string;
    if (query && query === "FINAL_LTP_CALL") {
      console.log(
        "🕒 Received Final LTP Call Update Job request: ",
        new Date(),
      );
      await stockUpdateQueue.add(
        "update-ltp-final-call",
        {},
        { removeOnComplete: true, removeOnFail: 100 },
      );
    } else {
      console.log("🕒 Received LTP Update Job request: ", new Date());
      await stockUpdateQueue.add(
        "update-ltp",
        {},
        { removeOnComplete: true, removeOnFail: 100 },
      );
    }

    res
      .status(200)
      .json({ success: true, message: "LTP update job dispatched" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/compute-screener
router.post("/compute-screener", async (req, res) => {
  try {
    if (isMarketClosedToday()) {
      res.status(200).json({ message: "Market is closed today. Skipped." });
      return;
    }

    console.log("🕒 Received Compute Screener Job request: ", new Date());
    await stockUpdateQueue.add(
      "compute-screener",
      {},
      { removeOnComplete: true, removeOnFail: 100 },
    );
    res
      .status(200)
      .json({ success: true, message: "Compute screener job dispatched" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/previous-day-sync
router.post("/previous-day-sync", async (req, res) => {
  try {
    if (isMarketClosedToday()) {
      res.status(200).json({ message: "Market is closed today. Skipped." });
      return;
    }
    console.log(
      `🕒 Starting Previous Day Value Update Job request:`,
      new Date(),
    );

    await Promise.allSettled([
      stockCache.warmSecurityIdIsinCache(),
      previousDaySync(),
      syncIPOData(),
      stockUpdateQueue.add(
        "initialize-199dma",
        {},
        { removeOnComplete: true, removeOnFail: 100 },
      ),
    ]);

    console.log(
      `🕒 Ending Previous Day Value Update Job request: `,
      new Date(),
    );
    res
      .status(200)
      .json({ success: true, message: "Previous day sync complete" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/refresh-dhan-token
router.post("/refresh-dhan-token", async (req, res) => {
  try {
    console.log("Received scheduled token refresh request");
    await refreshDhanToken(ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_ONE);
    await refreshDhanToken(ENV.BROKER_NAME, ENV.DHAN_CLIENT_ID_TWO);
    console.log("✅ Both Dhan tokens refreshed successfully via HTTP trigger");
    res.status(200).json({ success: true, message: "Dhan tokens refreshed" });
  } catch (error: any) {
    console.error("Error during scheduled token refresh:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// /internal/cron/market-report-pre
router.post("/market-report-pre", async (req, res) => {
  try {
    if (!ENV.MARKET_REPORT_ENABLED) {
      res.status(200).json({ message: "Market report is disabled." });
      return;
    }

    if (isMarketClosedToday()) {
      console.log("📊 Market is closed today, skipping pre-market report");
      res.status(200).json({ message: "Market is closed today. Skipped." });
      return;
    }
    console.log("📊 Pre-market report HTTP triggered");
    // Don't await generation as it takes a long time, return immediate success.
    generateAndSendMarketReport(true).catch((err) => {
      console.error("Failed to generate pre-market report async:", err);
    });
    res
      .status(202)
      .json({ success: true, message: "Pre-market report generation started" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/market-report-post
router.post("/market-report-post", async (req, res) => {
  try {
    if (!ENV.MARKET_REPORT_ENABLED) {
      res.status(200).json({ message: "Market report is disabled." });
      return;
    }
    if (isMarketClosedToday()) {
      console.log("📊 Market is closed today, skipping post-market report");
      res.status(200).json({ message: "Market is closed today. Skipped." });
      return;
    }
    console.log("📊 Post-market report HTTP triggered");
    // Don't await generation as it takes a long time, return immediate success.
    generateAndSendMarketReport(false).catch((err) => {
      console.error("Failed to generate post-market report async:", err);
    });
    res.status(202).json({
      success: true,
      message: "Post-market report generation started",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Weekly Report Email Crons ──────────────────────────────────

// /internal/cron/weekly-report
router.post("/weekly-report", async (req, res) => {
  try {
    if (!ENV.WEEKLY_REPORT_ENABLED) {
      res.status(200).json({ message: "Weekly reports are disabled." });
      return;
    }
    console.log("📊 Weekly report HTTP triggered");
    // Don't await generation as it takes a long time
    enqueueWeeklyReports().catch((err) => {
      console.error("Failed to enqueue weekly reports async:", err);
    });
    res
      .status(202)
      .json({ success: true, message: "Weekly report generation started" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/daily-report
router.post("/daily-report", async (req, res) => {
  try {
    if (!ENV.WEEKLY_REPORT_ENABLED) {
      res
        .status(200)
        .json({ message: "Daily reports are disabled (uses weekly flag)." });
      return;
    }
    console.log("📊 Daily report HTTP triggered");
    enqueueWeeklyReports().catch((err) => {
      console.error("Failed to enqueue daily reports async:", err);
    });
    res
      .status(202)
      .json({ success: true, message: "Daily report generation started" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// /internal/cron/monthly-report
router.post("/monthly-report", async (req, res) => {
  try {
    if (!ENV.WEEKLY_REPORT_ENABLED) {
      res
        .status(200)
        .json({ message: "Monthly reports are disabled (uses weekly flag)." });
      return;
    }
    console.log("📊 Monthly report HTTP triggered");
    enqueueWeeklyReports().catch((err) => {
      console.error("Failed to enqueue monthly reports async:", err);
    });
    res
      .status(202)
      .json({ success: true, message: "Monthly report generation started" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
