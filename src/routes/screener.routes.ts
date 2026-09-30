import express from "express";
import {
  baseScreener,
  get200DMAScreener,
  getAjitPatelAarthikScore,
  getFilteredETF,
  getFilteredStocks,
  getIPOData,
  getOversoldScreener,
  getSectors,
  getSouravJoshiAarthikScore,
  getSwingTradingScreener,
  getVolumeScreener,
  getVWAPScreener,
} from "../controllers/screener.controller";
import {
  compute200DMA,
  computeDMA199BaseSum,
} from "../services/dmaScreener.service";
import { computeBothAarthikScore } from "../services/intensityScore.service";
import { computeScreeners } from "../services/computeScreener.service";

const router = express.Router();

router.get("/base_screener", baseScreener);
router.get("/get_sectors", getSectors);

// router.get("/a/test", testRSIScreener);

router.post("/etf_screener", getFilteredETF);
router.post("/screener", getFilteredStocks);
router.get("/get_ipo/:status", getIPOData);
router.get("/get_vwap_screener", getVWAPScreener);
router.get("/get_oversold_screener", getOversoldScreener);
router.get("/get_swing_trading_screener", getSwingTradingScreener);
router.get("/get_volume_screener", getVolumeScreener);
router.get("/get_200_dma_screener", get200DMAScreener);
router.get("/get_aarthik_score/:id", async (req, res) => {
  const id = req.params.id;
  let data = null;
  if (id == "Ajit") {
    data = await getAjitPatelAarthikScore(req, res);
  } else if (id == "Sourav") {
    data = await getSouravJoshiAarthikScore(req, res);
  }
  return res.json(data);
});

router.get(
  "/compute_both_aarthik_score/:id",
  (req, res, next) => {
    const id = req.params.id;
    if (!id || id !== "911") {
      return res
        .status(400)
        .json({ success: false, error: "Id is not provided or incorrect" });
    }
    next();
  },
  async (req, res) => {
    await computeBothAarthikScore();
    res.send("Done");
  },
);

router.get(
  "/compute_200_dma_screener/:id",
  (req, res, next) => {
    const id = req.params.id;
    if (!id || id !== "911") {
      return res
        .status(400)
        .json({ success: false, error: "Id is not provided or incorrect" });
    }
    next();
  },
  async (req, res) => {
    await computeDMA199BaseSum();
    await compute200DMA();
    res.send("Done");
  },
);

router.get(
  "/compute_vwap_screener/:id",
  (req, res, next) => {
    const id = req.params.id;
    if (!id || id !== "911") {
      return res
        .status(400)
        .json({ success: false, error: "Id is not provided or incorrect" });
    }
    next();
  },
  async (req, res) => {
    await computeScreeners();
    res.send("Done");
  },
);


export default router;
