import WebSocket from "ws";
import { io } from "../../index";
import { getSubscribers } from "./stockSubscription.service";

let ws: WebSocket | null = null;

export const startDhanFeed = (token: string, clientId: string) => {
  const wsUrl = `wss://api-feed.dhan.co?version=2&token=${token}&clientId=${clientId}&authType=2`;
  console.log(wsUrl);

  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("✅ Dhan Connected");
    const subscribeMsg = {
      RequestCode: 15,
      InstrumentCount: 1,
      InstrumentList: [{ ExchangeSegment: "NSE_EQ", SecurityId: "3045" }],
    };
    // subscribe example
    ws?.send(JSON.stringify(subscribeMsg));
    console.log("📩 Subscribed to instruments:", subscribeMsg);
  });

  ws.on("message", (data) => {
    try {
      // ✅ Handle binary correctly
      if (Buffer.isBuffer(data)) {
        console.log("📦 Binary packet received:", data.length);

        // 🔥 TEMP: just forward raw data (no parsing yet)
        const users = getSubscribers();
        if (users) {
          users.forEach((userId) => {
            io.to(userId).emit("stock:update", data);
          });
        }

        return;
      }

      // fallback (rare)
      console.log("⚠️ Non-binary message:", data.toString());
    } catch (err) {
      console.error("❌ Message handling error:", err);
    }
  });

  ws.on("close", (error:any) => {
    console.log("❌ Dhan disconnected → reconnecting...",error);
    setTimeout(() => startDhanFeed(token, clientId), 3000);
  });

  ws.on("error", (code: any, reason: any) => {
    console.error("Dhan error:", code, reason.toString());
  });
};


