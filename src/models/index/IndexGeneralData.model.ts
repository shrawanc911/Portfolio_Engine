import mongoose, { Schema } from "mongoose";

export interface IIndexGeneralData extends Document {
  security_id: string;

  image_url?: string;

  underlying_symbol: string;
  symbol_name: string;
  display_name: string;
  exchange: "NSE" | "BSE";

  previous_day_close: number;
  current_price: number;
  today_percent_change: number;
  today_net_change: number;

  year_high: number;
  year_low: number;
  today_high: number;
  today_low: number;
}

const IndexGeneralDataSchema = new Schema<IIndexGeneralData>(
  {
    security_id: { type: String, required: true, index: true },

    underlying_symbol: { type: String, required: true },
    symbol_name: { type: String, required: true },
    display_name: { type: String, required: true },
    exchange: {
      type: String,
      enum: ["NSE", "BSE"],
      required: true,
      default: "NSE",
    },

    previous_day_close: Number,
    current_price: Number,

    today_percent_change: Number,
    today_net_change: Number,

    year_high: Number,
    year_low: Number,
    today_high: Number,
    today_low: Number,
  },
  { timestamps: true },
);

// ------------------------------
// Indexes (Screener Optimized)
// ------------------------------
IndexGeneralDataSchema.index({ symbol_name: 1 });
IndexGeneralDataSchema.index({ underlying_symbol: 1 });

// Price & momentum sorting
IndexGeneralDataSchema.index({ current_price: -1 });
IndexGeneralDataSchema.index({ today_percent_change: -1 });

export const IndexGeneralData = mongoose.model<IIndexGeneralData>(
  "index_general",
  IndexGeneralDataSchema,
);
