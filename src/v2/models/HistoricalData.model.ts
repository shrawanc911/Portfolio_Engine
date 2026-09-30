import mongoose, { Schema } from "mongoose";

const historicalSchema = new Schema(
  {
    meta: {
      security_id: {
        type: String,
        required: true,
      },

      exchange: {
        type: String,
        required: true,
      },

      isin: {
        type: String,
        required: true,
      },
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    close: {
      type: Number,
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

historicalSchema.index({
  "meta.security_id": 1,
  "meta.exchange": 1,
  date: 1,
});

historicalSchema.index({ "meta.isin": 1 });

export const StockHistorical = mongoose.model(
  "StockHistorical",
  historicalSchema,
  "stock_historical",
);
