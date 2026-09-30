import { KiteConnect } from "kiteconnect";
import { ENV } from "./env";

export const kc = new KiteConnect({ api_key: ENV.KITE_API_KEY });
