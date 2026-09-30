import express from "express";
import {
  getSearchResult,
  getStock,
  getStockAuth,
  getStockReportData,
  getStockChartData,
  getIndexData,
} from "../controllers/stock.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { updateYearHighLow } from "../utils/test/stockUpdate";
const router = express.Router();

router.get("/get_stock_isin", getStock);
router.get("/get_stock_auth_isin", authenticate, getStockAuth);

router.get("/search_stock", getSearchResult);
router.get("/get_stock_report_data/:isin", getStockReportData);
router.get("/get_stock_chart_data/:isin", getStockChartData);

router.get("/update_year_low/:id", updateYearHighLow);
router.get("/get_index_data_by_securityId/:securityId", getIndexData);

export default router;
