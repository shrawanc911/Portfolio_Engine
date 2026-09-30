import dotenv from "dotenv";
import { Worker } from "bullmq";

// Load environment variables FIRST, before any other imports
dotenv.config();

// Now import everything else
import connectDB from "./config/db";
import { initPortfolioWorker } from "./workers/portfolioProcessor.worker";

let worker: Worker | null = null;

const startPortfolioProcessingWorker = async () => {
  try {
    console.log("📁 Starting Portfolio Processor Worker process...");

    // Connect to the database
    await connectDB();

    console.log(
      "✅ File Portfolio Process Worker connected to database and listening for jobs",
    );

    // Start the worker AFTER database connection
    worker = initPortfolioWorker();

    // Keep process alive
    process.on("SIGTERM", async () => {
      console.log(
        "Portfolio Processor Worker received SIGTERM, shutting down...",
      );
      if (worker) {
        await worker.close();
      }
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start the Portfolio Processor Worker:", error);
    process.exit(1);
  }
};

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception in Portfolio Processor Worker:", err);
  if (worker) worker.close();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "❌ Unhandled Rejection in Portfolio Processor Worker:",
    reason,
  );
  // Log it but don't exit since it might be recovereable
});

startPortfolioProcessingWorker();
