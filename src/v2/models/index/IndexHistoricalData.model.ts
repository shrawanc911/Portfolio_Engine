import mongoose, { Schema } from "mongoose";

const indexHistoricalSchema = new Schema(
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

indexHistoricalSchema.index({
  "meta.security_id": 1,
  "meta.exchange": 1,
  date: 1,
});

export const IndexHistorical = mongoose.model(
  "IndexHistorical",
  indexHistoricalSchema,
  "index_historical",
);
