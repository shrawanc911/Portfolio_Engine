import mongoose, { Schema, Document } from "mongoose";

/* -----------------------------
   Sub Schemas
----------------------------- */

// Board Meeting Entry
const BoardMeetingSchema = new Schema(
  {
    meetingDate: { type: String, required: true }, // keep string (BSE format)
    agenda: { type: String, required: true },
  },
  { _id: false }
);

// Dividend Entry
const DividendSchema = new Schema(
  {
    recordDate: { type: String, required: true },
    exDate: { type: String, required: true },
    dividendPercent: { type: String, required: true }, // "1590%"
    details: { type: String },
  },
  { _id: false }
);

// Split Entry
const SplitSchema = new Schema(
  {
    recordDate: { type: String, required: true },
    exDate: { type: String, required: true },
    ratio: { type: String, required: true }, // "1:10"
  },
  { _id: false }
);

// Rights Issue Entry
const RightsSchema = new Schema(
  {
    recordDate: { type: String, required: true },
    exDate: { type: String, required: true },
    ratio: { type: String, required: true },
    premium: { type: String },
  },
  { _id: false }
);

/* -----------------------------
   Main Interface
----------------------------- */
export interface ICorporateActions extends Document {
  isin: string;

  board_meetings: {
    title: string;
    data: (typeof BoardMeetingSchema)[];
  };

  dividends: {
    title: string;
    data: (typeof DividendSchema)[];
  };

  splits: {
    title: string;
    data: (typeof SplitSchema)[];
  };

  bonus: {
    title: string;
    msg: string;
  };

  rights: {
    title: string;
    data: (typeof RightsSchema)[];
  };

  lastFetchedAt: Date;
  //   validTill: Date;
  //   status: "fresh" | "stale" | "refreshing";
}

/* -----------------------------
   Main Schema
----------------------------- */
const CorporateActionDataSchema = new Schema<ICorporateActions>(
  {
    // --------------------
    // Identifier
    // --------------------
    isin: {
      type: String,
      required: true,
    },

    // --------------------
    // Board Meetings
    // --------------------
    board_meetings: {
      title: { type: String, default: "Board Meeting" },
      data: { type: [BoardMeetingSchema], default: [] },
    },

    // --------------------
    // Dividends
    // --------------------
    dividends: {
      title: { type: String, default: "Dividend" },
      data: { type: [DividendSchema], default: [] },
    },

    // --------------------
    // Splits
    // --------------------
    splits: {
      title: { type: String, default: "Split" },
      data: { type: [SplitSchema], default: [] },
    },

    // --------------------
    // Bonus
    // --------------------
    bonus: {
      title: { type: String, default: "Bonus" },
      msg: { type: String, default: "" },
    },

    // --------------------
    // Rights Issue
    // --------------------
    rights: {
      title: { type: String, default: "Rights" },
      data: { type: [RightsSchema], default: [] },
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

CorporateActionDataSchema.index({ isin: 1 }, { unique: true });

export const CorporateActionData = mongoose.model<ICorporateActions>(
  "stock_corporate_action",
  CorporateActionDataSchema
);
