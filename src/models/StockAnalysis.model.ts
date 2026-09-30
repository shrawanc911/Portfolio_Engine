import mongoose, { Schema, Document, Model } from "mongoose";

interface StockAnalysisDoc extends Document {
  stock_id: string;
  timeframe: "1d" | "1w" | "1m";
  date: Date;
  symbol: string;
  quick_analysis: string;
  strengths: string[];
  weaknesses: string[];
  sentiment: {
    outlook: string;
    summary: string;
    reasons: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const StockAnalysisSchema = new Schema<StockAnalysisDoc>(
  {
    stock_id: { type: String, required: true },
    timeframe: { type: String, required: true, enum: ["1d", "1w", "1m"] },
    date: { type: Date, required: true },
    symbol: { type: String },
    quick_analysis: { type: String, default: "" },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    sentiment: {
      outlook: { type: String, default: "" },
      summary: { type: String, default: "" },
      reasons: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

StockAnalysisSchema.index({ stock_id: 1, date: 1, timeframe: 1 }, { unique: true });

// ✅ Safe + Typed Export
export const StockAnalysis = (mongoose.models.StockAnalysis ||
  mongoose.model<StockAnalysisDoc>(
    "StockAnalysis",
    StockAnalysisSchema
  )) as Model<StockAnalysisDoc>;
