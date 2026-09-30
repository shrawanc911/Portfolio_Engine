import mongoose, { Schema, Document } from "mongoose";

interface IFinancial extends Document {
  isin: string;

  quarter_results: Record<string, Record<string, number>>;
  yoy_results: Record<string, Record<string, number>>;

  balancesheet: Record<string, Record<string, number>>;
  cashflow: Record<string, Record<string, number>>;
  ratios: Record<string, Record<string, number>>;

  shareholding_pattern_quarterly: Record<string, Record<string, number>>;
  shareholding_pattern_yearly: Record<string, Record<string, number>>;

  profit_loss_stats: Record<string, Record<string, number>>;

  lastFetchedAt: Date;
  //   validTill: Date;
  //   status: "fresh" | "stale" | "refreshing";
}

/* --------------------------------
   Reusable Map Schema
--------------------------------- */
const NumberMap = {
  type: Map,
  of: Number,
  default: {},
};

const StringMap = {
  type: Map,
  of: String,
  default: {},
};

/* --------------------------------
   Schema Definition
--------------------------------- */
const FinancialDataSchema = new Schema<IFinancial>(
  {
    // --------------------
    // Identifier
    // --------------------
    isin: {
      type: String,
      required: true,
    },

    // --------------------
    // Quarterly Results
    // --------------------
    quarter_results: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Yearly / YoY Results
    // --------------------
    yoy_results: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Balance Sheet
    // --------------------
    balancesheet: {
      type: Map,
      of: NumberMap,
      default: {},
    },
    // --------------------
    // Cash Flow
    // --------------------
    cashflow: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Ratios (Historical)
    // --------------------
    ratios: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Shareholding Pattern
    // --------------------
    shareholding_pattern_quarterly: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    shareholding_pattern_yearly: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Profit & Growth Stats
    // --------------------
    profit_loss_stats: {
      type: Map,
      of: NumberMap,
      default: {},
    },

    // --------------------
    // Metadata
    // --------------------
    lastFetchedAt: {
      type: Date,
      required: true,
    },

    //   validTill: {
    //     type: Date,
    //     required: true,
    //   },

    //   status: {
    //     type: String,
    //     enum: ["fresh", "stale", "refreshing"],
    //     default: "fresh",
    //   },
  },
  { timestamps: true }
);

// Only lookup index (no heavy indexing needed here)
FinancialDataSchema.index({ isin: 1 }, { unique: true });

export const FinancialData2 = mongoose.model<IFinancial>(
  "stock_financial_2",
  FinancialDataSchema
);
