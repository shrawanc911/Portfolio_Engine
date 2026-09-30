import { redis } from "../config/redis";

export const getCache = async (key: string) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis read error:", err);
    return null; // fallback to DB
  }
};

export const setCache = async (key: string, value: any, ttlSeconds = 300) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error("Redis write error:", err);
  }
};

export const deleteCache = async (key: string) => {
  try {
    await redis.del(key);
  } catch (err) {
    console.error("Redis delete error:", err);
  }
};

export const isStopped = async (chatId: string, userId: string) => {
  const key = `stop:${chatId}:${userId}`;
  return !!(await redis.get(key));
};
