import axios from "axios";
import { ENV } from "../config/env";
import stocks from "../data/stocks_isin.json";

/* -----------------------------
   Axios instance
----------------------------- */
const indianApi = axios.create({
  baseURL: ENV.INDIAN_API_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": ENV.INDIAN_API_KEY, // if required
  },
});

export const fetchGeneralDataByISIN = async (isin: string) => {
  try {
    if (!isin) {
      throw new Error("ISIN is required");
    }
    // 🔎 Lookup local stock mapping (symbol, exchange etc.)
    const stockMeta = (stocks as Record<string, any>)[isin];

    if (!stockMeta) {
      throw new Error(`ISIN ${isin} not found in local stock list`);
    }

    // 🌐 Call Indian API
    // 🌐 Call Indian API
    const response = await indianApi.get("/stock", {
      params: {
        symbol: stockMeta.UNDERLYING_SYMBOL,
      },
    });

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }

    const data = response.data;

    const reusable = data.stockDetailsReusableData ?? {};
    const profile = data.companyProfile ?? {};
    const peerList = Array.isArray(profile.peerCompanyList)
      ? profile.peerCompanyList
      : [];
    const response_company_name =
      response.data.companyName ?? stockMeta.DISPLAY_NAME;
    const latestPrice = reusable.price ?? 0;
    const latestClose = reusable.close ?? 0;

    /* -------------------------
     SAFE PEER LOOKUP
  ------------------------- */
    let inPeerStock: any = null;

    if (peerList.length > 0) {
      inPeerStock = peerList.find((company: any) => {
        if (!company?.companyName) return false;

        const cName = company.companyName.toLowerCase();
        const rName = response_company_name.toLowerCase();

        return (
          cName.includes(rName) ||
          rName.includes(cName) ||
          (company.marketCap === data.market_cap &&
            company.price === latestPrice)
        );
      });
    }
    const image_url = inPeerStock?.imageUrl ?? null;
    const ticker_id = inPeerStock?.tickerId ?? reusable.tickerId ?? "";

    /* -------------------------
     SAFE PEER ISIN MATCHING
  ------------------------- */
    const peerISINs: any[] = [];
    const stocksData = stocks as Record<string, any>;

    for (const peer of peerList) {
      if (!peer?.companyName) continue;

      const peerName = peer.companyName.toLowerCase().trim();
      let matched = false;

      for (const [peerIsin, meta] of Object.entries(stocksData)) {
        const displayName = meta.DISPLAY_NAME?.toLowerCase()?.trim();
        if (!displayName) continue;

        if (
          displayName === peerName ||
          displayName.includes(peerName) ||
          peerName.includes(displayName)
        ) {
          peerISINs.push({
            isin: peerIsin,
            image_url: peer.imageUrl ?? null,
            ticker_id: peer.tickerId ?? "",
            display_name: peer.companyName,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        peerISINs.push({
          image_url: peer.imageUrl ?? null,
          ticker_id: peer.tickerId ?? "",
          display_name: peer.companyName,
        });
      }
    }

    const today_high = response.data.stockDetailsReusableData?.high || 0;
    const today_low = response.data.stockDetailsReusableData?.low || 0;
    const year_high = response.data.stockDetailsReusableData?.yhigh || 0;
    const year_low = response.data.stockDetailsReusableData?.ylow || 0;
    const today_percent_change =
      response.data.stockDetailsReusableData?.percentChange || 0;
    const industry = response.data.industry || null;
    const description =
      response.data.companyProfile?.companyDescription || null;

    // const inPeerStock = response.data.companyProfile.peerCompanyList.find(
    //   (company: any) =>
    //     company.companyName
    //       .toLowerCase()
    //       .includes(response_company_name.toLowerCase()) ||
    //     response_company_name
    //       .toLowerCase()
    //       .includes(company.companyName.toLowerCase()) ||
    //     (company.marketCap == market_cap &&
    //       company.price == latest_price &&
    //       company.ylow == year_low &&
    //       company.yhigh == year_high)
    // );

    const today_net_change = latestPrice - latestClose;

    // Extract peer ISINs from peerCompanyList
    // const peerISINs: any[] = [];
    // // const peerList = response.data.companyProfile?.peerCompanyList || [];
    // const stocksData = stocks as Record<string, any>;
    // for (const peer of peerList) {
    //   // Skip self
    //   if (
    //     peer.companyName
    //       ?.toLowerCase()
    //       .includes(response_company_name.toLowerCase()) ||
    //     response_company_name
    //       .toLowerCase()
    //       .includes(peer.companyName?.toLowerCase() || "")
    //   ) {
    //     continue;
    //   }
    //   let x = false;
    //   // Find ISIN by matching company name
    //   for (const [peerIsin, meta] of Object.entries(stocksData)) {
    //     const displayName = meta.DISPLAY_NAME?.toLowerCase().trim() || "";
    //     const peerName = peer.companyName?.toLowerCase().trim() || "";

    //     if (
    //       displayName === peerName ||
    //       displayName.includes(peerName) ||
    //       peerName.includes(displayName)
    //     ) {
    //       if (!peerISINs.includes(peerIsin)) {
    //         peerISINs.push({
    //           isin: peerIsin,
    //           image_url: peer.imageUrl,
    //           ticker_id: peer.tickerId,
    //           display_name: peer.companyName,
    //         });
    //         x = true;
    //       }
    //       break;
    //     }
    //   }
    //   if (!x) {
    //     peerISINs.push({
    //       image_url: peer.imageUrl,
    //       ticker_id: peer.tickerId,
    //       display_name: peer.companyName,
    //     });
    //   }
    // }

    const general = {
      isin,
      security_id: stockMeta.SECURITY_ID,
      ticker_id: ticker_id,
      instrument_type:
        stockMeta.INSTRUMENT_TYPE == "ETF"
          ? "ETF"
          : stockMeta.INSTRUMENT_TYPE == "MF"
            ? "MF"
            : "EQUITY",

      image_url,
      underlying_symbol: stockMeta.UNDERLYING_SYMBOL,
      symbol_name: stockMeta.SYMBOL_NAME,
      display_name: stockMeta.DISPLAY_NAME,
      exchange: stockMeta.EXCH_ID,

      industry,
      sector: "",
      description,

      latestClose,
      current_price: latestPrice,
      today_percent_change,
      today_net_change,

      year_high,
      year_low,
      today_high,
      today_low,

      peers: peerISINs,

      lastFetchedAt: new Date(),
    };

    return general;
  } catch (err: any) {
    console.error("Error while fetching general data by isin:", err);
    throw err; // 🚨 IMPORTANT
  }
};

export const fetchTechnicalDataByISIN = async (isin: string) => {
  try {
    if (!isin) {
      throw new Error("ISIN is required");
    }
    // 🔎 Lookup local stock mapping (symbol, exchange etc.)
    const stockMeta = (stocks as Record<string, any>)[isin];

    if (!stockMeta) {
      throw new Error(`ISIN ${isin} not found in local stock list`);
    }
    console.log(
      "[fetchTechnicalDataByISIN] Fetching Using UNDERLYING_SYMBOL:",
      stockMeta.UNDERLYING_SYMBOL,
    );
    // 🌐 Call Indian API
    // 🌐 Call Indian API
    let response = await indianApi.get("/get_stock_data", {
      params: {
        stock_name: stockMeta.UNDERLYING_SYMBOL,
      },
    });

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }

    if (response.data.error) {
      console.log(
        "[fetchTechnicalDataByISIN] Fetching Using DISPLAY_NAME:",
        stockMeta.DISPLAY_NAME,
      );
      response = await indianApi.get("/get_stock_data", {
        params: {
          stock_name: stockMeta.DISPLAY_NAME,
        },
      });

      if (!response.data) {
        throw new Error("Empty response from Indian API");
      }

      if (response.data.error) {
        console.log(
          "[fetchTechnicalDataByISIN] Fetching Using SYMBOL_NAME:",
          stockMeta.SYMBOL_NAME,
        );

        response = await indianApi.get("/get_stock_data", {
          params: {
            stock_name: stockMeta.SYMBOL_NAME,
          },
        });
      }

      if (!response.data || response.data.error) {
        throw new Error("Empty response from Indian API");
      }
    }

    const data = response.data;
    const stats = data.stats || {};

    const technical = {
      isin,

      nse_scrip_code: data.nse_scrip_code || null,
      bse_scrip_code: data.bse_scrip_code || null,

      name: data.name,
      industry: data.industry || null,

      // Valuation
      marketCap: stats.marketCap ?? null,
      peRatio: stats.peRatio ?? null,
      pbRatio: stats.pbRatio ?? null,
      pegRatio: stats.pegRatio ?? null,
      industryPe: stats.industryPe ?? null,

      epsTtm: stats.epsTtm ?? null,
      bookValue: stats.bookValue ?? null,

      dividendYield: stats.divYield ?? null,
      dividendYieldInPercent: stats.dividendYieldInPercent ?? null,
      earningsYield: stats.earningsYield ?? null,

      // Profitability
      roe: stats.roe ?? null,
      roa: stats.returnOnAssets ?? null,
      roce: stats.sectorRoce ?? null,
      roic: stats.roic ?? null,

      operatingProfitMargin: stats.operatingProfitMargin ?? null,
      netProfitMargin: stats.netProfitMargin ?? null,

      // Multiples
      evToSales: stats.evToSales ?? null,
      evToEbitda: stats.evToEbitda ?? null,

      priceToSales: stats.priceToSales ?? null,
      priceToOcf: stats.priceToOcf ?? null,
      priceToFcf: stats.priceToFcf ?? null,

      // Classification
      faceValue: stats.faceValue ?? null,
      cappedType: stats.cappedType ?? null,

      // Sector comparison
      sectorPe: stats.sectorPe ?? null,
      sectorPb: stats.sectorPb ?? null,
      sectorRoe: stats.sectorRoe ?? null,
      sectorRoce: stats.sectorRoce ?? null,
      sectorDivYield: stats.sectorDivYield ?? null,

      pePremiumVsSector: stats.pePremiumVsSector ?? null,
      pbPremiumVsSector: stats.pbPremiumVsSector ?? null,
      divYieldVsSector: stats.divYieldVsSector ?? null,

      debtToEquity: stats.debtToEquity ?? null,
      debtToAsset: stats.debtToAsset ?? null,
      quickRatio: stats.quickRatio ?? null,
      cashRatio: stats.cashRatio ?? null,
      currentRatio: stats.currentRatio ?? null,

      // Metadata
      lastFetchedAt: new Date(),
      validTill: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      status: "fresh" as const,
    };

    const general = {
      market_cap: technical.marketCap || null,
      capped_type: technical.cappedType || null,
      year_high: data.price_data.nse.yearHighPrice ?? 0,
      year_low: data.price_data.nse.yearLowPrice ?? 0,
    };

    return { technical, general };
  } catch (err: any) {
    console.error(`[fetchTechnicalDataByISIN] Error for ${isin}:`, err.message);
    return null;
  }
};

export const fetchFinancialDataByISIN = async (isin: string) => {
  try {
    if (!isin) {
      throw new Error("ISIN is required");
    }
    // 🔎 Lookup local stock mapping (symbol, exchange etc.)
    const stockMeta = (stocks as Record<string, any>)[isin];

    if (!stockMeta) {
      throw new Error(`ISIN ${isin} not found in local stock list`);
    }

    console.log(
      "[fetchFinancialDataByISIN] Fetching Using UNDERLYING_SYMBOL:",
      stockMeta.UNDERLYING_SYMBOL,
    );
    // 🌐 Call Indian API
    // 🌐 Call Indian API
    let response = await indianApi.get("/historical_stats", {
      params: {
        stock_name: stockMeta.UNDERLYING_SYMBOL,
        stats: "all",
      },
    });

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }
    if (response.data.error) {
      console.log(
        "[fetchFinancialDataByISIN] Fetching Using DISPLAY_NAME:",
        stockMeta.DISPLAY_NAME,
      );
      response = await indianApi.get("/historical_stats", {
        params: {
          stock_name: stockMeta.DISPLAY_NAME,
          stats: "all",
        },
      });

      if (!response.data) {
        throw new Error("Empty response from Indian API");
      }

      if (response.data.error) {
        console.log(
          "[fetchFinancialDataByISIN] Fetching Using SYMBOL_NAME:",
          stockMeta.SYMBOL_NAME,
        );

        response = await indianApi.get("/historical_stats", {
          params: {
            stock_name: stockMeta.SYMBOL_NAME,
            stats: "all",
          },
        });
      }

      if (!response.data || response.data.error) {
        throw new Error("Empty response from Indian API");
      }
    }

    const data = response.data;
    const financial = {
      isin,

      quarter_results: data.quarter_results ?? {},
      yoy_results: data.yoy_results ?? {},

      balancesheet: data.balancesheet ?? {},
      cashflow: data.cashflow ?? {},
      ratios: data.ratios ?? {},

      shareholding_pattern_quarterly: data.shareholding_pattern_quarterly ?? {},
      shareholding_pattern_yearly: data.shareholding_pattern_yearly ?? {},

      profit_loss_stats: data.profit_loss_stats ?? {},

      lastFetchedAt: new Date(),
    };

    return financial;
  } catch (err: any) {
    if (err.code === "ECONNABORTED") {
      console.error("Request timed out after 5s");
    }
    console.error(`[fetchFinancialDataByISIN] Error for ${isin}:`, err.message);
    throw err;
  }
};

export const fetchDocumentDataByISIN = async (isin: string) => {
  try {
    if (!isin) {
      throw new Error("ISIN is required");
    }
    // 🔎 Lookup local stock mapping (symbol, exchange etc.)
    const stockMeta = (stocks as Record<string, any>)[isin];

    if (!stockMeta) {
      throw new Error(`ISIN ${isin} not found in local stock list`);
    }

    console.log(
      "[fetchDocumentDataByISIN] Fetching Using UNDERLYING_SYMBOL:",
      stockMeta.UNDERLYING_SYMBOL,
    );
    // 🌐 Call Indian API
    // 🌐 Call Indian API
    let response = await indianApi.get("/documents", {
      params: {
        stock_name: stockMeta.UNDERLYING_SYMBOL,
      },
    });

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }

    if (response.data.error) {
      console.log(
        "[fetchDocumentDataByISIN] Fetching Using DISPLAY_NAME:",
        stockMeta.DISPLAY_NAME,
      );
      response = await indianApi.get("/documents", {
        params: {
          stock_name: stockMeta.DISPLAY_NAME,
        },
      });

      if (!response.data) {
        throw new Error("Empty response from Indian API");
      }

      if (response.data.error) {
        console.log(
          "[fetchDocumentDataByISIN] Fetching Using SYMBOL_NAME:",
          stockMeta.SYMBOL_NAME,
        );

        response = await indianApi.get("/documents", {
          params: {
            stock_name: stockMeta.SYMBOL_NAME,
          },
        });
      }

      if (!response.data || response.data.error) {
        throw new Error("Empty response from Indian API");
      }
    }

    const data = response.data;

    const documentData = {
      isin,

      recent_announcements: data.Recent_Announcements ?? [],
      annual_reports: data.Annual_Reports ?? [],
      credit_ratings: data.Credit_Ratings ?? [],
      concalls: data.Concalls ?? [],

      lastFetchedAt: new Date(),
    };

    return documentData;
  } catch (err: any) {
    console.error(`[fetchDocumentDataByISIN] Error for ${isin}:`, err.message);
    return null;
  }
};

export const fetchCorporateActionsDataByISIN = async (isin: string) => {
  try {
    if (!isin) {
      throw new Error("ISIN is required");
    }
    // 🔎 Lookup local stock mapping (symbol, exchange etc.)
    const stockMeta = (stocks as Record<string, any>)[isin];

    if (!stockMeta) {
      throw new Error(`ISIN ${isin} not found in local stock list`);
    }

    console.log(
      "[fetchCorporateActionsByISIN] Fetching Using UNDERLYING_SYMBOL:",
      stockMeta.UNDERLYING_SYMBOL,
    );
    // 🌐 Call Indian API
    // 🌐 Call Indian API
    let response = await indianApi.get("/corporate_actions", {
      params: {
        stock_name: stockMeta.UNDERLYING_SYMBOL,
      },
    });

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }

    if (response.data.error) {
      console.log(
        "[fetchCorporateActionsByISIN] Fetching Using DISPLAY_NAME:",
        stockMeta.DISPLAY_NAME,
      );
      response = await indianApi.get("/corporate_actions", {
        params: {
          stock_name: stockMeta.DISPLAY_NAME,
        },
      });

      if (!response.data) {
        throw new Error("Empty response from Indian API");
      }

      if (response.data.error) {
        console.log(
          "[fetchCorporateActionsByISIN] Fetching Using SYMBOL_NAME:",
          stockMeta.SYMBOL_NAME,
        );

        response = await indianApi.get("/corporate_actions", {
          params: {
            stock_name: stockMeta.SYMBOL_NAME,
          },
        });
      }

      if (!response.data || response.data.error) {
        throw new Error("Empty response from Indian API");
      }
    }

    const raw = response.data;

    /* -------------------------
       NORMALIZERS
    ------------------------- */
    const normalizeBoardMeetings = (rows: string[][] = []) =>
      rows.map(([meetingDate, agenda]) => ({
        meetingDate,
        agenda,
      }));

    const normalizeDividends = (rows: string[][] = []) =>
      rows.map(([recordDate, exDate, dividendPercent, details]) => ({
        recordDate,
        exDate,
        dividendPercent,
        details: details ?? "",
      }));

    const normalizeSplits = (rows: string[][] = []) =>
      rows.map(([recordDate, exDate, ratio]) => ({
        recordDate,
        exDate,
        ratio,
      }));

    const normalizeRights = (rows: string[][] = []) =>
      rows.map(([recordDate, exDate, ratio, premium]) => ({
        recordDate,
        exDate,
        ratio,
        premium: premium ?? "",
      }));

    /* -------------------------
       FINAL OBJECT
    ------------------------- */

    const corporateActions = {
      isin,

      board_meetings: {
        title: raw.board_meetings?.title ?? "Board Meeting",
        data: normalizeBoardMeetings(raw.board_meetings?.data),
      },

      dividends: {
        title: raw.dividends?.title ?? "Dividend",
        data: normalizeDividends(raw.dividends?.data),
      },

      splits: {
        title: raw.splits?.title ?? "Split",
        data: normalizeSplits(raw.splits?.data),
      },

      bonus: {
        title: raw.bonus?.title ?? "Bonus",
        msg: raw.bonus?.msg ?? "",
      },

      rights: {
        title: raw.rights?.title ?? "Rights",
        data: normalizeRights(raw.rights?.data),
      },

      lastFetchedAt: new Date(),
    };

    return corporateActions;
  } catch (err: any) {
    console.error(
      `[fetchCorporateActionsByISIN] Error for ${isin}:`,
      err.message,
    );
    return null;
  }
};

export const fetchIPOData = async () => {
  try {
    // 🌐 Call Indian API
    let response = await indianApi.get("/ipo");

    if (!response.data) {
      throw new Error("Empty response from Indian API");
    }

    const raw = response.data;

    return raw;
  } catch (err: any) {
    console.error(`[fetchIPOData] Error:`, err.message);
    return null;
  }
};
