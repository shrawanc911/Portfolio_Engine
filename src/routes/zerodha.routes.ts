import express from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { getLoginUrl, callback } from "../controllers/zerodha.controller";

const router = express.Router();

router.get("/get_login_url", authenticate, getLoginUrl);
router.get("/get_login/callback", authenticate, callback);

export default router;
