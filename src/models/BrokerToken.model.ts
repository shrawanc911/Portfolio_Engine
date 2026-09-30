import mongoose, { Schema, Document } from "mongoose";

export interface IBrokerToken extends Document {
  broker: string;
  client_id: string;
  access_token: string;
  expires_at: Date;
  issued_at: Date;
  updated_at: Date;
  created_at: Date;
}

const BrokerTokenSchema = new Schema<IBrokerToken>(
  {
    broker: { type: String, required: true },
    client_id: { type: String, required: true },
    access_token: { type: String, required: true },
    expires_at: { type: Date, required: true },
    issued_at: { type: Date, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BrokerTokenSchema.index({ broker: 1, client_id: 1 }, { unique: true });

export const BrokerToken = mongoose.model<IBrokerToken>(
  "BrokerToken",
  BrokerTokenSchema,
);
