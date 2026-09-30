

export interface WatchlistDTO {
  id: string;
  name: string;
}

export interface WatchlistItemDTO {
  isin: string;
  exchange: "NSE" | "BSE";
  display_name: string;
  underlying_symbol: string;
  image_url: string;
  current_price: number;
  today_percent_change: number;
  market_cap: number;
}

export interface WatchlistListCache {
  items: WatchlistDTO[];
  version: number;
}

export interface WatchlistIsinCache {
  isins: string[];
  version: number;
}