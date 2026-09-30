import express from "express";
import { calculateMMIIndex } from "../services/tools.service";
import { getMMIIndex } from "../controllers/tools.controller";

const router = express.Router();

router.get("/calculate_mmi_index/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id !== "911") {
      return res.status(200).json({ success: true, message: "Imposter" });
    }
    await calculateMMIIndex();
    return res.json({
      success: true,
      message: "MMI Index calculated",
    });
  } catch (err: any) {
    console.error("MMI Error:", err?.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to calculate Market Mood Index",
    });
  }
});

router.get("/get_mmi_index", getMMIIndex);

export default router;
