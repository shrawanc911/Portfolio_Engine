import express from "express";
import {
  getDashboardData,
  getMostQueriedStocks,
  getMostTrackedAssets,
  getUsersPortfolioValue,
  getSectorDistribution,
} from "../controllers/dashboard.controller";

const router = express.Router();

router.get("/get_data", getDashboardData);
router.post("/bulk_portfolio_data", getUsersPortfolioValue);
router.get("/get_most_tracked_assets", getMostTrackedAssets);
router.get("/get_most_queried_stocks", getMostQueriedStocks);
router.get("/get_sector_distribution", getSectorDistribution);

export default router;
