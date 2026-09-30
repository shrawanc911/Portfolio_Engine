import mongoose, { Document, Schema } from "mongoose";

export interface ITechnicalData extends Document {
  isin: string;
  nse_scrip_code?: string;
  bse_scrip_code?: string;

  name: string;
  industry?: string;

  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  pegRatio?: number | null;
  industryPe?: number | null;

  epsTtm: number | null;
  bookValue: number | null;

  dividendYield: number | null;
  dividendYieldInPercent: number | null;
  earningsYield?: number | null;

  roe: number | null;
  roa: number | null;
  roce: number | null;
  roic: number | null;

  operatingProfitMargin?: number | null;
  netProfitMargin?: number | null;

  evToSales?: number | null;
  evToEbitda?: number | null;

  priceToSales?: number | null;
  priceToOcf?: number | null;
  priceToFcf?: number | null;

  faceValue: number | null;
  cappedType: string;

  sectorPe?: number | null;
  sectorPb?: number | null;
  sectorRoe?: number | null;
  sectorRoce?: number | null;
  sectorDivYield?: number | null;

  pePremiumVsSector?: number | null;
  pbPremiumVsSector?: number | null;
  divYieldVsSector?: number | null;

  debtToEquity: number | null;
  debtToAsset: number | null;
  quickRatio: number | null;
  cashRatio: number | null;
  currentRatio: number | null;

  lastFetchedAt: Date;
  validTill: Date;
  status: "fresh" | "stale" | "refreshing";
}

/* -----------------------------
   Schema Definition
----------------------------- */
const TechnicalDataSchema = new Schema<ITechnicalData>(
  {
    // --------------------
    // Identifiers
    // --------------------
    isin: {
      type: String,
      required: true,
    },

    nse_scrip_code: { type: String, default: null },
    bse_scrip_code: { type: String, default: null },

    name: { type: String, required: true },
    industry: { type: String, default: null },

    // --------------------
    // Valuation Metrics
    // --------------------
    marketCap: { type: Number, default: null },
    peRatio: { type: Number, default: null },
    pbRatio: { type: Number, default: null },
    pegRatio: { type: Number, default: null },
    industryPe: { type: Number, default: null },

    epsTtm: { type: Number, default: null },
    bookValue: { type: Number, default: null },

    dividendYield: { type: Number, default: null },
    dividendYieldInPercent: { type: Number, default: null },
    earningsYield: { type: Number, default: null },

    // --------------------
    // Profitability Ratios
    // --------------------
    roe: { type: Number, default: null },
    roa: { type: Number, default: null },
    roce: { type: Number, default: null },
    roic: { type: Number, default: null },

    operatingProfitMargin: { type: Number, default: null },
    netProfitMargin: { type: Number, default: null },

    // --------------------
    // Enterprise Multiples
    // --------------------
    evToSales: { type: Number, default: null },
    evToEbitda: { type: Number, default: null },

    priceToSales: { type: Number, default: null },
    priceToOcf: { type: Number, default: null },
    priceToFcf: { type: Number, default: null },

    // --------------------
    // Classification
    // --------------------
    faceValue: { type: Number, default: null },
    cappedType: {
      type: String,
      default: null,
    },

    // --------------------
    // Sector Comparison
    // --------------------
    sectorPe: { type: Number, default: null },
    sectorPb: { type: Number, default: null },
    sectorRoe: { type: Number, default: null },
    sectorRoce: { type: Number, default: null },
    sectorDivYield: { type: Number, default: null },

    pePremiumVsSector: { type: Number, default: null },
    pbPremiumVsSector: { type: Number, default: null },
    divYieldVsSector: { type: Number, default: null },

    debtToEquity: { type: Number, default: null },
    debtToAsset: { type: Number, default: null },
    quickRatio: { type: Number, default: null },
    cashRatio: { type: Number, default: null },
    currentRatio: { type: Number, default: null },

    // --------------------
    // Metadata
    // --------------------
    lastFetchedAt: { type: Date, required: true },
    validTill: { type: Date, required: true },
    status: {
      type: String,
      enum: ["fresh", "stale", "refreshing"],
      default: "fresh",
    },
  },
  {
    timestamps: true,
  },
);

/* -----------------------------
   Indexes
----------------------------- */
TechnicalDataSchema.index({ isin: 1 }, { unique: true });
TechnicalDataSchema.index({ nse_scrip_code: 1 });
TechnicalDataSchema.index({ bse_scrip_code: 1 });

TechnicalDataSchema.index({ marketCap: -1 });
TechnicalDataSchema.index({ peRatio: 1 });
TechnicalDataSchema.index({ pbRatio: 1 });
TechnicalDataSchema.index({ roe: -1 });
TechnicalDataSchema.index({ cappedType: 1 });
TechnicalDataSchema.index({ industry: 1 });

export const TechnicalData = mongoose.model<ITechnicalData>(
  "stock_technical",
  TechnicalDataSchema,
);
