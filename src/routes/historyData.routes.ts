import express from "express";
import {
  getPortfolioPerformanceHistoricalData,
  getStockHistoricalData,
} from "../controllers/historical.controller";
import { authenticate } from "../middlewares/auth.middleware";
// import { getStockHistoricalData } from "../controllers/controller.historicalData";

const router = express.Router();

router.get("/get_history_data", getStockHistoricalData);
router.get(
  "/get_portfolio_performance/:id",
  authenticate,
  getPortfolioPerformanceHistoricalData
);

export default router;
