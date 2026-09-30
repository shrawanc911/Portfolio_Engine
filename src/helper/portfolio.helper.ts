import { InvestmentCategory } from "../interface/file.interface";

export const safePercent = (num: number, den: number) =>
  den > 0 ? (num / den) * 100 : 0;

export const createEmptyCategory = (
  id: string,
  name: string,
): InvestmentCategory => ({
  id,
  name,
  invAmount: 0,
  currValue: 0,
  dayChange: 0,
  dayChangePercent: 0,
  unrealizedPnl: 0,
  unrealizedPnlPercent: 0,
  weight: 0,
  investments: [],
});
