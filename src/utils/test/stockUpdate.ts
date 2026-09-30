import { Request, Response } from "express";
import { GeneralData } from "../../models/stock/GeneralData.model";
import { fetchDhanData } from "../../services/dhan.service";
import { sleep } from "../sleep";
import { ENV } from "../../config/env";

function getOneYearRange() {
  const to = new Date();
  const from = new Date();
  from.setFullYear(to.getFullYear() - 1);

  const toDate = to.toISOString().slice(0, 10);
  const fromDate = from.toISOString().slice(0, 10);

  return { fromDate, toDate };
}

export const updateYearHighLow = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    if (!id || id != "911") {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorised access" });
    }

    const stocks = await GeneralData.find({
      $or: [{ year_low: 0 }, { year_high: 0 }],
    })
      .select("security_id exchange display_name underlying_symbol")
      .lean();

    console.log("Stocks to update:", stocks.length);
    const { fromDate, toDate } = getOneYearRange();
    const l = stocks[0];
    const bulkOps: any[] = [];
    let a = 1;
    for (const stock of stocks) {
      try {
        console.log(a);
        a += 1;
        const security_id = stock.security_id;
        await sleep(250);
        const data = await fetchDhanData(
          {
            securityId: Number(security_id),
            exchangeSegment: stock?.exchange + "_EQ" || "",
            instrument: "EQUITY",
            oi: false,
            fromDate,
            toDate,
          },
          ENV.BROKER_NAME,
          ENV.DHAN_CLIENT_ID_ONE,
          0,
        );
        if (!data || !data.high || !data.low || data.high.length === 0) {
          continue;
        }
        let year_high = data.high[0];
        let year_low = data.low[0];
        for (let i = 0; i < data.timestamp.length; i++) {
          year_high = Math.max(data.high[i], year_high);
          year_low = Math.min(data.low[i], year_low);
        }
        bulkOps.push({
          updateOne: {
            filter: { security_id: security_id },
            update: { $set: { year_high: year_high, year_low: year_low } },
          },
        });
      } catch (error: any) {
        console.error("Error while updating:", error.message);
      }
    }
    let q;
    if (bulkOps.length > 0) {
      q = await GeneralData.bulkWrite(bulkOps);
    }
    return res.json({
      total: stocks.length,
      q,
    });
  } catch (error: any) {
    console.error("Error while updating year high low:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};
