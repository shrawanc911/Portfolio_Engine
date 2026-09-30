import mongoose, { Schema, Document } from "mongoose";

// Interface for a single chart data point
interface IChartData {
  day: string;
  price: number;
  total_returns: number;
  today_net_change: number;
  invested_amount: number;
  today_percent_change: number;
  xirr: number;
}

// Portfolio Performance Interface
export interface IPortfolioPerformance extends Document {
  portfolio_id: mongoose.Types.ObjectId;
  chartData: IChartData[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema Definition
const portfolioPerformanceSchema = new Schema<IPortfolioPerformance>(
  {
    portfolio_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "Portfolio",
    },
    chartData: [
      {
        day: { type: String, required: true },
        price: { type: Number, required: true },
        total_returns: { type: Number, required: true },
        today_net_change: { type: Number, required: true },
        invested_amount: { type: Number, required: true },
        today_percent_change: { type: Number, required: true },
        xirr: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

// Create and export model
export const PortfolioPerformance = mongoose.model<IPortfolioPerformance>(
  "PortfolioPerformance",
  portfolioPerformanceSchema
);
