import connectDB from "./config/db";
import "./workers/stock.worker";

const startWorker = async () => {
    console.log("Starting Stock Worker...");
    await connectDB();
};

startWorker();
