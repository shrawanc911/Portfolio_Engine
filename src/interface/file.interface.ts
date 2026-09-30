import mongoose from "mongoose";
import { Request } from "express";

import { IHolding } from "../models/Holding.model";

export interface IGrow {
  stock_name: string;
  isin: string;
  quantity: number;
  average_buy_price: number;
  buy_value: number; // quantity * average_buy_price
  current_price: number; // latest price of stock
  current_holding_value: number; // quantity * current_price
  profit_loss: number; // closing_value - buy_value
}

export interface InputHolding {
  isin: string;
  average_buy_price: number;
  quantity: number;
  buy_value: number;
}

export interface AuthenticatedRequest extends Request {
  user?: { userId: mongoose.Types.ObjectId };
}

// Interfaces for response structure
export interface InvestmentCategory {
  id: string;
  name: string;
  invAmount: number;
  currValue: number;
  dayChange: number;
  dayChangePercent: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  weight: number;
  investments: IHolding[];
}

export interface DhanPayload {
  securityId: number;
  exchangeSegment: string;
  instrument: string;
  oi: boolean;
  fromDate: string;
  toDate: string;
}

export interface CandleData {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamp: number[];
}

export interface DhanIntradayPayload {
  securityId: number;
  exchangeSegment: string;
  instrument: string;
  interval: number;
  oi: boolean;
  fromDate: string;
  toDate: string;
}

export interface StockDetails {
  DISPLAY_NAME: string;
  SYMBOL_NAME: string;
  ISIN: string;
  EXCH_ID: string | null;
  SECURITY_ID: string | null;
}

export interface CrossSignal {
  type: "Bullish" | "Bearish";
  index: number;
  timestamp: Date;
  price: number;
  ema10: number;
  ema20: number;
}

export interface VolumeExpansionCandleResult {
  index: number;
  timestamp: Date;
  volume: number;
  avgVolume: number;
  ratio: number; // volume / avgVolume
  signal: "Hit" | null;
}

export interface DMAResult {
  index: number;
  timestamp: Date;
  close: number;
  dma200: number;
  signal: "Bullish" | "Bearish" | null;
}
