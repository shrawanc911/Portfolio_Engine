import mongoose, { Schema, Document } from "mongoose";

/* -----------------------------
   Sub Schemas
----------------------------- */

const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true },
    date: { type: String, required: true }, // keep as string (source varies)
    url: { type: String, required: true },
  },
  { _id: false }
);

const AnnualReportSchema = new Schema(
  {
    year: { type: String, required: true },
    url: { type: String, required: true },
    source: { type: String },
  },
  { _id: false }
);

const CreditRatingSchema = new Schema(
  {
    title: { type: String, required: true },
    date: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const ConcallSchema = new Schema(
  {
    date: { type: String, required: true },
    transcript: { type: String, default: null },
    ppt: { type: String, default: null },
    rec: { type: String, default: null },
  },
  { _id: false }
);

/* -----------------------------
   Main Interface
----------------------------- */
export interface IDocumentData extends Document {
  isin: string;

  recent_announcements: typeof AnnouncementSchema[];
  annual_reports: typeof AnnualReportSchema[];
  credit_ratings: typeof CreditRatingSchema[];
  concalls: typeof ConcallSchema[];

  lastFetchedAt: Date;
//   validTill: Date;
//   status: "fresh" | "stale" | "refreshing";
}

/* -----------------------------
   Main Schema
----------------------------- */
const DocumentDataSchema = new Schema<IDocumentData>(
  {
    // --------------------
    // Identifier
    // --------------------
    isin: {
      type: String,
      required: true,
    },

    // --------------------
    // Corporate Data
    // --------------------
    recent_announcements: {
      type: [AnnouncementSchema],
      default: [],
    },

    annual_reports: {
      type: [AnnualReportSchema],
      default: [],
    },

    credit_ratings: {
      type: [CreditRatingSchema],
      default: [],
    },

    concalls: {
      type: [ConcallSchema],
      default: [],
    },

    // --------------------
    // Metadata
    // --------------------
    lastFetchedAt: {
      type: Date,
      required: true,
    },

    // validTill: {
    //   type: Date,
    //   required: true,
    // },

    // status: {
    //   type: String,
    //   enum: ["fresh", "stale", "refreshing"],
    //   default: "fresh",
    // },
  },
  {
    timestamps: true,
  }
);

// Only lookup index
DocumentDataSchema.index({ isin: 1 }, { unique: true });

export const DocumentData = mongoose.model<IDocumentData>(
  "stock_document",
  DocumentDataSchema
);

