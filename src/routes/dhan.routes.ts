import express from "express";
import {
  generateConsent,
  callback,
  resync,
} from "../controllers/dhan.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/generate-consent", authenticate, generateConsent);
router.get("/callback", callback);
router.post("/resync", authenticate, resync);

export default router;
