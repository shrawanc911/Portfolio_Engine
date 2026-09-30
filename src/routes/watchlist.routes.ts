import express from "express";
import { authenticate } from "../middlewares/auth.middleware";
import {
  addStockInWatchlist,
  createWatchlist,
  deleteWatchlist,
  getAllWatchlist,
  getWatchlistItems,
  removeStockFromWatchlist,
  renameWatchlist,
} from "../controllers/watchlist.controller";

const router = express.Router();

router.get("/get_all_watchlist", authenticate, getAllWatchlist);
router.get(
  "/get_watchlist_items/:watchlistId",
  authenticate,
  getWatchlistItems,
);

router.post("/create_watchlist", authenticate, createWatchlist);
router.post("/add_stock_in_watchlist", authenticate, addStockInWatchlist);

router.patch("/rename_watchlist", authenticate,renameWatchlist);

router.delete(
  "/remove_stock_from_watchlist",
  authenticate,
  removeStockFromWatchlist,
);
router.delete("/delete_watchlist/:watchlistId", authenticate, deleteWatchlist);

export default router;
