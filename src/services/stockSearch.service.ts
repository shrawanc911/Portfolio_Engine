// src/services/stockSearch.service.ts
import { GeneralData } from "../models/stock/GeneralData.model";
import { redis } from "../config/redis";

export const searchStockService = async (q: string) => {
  const key = `search:${q}`;

  // 1️⃣ cache
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  let results = [];

  // 2️⃣ prefix search (instant)
  if (q.length < 3) {
    results = await GeneralData.find({
      display_name: new RegExp("^" + q, "i"),
    })
      .limit(10)
      .select(
        "isin display_name security_id exchange symbol_name underlying_symbol",
      );
  } else {
    // 3️⃣ text search first
    results = await GeneralData.find(
      { $text: { $search: q } },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10)
      .select(
        "isin display_name security_id exchange symbol_name underlying_symbol",
      );

    // 4️⃣ regex fallback for partial matches (e.g. "Info" → "Infosys")
    if (results.length === 0) {
      const pattern = new RegExp(q, "i");
      results = await GeneralData.find({
        $or: [
          { display_name: pattern },
          { symbol_name: pattern },
          { underlying_symbol: pattern },
        ],
      })
        .limit(10)
        .select(
          "isin display_name security_id exchange symbol_name underlying_symbol",
        );
    }
  }

  // 4️⃣ rank
  const ranked = results.sort((a: any, b: any) => {
    if (a.symbol === q.toUpperCase()) return -1;
    if (b.symbol === q.toUpperCase()) return 1;
    return 0;
  });

  // 5️⃣ cache for 30s
  await redis.setex(key, 30, JSON.stringify(ranked));

  return ranked;
};
