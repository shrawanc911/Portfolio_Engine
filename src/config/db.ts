import mongoose from "mongoose";
import { ENV } from "./env";

const connectDB = async () => {
  try {
    const baseURL = ENV.MONGO_URI;
    const conn = await mongoose.connect(baseURL, { dbName: 'PORTFOLIO_MANAGER' });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("DB Connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;
