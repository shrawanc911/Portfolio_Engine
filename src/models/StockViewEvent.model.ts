import mongoose from "mongoose";

const StockViewEventSchema = new mongoose.Schema(
  {
    isin: { type: String, required: true },

    userId: String,

    display_name: String,
    underlying_symbol: String,
    
    viewedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// compound indexes for analytics
StockViewEventSchema.index({ isin: 1, viewedAt: -1 });
StockViewEventSchema.index({ userId: 1, viewedAt: -1 });

export const StockViewEvent = mongoose.model(
  "StockViewEvent",
  StockViewEventSchema
);
