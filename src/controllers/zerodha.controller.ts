import { Request, Response } from "express";
import { KiteConnect } from "kiteconnect";
import portfolioModel from "../models/Portfolio.model";
import { portfolioProcessorQueue } from "../queues";
import { InputHolding } from "../interface/file.interface";
import { redis } from "../config/redis";
import { kc } from "../config/kiteConnect";
import { ENV } from "../config/env";
import { AuthenticatedRequest } from "../interface/file.interface";

const KITE_API_SECRET = ENV.KITE_API_SECRET;

export const getLoginUrl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized user" });
    }
    // const cacheKey = `login_zerodha`;
    // await redis.set(cacheKey, userId);
    const loginUrl = kc.getLoginURL();
    console.log("Login URL generated:", loginUrl);
    res.status(200).json({ login_url: loginUrl });
  } catch (error) {
    console.error("Error generating login URL:", error);
    res.status(500).json({ error: "Failed to generate login URL" });
  }
};

export const callback = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { request_token, status } = req.query;

    const userId = req.user?.userId;
    if (!userId) {
      console.log("User id not found");
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized user" });
    }

    const existingPortfolio = await portfolioModel.findOne({
      user_id: userId,
      broker: "ZERODHA",
    });

    if (existingPortfolio) {
      console.log("Existing Portfolio");
      const session = await kc.generateSession(
        request_token as string,
        KITE_API_SECRET,
      );
      console.log("Session generated successfully:", session.access_token);
      return res.status(200).json({
        success: true,
        message: "Portfolio already exists",
        portfolio: existingPortfolio,
      });
    }

    if (status !== "success") {
      console.log("Status is unsuccessfull");
      return res.status(400).json({ error: "Login failed or denied by user" });
    }

    if (!request_token) {
      console.log("Request token not found");
      return res.status(400).json({ error: "Missing request_token" });
    }

    console.log("Generating session with request_token:", request_token);
    const session = await kc.generateSession(
      request_token as string,
      KITE_API_SECRET,
    );
    console.log("Session generated successfully");

    const accessToken = session.access_token;
    kc.setAccessToken(accessToken);
    console.log("Access Token:", accessToken);
    // Store access_token in Redis with api_key as key
    await redis.set(`zerodha:${userId}:accessToken`, accessToken);
    console.log("Access token stored in Redis");

    // Get user profile
    const profile = await kc.getProfile();

    // Get Holdings
    const holdings = await kc.getHoldings();
    console.log(`Fetched ${holdings.length} holdings from Zerodha`);

    // Map holdings to Stock format expected by worker
    // Using ISIN as the unique identifier. Zerodha returns 'isin'.
    const mappedStocks: InputHolding[] = holdings.map((h: any) => ({
      isin: h.isin as string,
      average_buy_price: h.average_price as number,
      quantity: h.quantity as number,
      buy_value: (h.average_price * h.quantity) as number,
    }));

    // Create or update portfolio
    // Note: session.user_id is the zerodha user id (e.g., KS6798)
    // We might need an actual user_id from our auth system.
    // However, the callback comes from the browser redirect.
    // If the valid user session cookie is present, we might have req.user from logic in app.ts middleware (if applied).
    // Let's assume we can get user_id from the session or creating a new one based on this flow.
    // The previous implementation of `addUsingCSV` uses `req.user?.userId`.
    // Since this is a callback hitting our backend directly from browser redirection (or via frontend),
    // if it's via frontend (frontend captures parameter and calls this API), it will have the auth token.
    // The prompt says: "make a service and a function for callback request token which I will get from the url... then call the generateSession"
    // "in a route /api/zerodha/get_login/callback route for this in frontend this route is called"
    // So the frontend will call this route. Thus `req.user` should be populated if authenticated.

    // We need to extend Request to include user, similar to controller.file.ts

    // Checking if portfolio exists for this user, if not create one.
    // We can use the logic similar to addManualStocks but specific for Zerodha
    let portfolio = await portfolioModel.findOne({
      user_id: userId,
      broker: "ZERODHA",
    });
    if (!portfolio) {
      // Check generic portfolio or just create new one?
      // Let's create a new one for ZERODHA or update existing if we allow multiple?
      // For simplicity, checking generic or creating new.
      // Actually `addManualStocks` checks `portfolioModel.findOne({ user_id: user_id })`.
      // If one exists, it errors "Portfolio already created".
      // We probably want to update the existing one if it exists, or create if not.
      portfolio = await portfolioModel.findOne({ user_id: userId });
      if (!portfolio) {
        portfolio = new portfolioModel({
          user_id: userId,
          broker: "ZERODHA",
          current_value: 0,
          invested_amount: 0,
          total_returns: 0,
          today_net_change: 0,
          today_percent_change: 0,
        });
        await portfolio.save();
      } else {
        // If portfolio exists, we update it.
        // Maybe update broker name? or keep as is.
        // portfolio.broker = "ZERODHA"; // Optional
        // await portfolio.save();
      }
    }

    // Add job to queue
    const job = await portfolioProcessorQueue.add(
      "process-manual-stocks",
      {
        holdings: mappedStocks,
        portfolioId: portfolio._id,
        userId: userId,
      },
      {
        jobId: `zerodha-${portfolio._id}-${Date.now()}`,
        removeOnComplete: {
          age: 900,
          count: 100,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    );

    console.log(`Job added to queue: ${job.id}`);
    res.status(200).json({
      success: true,
      message: "Login successful, processing holdings...",
      //   session: session,
      //   profile: profile,
      jobId: job.id,
      portfolioId: portfolio._id,
    });
  } catch (error) {
    console.error("Error in callback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
