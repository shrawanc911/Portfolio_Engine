import express from "express";
import { addManualStocks } from "../controllers/manual.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/add_manual_input_stocks", authenticate, addManualStocks);

export default router;
