import express from "express";
import {
  getPortfolioData,
  disconnectBroker,
  getConnectedPortfolios,
} from "../controllers/portfolio.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/get_portfolio/:id", authenticate, getPortfolioData);
router.get("/get_connected_portfolios", authenticate, getConnectedPortfolios);
router.delete("/disconnect/:id", authenticate, disconnectBroker);

export default router;
