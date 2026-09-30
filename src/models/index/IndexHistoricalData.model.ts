import mongoose, { Document, Schema } from "mongoose";

export interface IIndexHistoricalData extends Document {
  security_id: string;
  stock_exchange: string;
  chartData: {
    day: string;
    price: number;
  }[];
  lastAccessedAt: Date;
}

const indexHistoricalSchema = new Schema<IIndexHistoricalData>(
  {
    security_id: {
      type: String,
      unique: true,
      required: true,
    },
    stock_exchange: {
      type: String,
      required: true,
    },
    chartData: [
      {
        day: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
    lastAccessedAt: {
      type: Date,
      default: Date.now,
      index: true, // For efficient cleanup queries
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Compound index for faster lookups
indexHistoricalSchema.index({ security_id: 1, stock_exchange: 1 });

export default mongoose.model<IIndexHistoricalData>(
  "IndexHistoricalData",
  indexHistoricalSchema
);

