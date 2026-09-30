import mongoose, { Document, Schema } from "mongoose";

export interface IPortfolio extends Document {
  user_id: string; // Reference to User
  broker: string;
  portfolio_score?: number;
  xirr?: number;
  previous_day_close: number;
  today_net_change?: number;
  today_percent_change?: number;
  total_returns?: number;
  current_value: number;
  invested_amount: number;
  created_at?: Date;
  updated_at?: Date;
}

const PortfolioSchema = new Schema<IPortfolio>(
  {
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
    previous_day_close: {
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

PortfolioSchema.index({ broker: 1, user_id: 1 });
PortfolioSchema.index({ broker: 1 });
PortfolioSchema.index({ user_id: 1 });

export default mongoose.model<IPortfolio>("Portfolio", PortfolioSchema);
