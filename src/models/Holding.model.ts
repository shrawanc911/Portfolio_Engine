import mongoose, { Document, Schema } from "mongoose";

export interface IHolding extends Document {
  portfolio_id: mongoose.Types.ObjectId; // Reference to Portfolio

  isin: string;
  security_id: string;
  image_url?: string;
  display_name: string;
  underlying_symbol: string;
  exchange?: "NSE" | "BSE";
  instrument_type: "EQUITY" | "ETF" | "MF";

  industry: string;
  market_cap: number;
  capped_type: string;

  quantity: number;
  average_buy_price: number;
  buy_value: number; // quantity * average_buy_price

  today_percent_change?: number;
  today_net_change?: number;

  current_price: number; // latest price of stock
  current_holding_value: number; // quantity * current_price

  profit_loss: number; // closing_value - buy_value
  created_at?: Date;
  updated_at?: Date;
}

const holdingSchema = new Schema<IHolding>(
  {
    portfolio_id: {
      type: Schema.Types.ObjectId,
      ref: "Portfolio",
      required: true,
    },

    isin: {
      type: String,
      required: true,
    },
    security_id: {
      type: String,
      required: true,
    },
    image_url: {
      type: String,
    },
    display_name: {
      type: String,
      required: true,
    },
    underlying_symbol: {
      type: String,
      required: true,
    },
    exchange: {
      type: String,
      enum: ["NSE", "BSE"],
      required: true,
      default: "NSE",
    },
    instrument_type: {
      type: String,
      enum: ["EQUITY", "ETF", "MF"],
      required: true,
    },

    industry: {
      type: String,
      required: true,
    },
    market_cap: {
      type: Number,
      default: 0,
      min: 0,
    },
    capped_type: {
      type: String,
      required: true,
      default: "Small Cap",
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    average_buy_price: {
      type: Number,
      required: true,
      min: 0,
    },
    buy_value: {
      type: Number,
      required: true,
      min: 0,
    },

    current_price: {
      type: Number,
      default: 0,
      min: 0,
    },
    current_holding_value: {
      type: Number,
      default: 0,
      min: 0,
    },

    today_percent_change: {
      type: Number,
      required: true,
      default: 0,
    },
    today_net_change: {
      type: Number,
      required: true,
      default: 0,
    },

    profit_loss: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Optimize queries by portfolio_id (Critical for getPortfolioData)
holdingSchema.index({ portfolio_id: 1, isin: 1 });
holdingSchema.index({ isin: 1 });
holdingSchema.index({ portfolio_id: 1 });

export default mongoose.model<IHolding>("Holding", holdingSchema);
