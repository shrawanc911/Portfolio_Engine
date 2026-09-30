import mongoose, { Schema, Document, Model } from "mongoose";

export interface IScreenerSnapshot extends Document {
  isin: string;
  security_id: string;
  exchange: "NSE" | "BSE";
  rsi?: number;
  vwap?: number;
  ema10?: number;
  ema20?: number;
  ema_cross_price?: number;
  today_volume?: number;
  average_20_volume?: number;
  volume_ratio?: number;
  dma_199_sum?: number;
  dma_200?: number;
  last_close_above_dma200?: boolean;

  s_adx_5_timeframe?: number;
  s_rsi_5_timeframe?: number;
  s_aarthik_score_5_timeframe?: number;
  s_entry_5_timeframe?: Date;

  s_adx_15_timeframe?: number;
  s_rsi_15_timeframe?: number;
  s_aarthik_score_15_timeframe?: number;
  s_entry_15_timeframe?: Date;

  s_adx_60_timeframe?: number;
  s_rsi_60_timeframe?: number;
  s_aarthik_score_60_timeframe?: number;
  s_entry_60_timeframe?: Date;

  a_tss_5_timeframe?: number;
  a_dms_5_timeframe?: number;
  a_mas_5_timeframe?: number;
  a_aarthik_score_5_timeframe?: number;
  a_entry_5_timeframe?: Date;

  a_tss_15_timeframe?: number;
  a_dms_15_timeframe?: number;
  a_mas_15_timeframe?: number;
  a_aarthik_score_15_timeframe?: number;
  a_entry_15_timeframe?: Date;

  a_tss_60_timeframe?: number;
  a_dms_60_timeframe?: number;
  a_mas_60_timeframe?: number;
  a_aarthik_score_60_timeframe?: number;
  a_entry_60_timeframe?: Date;

  rsi_signal?: "Bullish" | "Bearish" | null;
  vwap_signal?: "Bullish" | "Bearish" | null;
  ema_signal?: "Bullish" | "Bearish" | null;
  volume_signal?: "Hit" | null;
  dma_signal?: "Hit" | null;

  rsi_entry: Date;
  vwap_entry: Date;
  ema_entry: Date;
  volume_entry: Date;
  dma_entry: Date;

  rsi_timeframe: string;
  vwap_timeframe: string;
  ema_timeframe: string;
  volume_timeframe: string;
  dma_timeframe: string;
  timeframe: string; // e.g. "1D", "5M", "15M"
  updated_at: Date;
  created_at: Date;
}

const ScreenerSnapshotSchema = new Schema<IScreenerSnapshot>(
  {
    isin: { type: String, required: true, index: true },
    security_id: { type: String, required: true },
    exchange: {
      type: String,
      enum: ["NSE", "BSE"],
      default: "NSE",
    },

    rsi: { type: Number, default: null },
    vwap: { type: Number, default: null },
    ema10: { type: Number, default: null },
    ema20: { type: Number, default: null },
    ema_cross_price: { type: Number, default: null },
    today_volume: { type: Number, default: null },
    average_20_volume: { type: Number, default: null },
    volume_ratio: { type: Number, default: null },
    dma_199_sum: { type: Number, default: null },
    dma_200: { type: Number, default: null },
    last_close_above_dma200: { type: Boolean, default: null },
    s_adx_5_timeframe: { type: Number, default: null },
    s_adx_15_timeframe: { type: Number, default: null },
    s_adx_60_timeframe: { type: Number, default: null },
    s_rsi_5_timeframe: { type: Number, default: null },
    s_rsi_15_timeframe: { type: Number, default: null },
    s_rsi_60_timeframe: { type: Number, default: null },
    s_aarthik_score_5_timeframe: { type: Number, default: null },
    s_aarthik_score_15_timeframe: { type: Number, default: null },
    s_aarthik_score_60_timeframe: { type: Number, default: null },
    s_entry_5_timeframe: { type: Date, default: null },
    s_entry_15_timeframe: { type: Date, default: null },
    s_entry_60_timeframe: { type: Date, default: null },

    a_tss_5_timeframe: { type: Number, default: null },
    a_tss_15_timeframe: { type: Number, default: null },
    a_tss_60_timeframe: { type: Number, default: null },
    a_dms_5_timeframe: { type: Number, default: null },
    a_dms_15_timeframe: { type: Number, default: null },
    a_dms_60_timeframe: { type: Number, default: null },
    a_mas_5_timeframe: { type: Number, default: null },
    a_mas_15_timeframe: { type: Number, default: null },
    a_mas_60_timeframe: { type: Number, default: null },
    a_aarthik_score_5_timeframe: { type: Number, default: null },
    a_aarthik_score_15_timeframe: { type: Number, default: null },
    a_aarthik_score_60_timeframe: { type: Number, default: null },
    a_entry_5_timeframe: { type: Date, default: null },
    a_entry_15_timeframe: { type: Date, default: null },
    a_entry_60_timeframe: { type: Date, default: null },

    rsi_signal: {
      type: String,
      enum: ["Bullish", "Bearish", null],
      default: null,
    },
    vwap_signal: {
      type: String,
      enum: ["Bullish", "Bearish", null],
      default: null,
    },
    ema_signal: {
      type: String,
      enum: ["Bullish", "Bearish", null],
      default: null,
    },
    volume_signal: {
      type: String,
      enum: ["Hit", null],
      default: null,
    },
    dma_signal: {
      type: String,
      enum: ["Hit", null],
      default: null,
    },
    rsi_entry: {
      type: Date,
    },
    vwap_entry: {
      type: Date,
    },
    ema_entry: {
      type: Date,
    },
    volume_entry: {
      type: Date,
    },
    dma_entry: {
      type: Date,
    },

    rsi_timeframe: {
      type: String,
      default: null,
    },
    vwap_timeframe: {
      type: String,
      default: null,
    },
    ema_timeframe: {
      type: String,
      default: null,
    },
    volume_timeframe: {
      type: String,
      default: null,
    },
    dma_timeframe: {
      type: String,
      default: null,
    },

    // Useful if you store multiple timeframes (1D, 5M, etc.)
    timeframe: { type: String, default: "60M" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// 🔥 Important compound index for fast screener queries
ScreenerSnapshotSchema.index({ isin: 1, exchange: 1 }, { unique: true });

ScreenerSnapshotSchema.index({ isin: 1, vwap_signal: 1 });
ScreenerSnapshotSchema.index({ isin: 1, rsi_signal: 1 });

// Optional: index for filtering by signals / indicators
ScreenerSnapshotSchema.index({ volume_signal: 1 });
ScreenerSnapshotSchema.index({ vwap_signal: 1 });
ScreenerSnapshotSchema.index({ rsi_signal: 1 });
ScreenerSnapshotSchema.index({ ema_signal: 1 });
ScreenerSnapshotSchema.index({ dma_signal: 1 });

export const ScreenerSnapshot: Model<IScreenerSnapshot> =
  mongoose.models.ScreenerSnapshot ||
  mongoose.model<IScreenerSnapshot>(
    "screener_snapshot",
    ScreenerSnapshotSchema,
  );
