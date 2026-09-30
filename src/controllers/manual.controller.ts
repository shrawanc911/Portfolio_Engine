import { Response } from "express";
import PortfolioModel from "../models/Portfolio.model";
import { portfolioProcessorQueue } from "../queues";
import {
  InputHolding,
  AuthenticatedRequest,
} from "../interface/file.interface";
import { PortfolioViewEvent } from "../models/PortfolioViewEvent.model";

import mongoose from "mongoose";

export const addManualStocks = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const session = await mongoose.startSession();

  try {
    const { inputHolding = [], operation = "NEW" } = req.body;
    const userId = req.user?.userId;

    /* -------------------- Basic validation -------------------- */
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }
    /* -------------------- OPERATION VALIDATION -------------------- */
    if (!["NEW", "ADD", "EDIT"].includes(operation)) {
      return res.status(400).json({
        success: false,
        error: 'type must be one of "NEW", "ADD", "EDIT"',
      });
    }

    if (!Array.isArray(inputHolding)) {
      return res.status(400).json({
        success: false,
        error: "inputHolding must be an array",
      });
    }

    if (operation !== "EDIT" && inputHolding.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Holdings are required for NEW and ADD",
      });
    }

    /* -------------------- Validate + normalize holdings -------------------- */
    const seen = new Set<string>();
    console.log("Manual:", inputHolding);
    const mappedStocks: InputHolding[] = inputHolding.map((h: InputHolding) => {
      const avg = Number(h.average_buy_price);
      const qty = Number(h.quantity);

      if (!h.isin || Number.isNaN(avg) || Number.isNaN(qty)) {
        throw new Error("INVALID_HOLDING_DATA");
      }

      if (h.quantity <= 0 || h.average_buy_price <= 0) {
        throw new Error("NEGATIVE_OR_ZERO_VALUES");
      }

      if (seen.has(h.isin)) {
        throw new Error(`DUPLICATE_ISIN:${h.isin}`);
      }

      seen.add(h.isin);

      return {
        isin: h.isin,
        average_buy_price: h.average_buy_price,
        quantity: h.quantity,
        buy_value: h.average_buy_price * h.quantity,
      };
    });

    let portfolio: any;

    /* -------------------- DB TRANSACTION -------------------- */
    await session.withTransaction(async () => {
      portfolio = await PortfolioModel.findOne(
        { user_id: userId, broker: "MANUAL" },
        null,
        { session },
      );

      /* -------- OPERATION RULES -------- */
      if (operation === "NEW" && portfolio) {
        throw new Error("PORTFOLIO_ALREADY_EXISTS");
      }

      if ((operation === "ADD" || operation === "EDIT") && !portfolio) {
        throw new Error("PORTFOLIO_NOT_FOUND");
      }

      /* -------- CREATE PORTFOLIO -------- */
      if (!portfolio && operation === "NEW") {
        portfolio = await PortfolioModel.create(
          [
            {
              user_id: userId,
              broker: "MANUAL",
              current_value: 0,
              invested_amount: 0,
              total_returns: 0,
              today_net_change: 0,
              today_percent_change: 0,
            },
          ],
          { session },
        ).then((p) => p[0]);
      }

      /* -------- AUDIT EVENT -------- */
      if (operation === "EDIT") {
        await PortfolioViewEvent.create(
          [{ user_id: userId, event: "manual_edit" }],
          { session },
        );
      }
    });

    /* -------------------- Queue job AFTER commit -------------------- */
    const jobName =
      operation === "EDIT" ? "process-manual-edit" : "process-manual-stocks";

    const job = await portfolioProcessorQueue.add(
      jobName,
      {
        holdings: mappedStocks || [],
        portfolioId: portfolio._id,
        userId,
      },
      {
        jobId: `manual-${portfolio._id}-${Date.now()}`,
        removeOnComplete: {
          age: 900, // Keep for 15 minutes
          count: 100, // Keep last 100 jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
      },
    );

    return res.status(202).json({
      success: true,
      message: "Manual stocks processing in background 🚀",
      portfolioId: portfolio._id,
      jobId: job.id,
    });
  } catch (err: any) {
    console.error("Manual stock error:", err.message);

    /* -------------------- KNOWN ERRORS -------------------- */
    if (err.message === "INVALID_HOLDING_DATA") {
      return res.status(400).json({
        success: false,
        error: "Invalid holding data format",
      });
    }

    if (err.message === "NEGATIVE_OR_ZERO_VALUES") {
      return res.status(400).json({
        success: false,
        error: "Quantity and price must be greater than zero",
      });
    }

    if (err.message.startsWith("DUPLICATE_ISIN")) {
      return res.status(400).json({
        success: false,
        error: err.message.replace("DUPLICATE_ISIN:", "Duplicate ISIN: "),
      });
    }

    if (err.message === "PORTFOLIO_ALREADY_EXISTS") {
      return res.status(409).json({
        success: false,
        error: "Manual portfolio already exists",
      });
    }

    if (err.message === "PORTFOLIO_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Manual portfolio not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};
