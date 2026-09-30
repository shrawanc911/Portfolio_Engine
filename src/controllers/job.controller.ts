import { Response } from "express";
import { AuthenticatedRequest } from "../interface/file.interface";
import { portfolioProcessorQueue } from "../queues";
import portfolioModel from "../models/Portfolio.model";
import { getProgressMessage } from "../helper/job.helper";

export const getUploadStatus = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { jobId } = req.params;

    // Validate jobId exists
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    // Get job status from BullMQ
    const job = await portfolioProcessorQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }
    const state = await job.getState();
    const progress = (job.progress as number) || 0;

    // Check if job is completed
    if (state === "completed") {
      const portfolio = await portfolioModel.findById(job.data.portfolioId);
      return res.json({
        success: true,
        status: "completed",
        progress: 100,
        portfolio: portfolio,
      });
    }

    // Job is still processing
    if (state === "active" || state === "waiting") {
      return res.json({
        success: true,
        status: "processing",
        progress: progress,
        message: getProgressMessage(progress),
      });
    }

    // Job failed
    if (state === "failed") {
      return res.json({
        success: false,
        status: "failed",
        message: job.failedReason || "Processing failed",
      });
    }
  } catch (err) {
    console.error("Error checking upload status:", err);
    return res.status(500).json({
      success: false,
      message: "Error checking status",
    });
  }
};
