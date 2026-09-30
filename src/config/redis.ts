import { Redis } from "ioredis";
import { ENV } from "./env";

export const redisConnection = {
  host: ENV.REDIS_HOST || "127.0.0.1",
  port: Number(ENV.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const redis = new Redis(redisConnection);

redis.on("connect", () => console.log("🔌 Redis Connection Established"));
redis.on("error", (err) => console.error("❌ Redis Connection Error:", err));

