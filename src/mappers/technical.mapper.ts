
export function mapTechnicalData(isin: string, raw: any) {
  return {
    isin,
    name: raw.name,
    industry: raw.industry,

    nse_scrip_code: raw.nse_scrip_code || null,
    bse_scrip_code: raw.bse_scrip_code || null,

    marketCap: raw.marketCap ?? null,
    peRatio: raw.peRatio ?? null,
    pbRatio: raw.pbRatio ?? null,
    pegRatio: raw.pegRatio ?? null,

    epsTtm: raw.epsTtm ?? null,
    bookValue: raw.bookValue ?? null,

    dividendYield: raw.divYield ?? null,
    earningsYield: raw.earningsYield ?? null,

    roe: raw.roe ?? null,
    roa: raw.returnOnAssets ?? null,
    roce: raw.sectorRoce ?? null,
    roic: raw.roic ?? null,

    operatingProfitMargin: raw.operatingProfitMargin ?? null,
    netProfitMargin: raw.netProfitMargin ?? null,

    evToSales: raw.evToSales ?? null,
    evToEbitda: raw.evToEbitda ?? null,

    priceToSales: raw.priceToSales ?? null,
    priceToOcf: raw.priceToOcf ?? null,
    priceToFcf: raw.priceToFcf ?? null,

    cappedType: raw.cappedType || "Unknown",
    faceValue: raw.faceValue ?? null,

    sectorPe: raw.sectorPe ?? null,
    sectorPb: raw.sectorPb ?? null,
    sectorRoe: raw.sectorRoe ?? null,
    sectorRoce: raw.sectorRoce ?? null,
    sectorDivYield: raw.sectorDivYield ?? null,

    pePremiumVsSector: raw.pePremiumVsSector ?? null,
    pbPremiumVsSector: raw.pbPremiumVsSector ?? null,
    divYieldVsSector: raw.divYieldVsSector ?? null,
  };
}
