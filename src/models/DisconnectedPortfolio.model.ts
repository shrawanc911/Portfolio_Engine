import mongoose, { Document, Schema } from "mongoose";

interface IDisconnectPortfolio extends Document {
  portfolio_id: string;
  user_id: string; // Reference to User
  broker: string;
  portfolio_score?: number;
  xirr?: number;
  today_net_change?: number;
  today_percent_change?: number;
  total_returns?: number;
  current_value: number;
  invested_amount: number;
  created_at?: Date;
  updated_at?: Date;
}

const disconnectPortfolioSchema = new Schema<IDisconnectPortfolio>(
  {
    portfolio_id: {
      type: String,
      required: true,
      unique: true,
    },
    user_id: {
      type: String,
      required: true,
    },
    broker: {
      type: String,
      required: true,
    },
    portfolio_score: {
      type: Number,
      default: 0,
    },
    xirr: {
      type: Number,
      default: 0,
    },
    today_net_change: {
      type: Number,
      default: 0,
    },
    total_returns: {
      type: Number,
      default: 0,
    },
    current_value: {
      type: Number,
      default: 0,
    },
    invested_amount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IDisconnectPortfolio>(
  "Disconnected_portfolio",
  disconnectPortfolioSchema
);
