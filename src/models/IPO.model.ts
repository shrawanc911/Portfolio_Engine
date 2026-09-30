import { model, Schema } from "mongoose";

interface IIPO {
  symbol: string;
  name: string;
  status: "upcoming" | "listed" | "active" | "closed";
  is_sme: boolean;
  additional_text: string | null;
  min_price: number | null;
  max_price: number | null;
  issue_price: number | null;
  listing_gains: number | null;
  listing_price: number | null;
  bidding_start_date: Date | null;
  bidding_end_date: Date | null;
  listing_date: Date | null;
  lot_size: number | null;
  document_url: string | null;
  is_synced: boolean;
}

const IPOSchema = new Schema<IIPO>(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["upcoming", "listed", "active", "closed"],
      index: true,
    },
    is_sme: {
      type: Boolean,
      required: true,
    },
    additional_text: {
      type: String,
      default: null,
    },
    min_price: {
      type: Number,
      default: null,
    },
    max_price: {
      type: Number,
      default: null,
    },
    issue_price: {
      type: Number,
      default: null,
    },
    listing_gains: {
      type: Number,
      default: null,
    },
    listing_price: {
      type: Number,
      default: null,
    },
    bidding_start_date: {
      type: Date,
      default: null,
    },
    bidding_end_date: {
      type: Date,
      default: null,
    },
    listing_date: {
      type: Date,
      default: null,
    },
    lot_size: {
      type: Number,
      default: null,
    },
    document_url: {
      type: String,
      default: null,
    },
    is_synced: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default model("ipo", IPOSchema);
