import mongoose from "mongoose";

const WatchlistItemSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    watchlist_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Watchlist",
      required: true,
      index: true,
    },
    isin: { type: String, required: true },
    exchange: { type: String, enum: ["BSE", "NSE"], default: "NSE" },
  },
  { timestamps: true },
);

// ✅ SINGLE correct unique index
WatchlistItemSchema.index(
  { user_id: 1, watchlist_id: 1, isin: 1 },
  { unique: true },
);

export const WatchlistItem = mongoose.model(
  "WatchlistItem",
  WatchlistItemSchema,
);
