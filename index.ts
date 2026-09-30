import app from "./src/app";
import http from "http";
import connectDB from "./src/config/db";
// import { dhanTokenManager } from "./src/services/dhanTokenRefresh.service";
import { stockCache } from "./src/services/stockCache.service";
import { Server } from "socket.io";
import { searchStockService } from "./src/services/stockSearch.service";
import holdingModel from "./src/models/Holding.model";
import portfolioModel from "./src/models/Portfolio.model";
import { verifyToken } from "./src/utils/jwt";
import { startDhanFeed } from "./src/services/dhanFeed.service";
import { getDhanAccessToken } from "./src/services/dhanTokenManager.service";
import { ENV } from "./src/config/env";
import { initSocket } from "./src/socket/socketManager";

interface DecodedToken {
  userId: string;
  email?: string;
}

const PORT = 5005;
export let io: Server;

const startServer = async () => {
  try {
    // 1. Connect to the database
    await connectDB();
    // await stockCache.warmSecurityIdIsinCache();

    // 2. Create HTTP server and initialize WebSocket
    const server = http.createServer(app);

    // 3. Connect Websocket
    io = new Server(server, {
      path: "/ws/portfolio/socket.io", // Aligned with gateway proxy (no pathRewrite)
      pingInterval: 25000,
      pingTimeout: 60000,
      cors: {
        origin: "*", // Allow all origins (adjust in production)
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"], // Allow polling for robust handshake
    });

    // 🔥 Initialize socket logic
    initSocket(io);

    const token = await getDhanAccessToken(
      ENV.BROKER_NAME,
      ENV.DHAN_CLIENT_ID_TWO,
    );
    if (token) {
      startDhanFeed(token, ENV.DHAN_CLIENT_ID_TWO);
    }

    // 5. Start listening for requests
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start the server:", error);
    process.exit(1);
  }
};

startServer();
