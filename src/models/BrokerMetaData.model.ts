import { Schema, model } from "mongoose";

const BrokerMetaDataSchema = new Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    broker: {
      type: String,
      enum: ["DHAN"],
      required: true,
      index: true,
    },
    broker_client_id: {
      type: String,
      required: true,
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One broker account per user
BrokerMetaDataSchema.index({ user_id: 1, broker: 1 }, { unique: true });

export const BrokerMetaData = model("BrokerMetaData", BrokerMetaDataSchema);
