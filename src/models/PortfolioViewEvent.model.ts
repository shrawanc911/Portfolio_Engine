import mongoose, { model } from "mongoose";

const PortfolioViewEventSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    event: {
      type: String,
      required: true,
      enum: ["portfolio", "resync", "report","manual_edit"],
    },
  },
  { timestamps: true },
);

// DAU / WAU / MAU
PortfolioViewEventSchema.index({ createdAt: 1, user_id: 1 });

// resync counts
PortfolioViewEventSchema.index({ event: 1, createdAt: 1 });

// per-user history / debugging
PortfolioViewEventSchema.index({ user_id: 1, event: 1, createdAt: -1 });

export const PortfolioViewEvent = model(
  "PortfolioViewEvent",
  PortfolioViewEventSchema,
);
