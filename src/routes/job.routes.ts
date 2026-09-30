import express from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { getUploadStatus } from "../controllers/job.controller";

const router = express.Router();

router.get("/upload_status/:jobId", authenticate, getUploadStatus);

export default router