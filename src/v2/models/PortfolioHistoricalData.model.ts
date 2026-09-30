import mongoose, { Schema, Document } from "mongoose";

// Portfolio Performance Interface
export interface IPortfolioHistoricalData extends Document {
  portfolio_id: mongoose.Types.ObjectId;
  date: Date;
  price: number;
  total_returns: number;
  today_net_change: number;
  invested_amount: number;
  today_percent_change: number;
}

// Schema Definition
const portfolioHistoricalDataSchema = new Schema<IPortfolioHistoricalData>(
  {
    portfolio_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Portfolio",
    },
    date: { type: Date, required: true },
    price: { type: Number, required: true },
    total_returns: { type: Number, required: true },
    today_net_change: { type: Number, required: true },
    invested_amount: { type: Number, required: true },
    today_percent_change: { type: Number, required: true },
  },
  { timestamps: true },
);

portfolioHistoricalDataSchema.index(
  { portfolio_id: 1, date: 1 },
  { unique: true },
);

// Create and export model
export const PortfolioHistoricalData = mongoose.model<IPortfolioHistoricalData>(
  "PortfolioHistoricalData",
  portfolioHistoricalDataSchema,
);
