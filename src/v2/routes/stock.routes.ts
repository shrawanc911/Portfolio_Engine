import express from "express";
import {
  getStockReportData,
  getStockChartData,
} from "../controllers/stock.controller";
const router = express.Router();

router.get("/get_stock_report_data/:isin", getStockReportData);
router.get("/get_stock_chart_data/:isin", getStockChartData);



export default router;
