import mongoose from "mongoose";

const WatchlistSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: { type: String, required: true },
  },
  { timestamps: true },
);

// ✅ SINGLE correct unique index
WatchlistSchema.index({ user_id: 1, name: 1 }, { unique: true });
WatchlistSchema.index({ user_id: 1, createdAt: 1 });

export const Watchlist = mongoose.model("Watchlist", WatchlistSchema);
