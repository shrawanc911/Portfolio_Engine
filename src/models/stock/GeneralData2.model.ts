import mongoose, { Document, Schema } from "mongoose";

export interface IGeneralData extends Document {
  isin: string;
  security_id: string;
  ticker_id: string;
  instrument_type: "EQUITY" | "ETF" | "MF";

  image_url?: string;

  underlying_symbol: string;
  symbol_name: string;
  display_name: string;
  exchange: "NSE" | "BSE";

  industry?: string;
  sector?: string;
  description?: string;
  market_cap?: number;
  capped_type?: string;

  previous_day_close: number;
  current_price: number;
  today_percent_change: number;
  today_net_change: number;

  year_high: number;
  year_low: number;
  today_high: number;
  today_low: number;

  peers?: any[]; // Array of peer ISINs

  lastFetchedAt?: Date;
}

const GeneralDataSchema = new Schema<IGeneralData>(
  {
    isin: { type: String, required: true },

    security_id: { type: String, required: true },
    ticker_id: { type: String, required: true },

    instrument_type: {
      type: String,
      enum: ["EQUITY", "ETF", "MF"],
      required: true,
    },

    image_url: String,

    underlying_symbol: { type: String, required: true },
    symbol_name: { type: String, required: true },
    display_name: { type: String, required: true },
    exchange: {
      type: String,
      enum: ["NSE", "BSE"],
      required: true,
      default: "NSE",
    },

    industry: String,
    sector: String,
    description: String,
    market_cap: Number,
    capped_type: String,

    previous_day_close: Number,
    current_price: Number,

    today_percent_change: Number,
    today_net_change: Number,

    year_high: Number,
    year_low: Number,
    today_high: Number,
    today_low: Number,

    peers: [{ type: Schema.Types.Mixed }], // Array of peer objects

    lastFetchedAt: Date,
  },
  { timestamps: true }
);

// ------------------------------
// Indexes (Screener Optimized)
// ------------------------------
GeneralDataSchema.index({ isin: 1 }, { unique: true });
GeneralDataSchema.index({ symbol_name: 1 });
GeneralDataSchema.index({ ticker_id: 1 });
GeneralDataSchema.index({ underlying_symbol: 1 });

// Price & momentum sorting
GeneralDataSchema.index({ current_price: -1 });
GeneralDataSchema.index({ today_percent_change: -1 });

// Sector / industry filters
GeneralDataSchema.index({ sector: 1 });
GeneralDataSchema.index({ industry: 1 });

// Instrument filtering
GeneralDataSchema.index({ instrument_type: 1 });

export const GeneralData2 = mongoose.model<IGeneralData>(
  "stock_general_2",
  GeneralDataSchema
);
