// import { WebSocketServer, WebSocket } from "ws";
// import holdingModel from "../models/holding.model";
// import stockModel from "../models/stock.model";
// import { verifyToken } from "./jwt";
// import { dhanTokenManager } from "../services/dhanTokenRefresh.service";
// import { ENV } from "../config/env";

// interface Company {
//   display_name?: string;
//   security_id?: string;
//   ticker_id?: string;
//   latest_price?: number;
//   latest_close?: number;
//   today_percent_change?: number;
//   year_high?: number;
//   year_low?: number;
//   today_low?: number;
//   today_high?: number;
//   underlying_symbol?: string;
//   image_url?: string;
//   stock_exchange?: "BSE" | "NSE";
// }

// interface stockUser {
//   [user_id: string]: string[];
// }

// interface stockData {
//   [security_id: string]: Company;
// }

// interface CustomWebSocket extends WebSocket {
//   userId?: string;
// }

// interface DecodedToken {
//   userId: string;
//   email?: string;
// }

// let wss: WebSocketServer;
// let dhWs: WebSocket | null = null;
// let stockUserMap: stockUser = {};
// let stocks: stockData = {};
// let instruments: any[] = [];
// let isConnecting = false;
// let intentionalClose = false; // Flag to indicate if the close was intentional
// let reconnectAttempts = 0;
// let reconnectScheduled = false; // Flag to prevent duplicate reconnects
// const MAX_RECONNECT_ATTEMPTS = 10; // Maximum number of reconnect attempts
// const MAX_RECONNECT_DELAY = 300000; // 5 minutes
// const INITIAL_RECONNECT_DELAY = 30000; // 30 seconds

// /**
//  * Connects to Dhan WebSocket feed safely
//  */
// const connectToDhan = async () => {
//   if (isConnecting) {
//     console.log(
//       "⚠️ Already connecting to Dhan WebSocket, skipping duplicate call..."
//     );
//     return;
//   }
//   isConnecting = true;

//   try {
//     console.log("🔁 Preparing Dhan WebSocket connection...");

//     const TOKEN = await dhanTokenManager.getDhanAccessToken();
//     const CLIENT_ID = ENV.DHAN_CLIENT_ID;
//     const wsUrl = `wss://api-feed.dhan.co?version=2&token=${TOKEN}&clientId=${CLIENT_ID}&authType=2`;
//     console.log(wsUrl);

//     // 🧠 Fetch holdings + stocks once
//     const holdings = await holdingModel.find().populate({
//       path: "portfolio_id",
//       select: "user_id",
//       model: "Portfolio",
//     });

//     instruments = await stockModel.find();
//     stockUserMap = {};
//     stocks = {};

//     for (const holding of holdings) {
//       const portfolio: any = holding.portfolio_id;
//       const userId = portfolio?.user_id;
//       const securityId = holding.security_id;
//       if (!securityId || !userId) continue;
//       if (!stockUserMap[userId]) stockUserMap[userId] = [];
//       if (!stockUserMap[userId].includes(securityId.toString())) {
//         stockUserMap[userId].push(securityId.toString());
//       }
//     }

//     for (const inst of instruments) {
//       const securityId = inst.security_id;
//       if (!securityId) continue;
//       stocks[securityId] = {
//         display_name: inst.display_name,
//         underlying_symbol: inst.underlying_symbol,
//         latest_price: inst.latest_price,
//         latest_close: inst.latest_close,
//         image_url: inst.image_url,
//         today_percent_change: inst.today_percent_change,
//         security_id: inst.security_id,
//         ticker_id: inst.ticker_id,
//         stock_exchange: inst.stock_exchange,
//         year_high: inst.year_high,
//         year_low: inst.year_low,
//         today_high: inst.today_high,
//         today_low: inst.today_low,
//       };
//     }

//     dhWs = new WebSocket(wsUrl);

//     dhWs.on("open", () => {
//       console.log("✅ Connected to Dhan WebSocket");
//       isConnecting = false;
//       reconnectAttempts = 0; // Reset reconnect attempts on successful connection
//       reconnectScheduled = false; // Reset reconnect schedule flag

//       const batchSize = 50;
//       for (let i = 0; i < instruments.length; i += batchSize) {
//         const batch = instruments.slice(i, i + batchSize);
//         const subscribeMsg = {
//           RequestCode: 15,
//           InstrumentCount: batch.length,
//           InstrumentList: batch.map((inst) => ({
//             ExchangeSegment: "NSE_EQ",
//             SecurityId: inst.security_id,
//           })),
//         };

//         setTimeout(() => {
//           if (dhWs?.readyState === WebSocket.OPEN) {
//             dhWs.send(JSON.stringify(subscribeMsg));
//             console.log(`📩 Subscribed to ${batch.length} instruments`);
//           }
//         }, (i / batchSize) * 1000);
//       }
//     });

//     dhWs.on("message", (data: any) => handleStockUpdate(data));

//     dhWs.on("close", (code, reason) => {
//       console.log(
//         `⚡ Dhan WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`
//       );
//       isConnecting = false;
//       dhWs = null;

//       if (intentionalClose) {
//         console.log("Intentional close, not reconnecting immediately.");
//         intentionalClose = false; // Reset flag
//         return;
//       }

//       if (reconnectScheduled) {
//         console.log(
//           "Reconnect already scheduled from error handler, skipping."
//         );
//         return;
//       }

//       // Handle specific close codes
//       if (code === 401) {
//         console.log(
//           "🔑 WebSocket closed due to invalid token (401). Refreshing token..."
//         );
//         dhanTokenManager.refreshTokenManually().catch((err) => {
//           console.error("❌ Failed to refresh token after WS close:", err);
//         });
//         // The 'refreshed' event will trigger the reconnect.
//       } else {
//         reconnectScheduled = true;
//         console.log("Attempting to reconnect in 15 seconds...");
//         setTimeout(() => {
//           reconnectScheduled = false;
//           connectToDhan();
//         }, 15000);
//       }
//     });

//     dhWs.on("error", (err) => {
//       console.error("❌ Dhan WebSocket error:", err.message);
//       isConnecting = false;

//       // Handle 429 rate limit error from the handshake
//       if (err.message.includes("429")) {
//         if (reconnectScheduled) return; // Don't schedule twice

//         if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
//           console.error(
//             `❌ Reached maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}). Aborting.`
//           );
//           return;
//         }

//         reconnectScheduled = true;
//         reconnectAttempts++;

//         const baseDelay = Math.min(
//           INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
//           MAX_RECONNECT_DELAY
//         );
//         const jitter = Math.random() * 1000;
//         const delayWithJitter = baseDelay + jitter;

//         console.log(
//           `Rate limited (429). Waiting ${
//             delayWithJitter / 1000
//           } seconds before reconnecting... (Attempt ${reconnectAttempts})`
//         );

//         setTimeout(() => {
//           reconnectScheduled = false;
//           connectToDhan();
//         }, delayWithJitter);
//       }

//       dhWs?.terminate(); // Force close on error
//     });
//   } catch (err: any) {
//     console.error("❌ Fatal error in connectToDhan:", err.message);
//     isConnecting = false;
//     setTimeout(connectToDhan, 60000); // retry in 1 minute
//   }
// };

// /**
//  * Initialize WebSocket Server for frontend clients
//  */
// export const initStockWebSocket = (server: any, port: number) => {
//   wss = new WebSocketServer({ server });
//   console.log(`✅ WebSocket Server running on ws://localhost:${port}`);

//   wss.on("connection", (ws: CustomWebSocket) => {
//     console.log("✅ Frontend connected via WebSocket");

//     ws.on("message", (message) => {
//       const data = JSON.parse(message.toString());
//       if (data.type === "init") {
//         const decoded = verifyToken(data.token) as DecodedToken;
//         ws.userId = decoded.userId;
//         console.log("User connected:", decoded.userId);

//         const secIds = stockUserMap[decoded.userId];
//         if (secIds?.length) {
//           const userStocks = secIds
//             .map((sec) => stocks[sec])
//             .filter((s) => s !== undefined);
//           ws.send(JSON.stringify({ type: "initial_data", data: userStocks }));
//         }
//       }
//     });

//     ws.on("close", () => console.log("⚡ Frontend disconnected"));
//   });

//   // Start the first connection
//   connectToDhan();

//   // Listen for token refresh events to reconnect WebSocket
//   dhanTokenManager.on("refreshed", () => {
//     console.log("🔑 Token has been refreshed. Reconnecting WebSocket...");
//     if (dhWs) {
//       intentionalClose = true;
//       dhWs.close();
//     }
//     // A small delay to ensure the old connection is closed before opening a new one.
//     setTimeout(connectToDhan, 1000);
//   });
// };

// /**
//  * Handle real-time stock updates
//  */
// const handleStockUpdate = (data: any) => {
//   const buffer = Buffer.from(data);
//   const responseCode = buffer.readUInt8(0);

//   if (responseCode === 2) {
//     const security_id = buffer.readInt32LE(4);
//     const latest_price = buffer.readFloatLE(8);
//     const inst = instruments.find((i) => Number(i.security_id) === security_id);
//     const symbol_name = inst?.symbol_name || String(security_id);

//     stocks[security_id] = {
//       ...stocks[security_id],
//       latest_price,
//       display_name: inst?.display_name || symbol_name,
//       underlying_symbol: inst?.underlying_symbol || symbol_name,
//       image_url: inst?.image_url || "",
//       ticker_id: inst?.ticker_id || "",
//     };

//     if (stocks[security_id].latest_close) {
//       stocks[security_id].today_percent_change =
//         ((latest_price - stocks[security_id].latest_close!) /
//           stocks[security_id].latest_close!) *
//         100;
//     }
//   } else if (responseCode === 6) {
//     const security_id = buffer.readInt32LE(4);
//     const latest_close = buffer.readFloatLE(8);
//     const inst = instruments.find((i) => Number(i.security_id) === security_id);
//     const symbol_name = inst?.symbol_name || String(security_id);

//     stocks[security_id] = {
//       ...stocks[security_id],
//       latest_close,
//       display_name: inst?.display_name || symbol_name,
//       underlying_symbol: inst?.underlying_symbol || symbol_name,
//       image_url: inst?.image_url || "",
//       ticker_id: inst?.ticker_id || "",
//     };

//     if (stocks[security_id].latest_price !== undefined) {
//       stocks[security_id].today_percent_change =
//         ((stocks[security_id].latest_price! - latest_close) / latest_close) *
//         100;
//     }
//   }

//   // 🔄 broadcast to all connected users
//   wss.clients.forEach((client: any) => {
//     if (client.readyState === WebSocket.OPEN && client.userId) {
//       const secIds = stockUserMap[client.userId];
//       if (!secIds) return;
//       const userStocks = secIds
//         .map((sec) => stocks[sec])
//         .filter((s) => s !== undefined);
//       client.send(JSON.stringify({ data: userStocks }));
//     }
//   });
// };
