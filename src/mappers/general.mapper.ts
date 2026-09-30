export function mapGeneralData(isin: string, raw: any) {
  return {
    isin,
    security_id: raw.security_id,
    ticker_id: raw.ticker_id,
    instrument_type: raw.instrument_type,

    image_url: raw.image_url,
    underlying_symbol: raw.underlying_symbol,
    symbol_name: raw.symbol_name,
    display_name: raw.display_name,
    exchange: raw.exchange,

    industry: raw.industry,
    sector: raw.sector,
    description: raw.description,

    previous_day_close: raw.latest_close,
    current_price: raw.current_price,
    today_percent_change: raw.today_percent_change,
    today_net_change: raw.today_net_change,

    year_high: raw.year_high,
    year_low: raw.year_low,
    today_high: raw.today_high,
    today_low: raw.today_low,

    peers: raw.peers,
  };
}
