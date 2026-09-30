import { Request, Response } from "express";
import { AuthenticatedRequest } from "../interface/file.interface";
import { Watchlist } from "../models/Watchlist.model";
import mongoose from "mongoose";
import { WatchlistItem } from "../models/WatchlistItem.model";
import { watchlistCache } from "../services/watchlistCache.service";

/* ================================
   CREATE WATCHLIST
================================ */
export const createWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res
      .status(401)
      .json({ success: false, error: "Unauthorized access" });
  }
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ success: false, error: "Invalid name" });
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Watchlist name must be 2–50 characters long",
      });
    }

    const newWatchlist = await Watchlist.create({
      user_id: userId,
      name: trimmedName,
    });

    // 🔥 Add watchlist in cache
    await watchlistCache.addWatchlistInCache(
      newWatchlist._id.toString(),
      trimmedName,
      userId,
    );

    return res.status(201).json({
      success: true,
      message: "Watchlist created successfully",
      data: newWatchlist,
    });
  } catch (error: any) {
    console.error("Create watchlist error:", error.message);

    // Duplicate watchlist name
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Watchlist with this name already exists",
      });
    }

    // Validation error
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Default server error
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/* ================================
   ADD STOCK
================================ */
export const addStockInWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized access",
    });
  }

  try {
    const { watchlistId, isin, exchange } = req.body;

    if (
      !isin ||
      !watchlistId ||
      typeof isin !== "string" ||
      typeof watchlistId !== "string" ||
      !["NSE", "BSE"].includes(exchange) ||
      !mongoose.Types.ObjectId.isValid(watchlistId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid input",
      });
    }

    // ✅ ONE DB CALL
    const item = await WatchlistItem.create({
      user_id: userId,
      watchlist_id: watchlistId,
      isin,
      exchange,
    });

    // 🔥 update only what changed
    await watchlistCache.addStockInWatchlistItems(
      watchlistId as unknown as mongoose.Types.ObjectId,
      isin,
    );

    return res.status(200).json({
      success: true,
      message: "Stock added to watchlist",
      data: item,
    });
  } catch (error: any) {
    console.error("Error while adding stock in watchlist:", error.message);

    // Duplicate watchlist name
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Stock already exists",
      });
    }

    // Validation error
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/* ================================
   REMOVE STOCK
================================ */
export const removeStockFromWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized access",
    });
  }

  try {
    const { watchlistId, isin } = req.body;
    if (
      !watchlistId ||
      !isin ||
      typeof watchlistId !== "string" ||
      typeof isin !== "string" ||
      !mongoose.Types.ObjectId.isValid(watchlistId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid input",
      });
    }

    const result = await WatchlistItem.deleteOne({
      watchlist_id: watchlistId,
      user_id: userId,
      isin: isin,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Stock not found in watchlist",
      });
    }

    // 🔥 Remove stock from cache
    await watchlistCache.removeStockFromWatchlistItems(
      watchlistId as unknown as mongoose.Types.ObjectId,
      isin,
    );

    return res.status(200).json({
      success: true,
      message: "Stock removed from watchlist",
    });
  } catch (error: any) {
    console.error("Error while removing stock in watchlist:", error.message);
    return res.status(500).json({
      success: false,
      error: `Internal server error :${error.message}`,
    });
  }
};

/* ================================
   GET WATCHLISTS
================================ */
export const getAllWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized access",
    });
  }

  try {
    const data = await watchlistCache.getWatchlists(userId);
    return res.status(200).json({
      success: true,
      message: "Watchlist fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error("Error while getting watchlist:", error.message);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/* ================================
   GET WATCHLIST ITEMS
================================ */
export const getWatchlistItems = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized access",
    });
  }

  try {
    const { watchlistId } = req.params;
    if (watchlistId && !mongoose.Types.ObjectId.isValid(watchlistId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid watchlistId",
      });
    }

    const data = await watchlistCache.getWatchlistItems(
      userId,
      watchlistId as unknown as mongoose.Types.ObjectId,
    );

    return res.status(200).json({
      success: true,
      message: "Watchlist items fetched successfully",
      data: data,
    });
  } catch (error: any) {
    console.error("Error while getting watchlist items:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/* ================================
   DELETE WATCHLIST
================================ */
export const deleteWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { watchlistId } = req.params;

  if (
    !watchlistId ||
    (watchlistId && !mongoose.Types.ObjectId.isValid(watchlistId))
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid watchlistId",
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const result = await Watchlist.deleteOne(
      { _id: watchlistId, user_id: userId },
      { session },
    );

    if (result.deletedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        error: "Watchlist not found",
      });
    }

    await WatchlistItem.deleteMany({ watchlist_id: watchlistId }, { session });

    await session.commitTransaction();
    session.endSession();

    // 🔥 invalidate cache AFTER DB commit
    await Promise.all([
      watchlistCache.removeWatchlistFromCache(
        watchlistId as unknown as mongoose.Types.ObjectId,
        userId,
      ),
      watchlistCache.invalidateWatchlistItems(
        watchlistId as unknown as mongoose.Types.ObjectId,
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: "Watchlist deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Delete watchlist error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/* ================================
   RENAME WATCHLIST
================================ */
export const renameWatchlist = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const { watchlistId, newName } = req.body;
  try {
    if (!watchlistId || !newName || typeof newName !== "string") {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }

    if (!mongoose.Types.ObjectId.isValid(watchlistId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid watchlist id" });
    }

    const trimmedName = newName.trim();

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Watchlist name must be 2–50 characters long",
      });
    }

    // ownership check + update
    const updatedWatchlist = await Watchlist.findOneAndUpdate(
      { _id: watchlistId, user_id: userId }, // IMPORTANT
      { $set: { name: trimmedName } },
      { new: true, runValidators: true },
    );

    if (!updatedWatchlist) {
      return res.status(404).json({
        success: false,
        error: "Watchlist not found",
      });
    }

    await watchlistCache.renameWatchlistFromCache(
      watchlistId as unknown as mongoose.Types.ObjectId,
      newName,
      userId,
    );

    return res.status(200).json({
      success: true,
      message: "Watchlist renamed successfully",
      data: updatedWatchlist,
    });
  } catch (error: any) {
    console.error(`Error while rename watchlist:`, error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};
