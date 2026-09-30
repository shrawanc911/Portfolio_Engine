import { Request, Response } from "express";
import axios from "axios";
import { portfolioProcessorQueue } from "../queues";
import {
  InputHolding,
  AuthenticatedRequest,
} from "../interface/file.interface";
import { redis } from "../config/redis";
import { getConsentId } from "../helper/dhan.helper";
import { PortfolioViewEvent } from "../models/PortfolioViewEvent.model";
import { BrokerMetaData } from "../models/BrokerMetaData.model";
import PortfolioModel from "../models/Portfolio.model";
import mongoose from "mongoose";
import { ENV } from "../config/env";

export const generateConsent = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId || (req.query.userId as string);

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, error: "User ID is required" });
    }

    const response = await getConsentId(userId.toString());
    if (!response.success) {
      return res
        .status(500)
        .json({ success: false, error: "Consent id generation failed" });
    }

    // Construct the full login URL locally or use the one from response if applicable
    // Dhan docs usually imply: https://auth.dhan.co/consent-login?consentId=...
    // But let's check response.data.link if it exists, otherwise construct it.

    const loginUrl = response.loginUrl;
    const consentId = response.consentId;

    return res
      .status(200)
      .json({ success: true, consentId: consentId, login_url: loginUrl });
  } catch (err: any) {
    console.error("Error while generating consent:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Consent generation failed" });
  }
};

export const callback = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const { tokenId, consentId, status } = req.query;

    if (!tokenId || !consentId) {
      throw new Error("INVALID_CALLBACK_PARAMS");
    }

    console.log("Consuming consent for:", consentId);

    const response = await axios.post(
      `https://auth.dhan.co/partner/consume-consent?tokenId=${tokenId}`,
      {},
      {
        headers: {
          partner_id: ENV.DHAN_PARTNER_ID,
          partner_secret: ENV.DHAN_PARTNER_SECRET,
          "Content-Type": "application/json",
        },
      },
    );

    const { accessToken, dhanClientId } = response.data;

    if (!accessToken || !dhanClientId) {
      throw new Error("TOKEN_FETCH_FAILED");
    }

    const cachekey = `dhan_consent:${consentId}`;
    const userId = await redis.get(cachekey);
    await redis.del(cachekey);

    if (!userId) {
      throw new Error("CONSENT_EXPIRED");
    }

    let holdings: any[] = [];

    try {
      const holdingsRes = await axios.get("https://api.dhan.co/v2/holdings", {
        headers: {
          "access-token": accessToken,
        },
      });
      holdings = holdingsRes.data;
      console.log(`Fetched ${holdings.length} holdings from Dhan`);
    } catch (error: any) {
      if (
        error.response &&
        error.response.data &&
        (error.response.data.errorMessage === "No holdings available" ||
          error.response.data.errorCode === "DH-1111")
      ) {
        console.log("User has no holdings (Dhan returned empty error)");
        holdings = [];
      } else {
        throw error;
      }
    }

    // Map holdings to Stock format
    const mappedStocks: InputHolding[] = holdings.map((h: any) => ({
      isin: h.isin,
      average_buy_price: h.avgCostPrice,
      quantity: h.availableQty, // check if totalQty or quantity
      buy_value: h.avgCostPrice * h.availableQty,
    }));

    let portfolio: any;
    let isResync = false;

    console.log("Dhan Login User:", userId);

    await session.withTransaction(async () => {
      // Broker metadata
      const brokerAccount = await BrokerMetaData.findOne(
        { user_id: userId, broker: "DHAN" },
        null,
        { session },
      );

      if (!brokerAccount) {
        await BrokerMetaData.create(
          [
            {
              user_id: userId,
              broker: "DHAN",
              broker_client_id: dhanClientId,
            },
          ],
          { session },
        );
      } else if (brokerAccount.broker_client_id !== dhanClientId) {
        throw new Error("ACCOUNT_MISMATCH");
      }
      // Portfolio
      portfolio = await PortfolioModel.findOne(
        { user_id: userId, broker: "DHAN" },
        null,
        { session },
      );

      if (!portfolio) {
        portfolio = await PortfolioModel.create(
          [
            {
              user_id: userId,
              broker: "DHAN",
              current_value: 0,
              invested_amount: 0,
              total_returns: 0,
              today_net_change: 0,
              today_percent_change: 0,
            },
          ],
          { session },
        ).then((p) => p[0]);
      } else {
        isResync = true;
        await PortfolioViewEvent.create(
          [{ user_id: userId, event: "resync" }],
          { session },
        );
      }
    });

    await redis.set(`dhan_token:${userId}`, accessToken, "EX", 86400);

    const job = await portfolioProcessorQueue.add(
      isResync ? "process-portfolio-resync" : "process-dhan-stocks",
      {
        holdings: mappedStocks,
        portfolioId: portfolio._id,
        userId,
      },
      {
        jobId: `dhan-${portfolio._id}-${Date.now()}`,
        removeOnComplete: { age: 900, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      },
    );

    // Redirect to Frontend with Job ID
    res.redirect(
      `${ENV.FRONTEND_URL}/portfolio/holdings?status=success&jobId=${job.id}`,
    );
  } catch (err: any) {
    console.error("Dhan callback error:", err.message);

    if (err.message === "INVALID_CALLBACK_PARAMS") {
      return res.redirect(
        `${ENV.FRONTEND_URL}/portfolio/holdings?status=failure&error=invalid_callback_params`,
      );
    }

    if (err.message === "TOKEN_FETCH_FAILED") {
      return res.redirect(
        `${ENV.FRONTEND_URL}/portfolio/holdings?status=failure&error=token_fetch_failed`,
      );
    }

    if (err.message === "CONSENT_EXPIRED") {
      return res.redirect(
        `${ENV.FRONTEND_URL}/portfolio/holdings?status=failed&error=consent_expired`,
      );
    }

    if (err.message === "ACCOUNT_MISMATCH") {
      return res.redirect(
        `${ENV.FRONTEND_URL}/portfolio/holdings?status=failure&error=account_mismatch`,
      );
    }

    return res.redirect(
      `${ENV.FRONTEND_URL}/portfolio/holdings?status=failed&error=login_failed`,
    );
  } finally {
    await session.endSession();
  }
};

export const resync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const userPortfolio = await PortfolioModel.findOne({
      user_id: userId,
      broker: "DHAN",
    });

    if (!userPortfolio) {
      return res
        .status(404)
        .json({ success: false, error: "User Portfolio not found" });
    }

    // Get stored access token
    const accessToken = await redis.get(`dhan_token:${userId}`);
    if (!accessToken) {
      const response = await getConsentId(userId.toString());
      if (!response.success) {
        return res
          .status(500)
          .json({ success: false, error: "Consent id generation failed" });
      }

      const loginUrl = response.loginUrl;
      const consentId = response.consentId;

      return res.status(200).json({
        success: true,
        consentId: consentId,
        login_url: loginUrl,
        requiresReauth: true,
      });
    }

    // Fetch Holdings
    let holdings = [];
    try {
      const holdingsRes = await axios.get("https://api.dhan.co/v2/holdings", {
        headers: {
          "access-token": accessToken,
        },
      });
      holdings = holdingsRes.data;
      console.log(`Resync: Fetched ${holdings.length} holdings from Dhan`);
    } catch (error: any) {
      // Check if token expired (Dhan returns 401 for invalid/expired tokens)

      if (error.response?.status === 401) {
        await redis.del(`dhan_token:${userId}`);
        const response = await getConsentId(userId.toString());
        if (!response.success) {
          return res
            .status(500)
            .json({ success: false, error: "Consent id generation failed" });
        }

        const loginUrl = response.loginUrl;
        const consentId = response.consentId;

        return res.status(200).json({
          success: true,
          consentId: consentId,
          login_url: loginUrl,
          requiresReauth: true,
        });
      }

      // Check for no holdings error
      if (
        error.response?.data?.errorMessage === "No holdings available" ||
        error.response?.data?.errorCode === "DH-1111"
      ) {
        console.log(`Resync: UserId ${userId} has no holdings`);
        holdings = [];
      } else {
        throw error;
      }
    }

    const normalizedHoldings: InputHolding[] = holdings.map((h: any) => ({
      isin: h.isin,
      quantity: h.availableQty,
      average_buy_price: h.avgCostPrice,
      buy_value: h.avgCostPrice * h.availableQty,
    }));

    const job = await portfolioProcessorQueue.add(
      "process-portfolio-resync",
      {
        holdings: normalizedHoldings,
        portfolioId: userPortfolio._id,
        userId,
      },
      {
        jobId: `dhan-${userPortfolio._id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 900, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      },
    );
    // With this:
    console.log(`Resync Job Id: ${job.id}`);
    return res.status(200).json({
      success: true,
      jobId: job.id,
      holdingsCount: normalizedHoldings.length,
    });
  } catch (err: any) {
    console.error("Error in Dhan Resync:", err);
    return res.status(500).json({ success: false, error: "Resync Failed" });
  }
};
