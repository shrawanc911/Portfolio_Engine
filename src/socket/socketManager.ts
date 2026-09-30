import { Server, Socket } from "socket.io";
import holdingModel from "../models/Holding.model";
import portfolioModel from "../models/Portfolio.model";
import { verifyToken } from "../utils/jwt";
import {
  addUserStocks,
  removeUser,
} from "../services/stockSubscription.service";

interface DecodedToken {
  userId: string;
}

export const initSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    // console.log("✅ User connected:", socket.id);

    socket.on("init", async (data) => {
      try {
        if (!data.token) return;

        const decoded = verifyToken(data.token) as DecodedToken;
        const userId = decoded.userId;

        if (!userId) return;

        socket.join(userId);

        const portfolio = await portfolioModel.findOne({ user_id: userId });

        if (portfolio) {
          const holdings = await holdingModel.find({
            portfolio_id: portfolio._id,
          });

          // Map holdings to the format expected by the frontend
          const stocks = holdings.map((h) => ({
            display_name: h.display_name,
            security_id: h.security_id,
            ticker_id: h.isin, // Or ticker_id if available
            latest_price: h.current_price,
            latest_close: h.current_price - (h.today_net_change || 0), // Approx if close not stored directly
            today_percent_change: h.today_percent_change,
            underlying_symbol: h.underlying_symbol,
            image_url: h.image_url,
            exchange: h.exchange,
          }));

          // 🔥 Store subscription
          addUserStocks(userId);

          socket.emit("initial_data", { data: stocks });
        }
      } catch (err) {
        console.error("Init error:", err);
      }
    });

    socket.on("disconnect", () => {
      removeUser(socket.id);
    });
  });
};
