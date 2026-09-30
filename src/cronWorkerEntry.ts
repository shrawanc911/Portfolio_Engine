import dotenv from "dotenv";

// Load environment variables FIRST, before any other imports
dotenv.config();

// Now import everything else
import connectDB from "./config/db";
import "./workers/cronWorker"; // Start the cron worker only

const startCronWorker = async () => {
    try {
        console.log("🕰️ Starting Cron Worker process...");

        // 1. Connect to the database
        await connectDB();

        // 2. All crons are now in cronJob.ts (loaded via cronWorker import)

        console.log("✅ Cron Worker connected to database and listening for jobs");

        // Keep process alive
        process.on('SIGTERM', () => {
            console.log('Cron Worker received SIGTERM, shutting down...');
            process.exit(0);
        });

    } catch (error) {
        console.error("❌ Failed to start the Cron Worker:", error);
        process.exit(1);
    }
};

startCronWorker();
