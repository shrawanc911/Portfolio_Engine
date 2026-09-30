import axios from "axios";
import { BrokerToken } from "../models/BrokerToken.model";
import { redis } from "../config/redis";

const SAFETY_BUFFER_SECONDS = 60;
const LOCK_TTL_SECONDS = 30;
const MAX_RETRY = 5;
const RETRY_DELAY_MS = 800;

export const getTokenCacheKey = (broker: string, client_id: string) =>
  `${broker}:TOKEN:${client_id}`;

const getLockKey = (broker: string, client_id: string) =>
  `${broker}:LOCK:${client_id}`;

function isExpired(date: Date | string) {
  return new Date(date).getTime() <= Date.now();
}

async function callDhanRenewAPI(access_token: string, client_id: string) {
  try {
    const response = await axios.get("https://api.dhan.co/v2/RenewToken", {
      headers: {
        "access-token": access_token,
        dhanClientId: client_id,
      },
    });

    if (!response.data?.token) {
      throw new Error("Dhan RenewToken failed");
    }

    return {
      access_token: response.data.token,
      expires_in: 24 * 60 * 60, // Ideally from API
    };
  } catch (error: any) {
    console.error("[callDhanRenewAPI] Error while renew Dhan access token:", error.message);
    return {
      access_token: null,
      expires_in: null,
    };
  }
}

export const refreshDhanToken = async (
  broker: string,
  client_id: string,
): Promise<string | null> => {
  const brokerToken = await BrokerToken.findOne({ broker, client_id });

  if (!brokerToken) throw new Error("Token not found in DB");

  const { access_token, expires_in } = await callDhanRenewAPI(
    brokerToken.access_token,
    client_id,
  );

  if (access_token == null || expires_in == null) {
    return null;
  }

  const expiresAt = new Date(Date.now() + expires_in * 1000);

  brokerToken.access_token = access_token;
  brokerToken.expires_at = expiresAt;
  brokerToken.issued_at = new Date();
  await brokerToken.save();

  const cacheKey = getTokenCacheKey(broker, client_id);

  const ttl = expires_in - SAFETY_BUFFER_SECONDS;

  await redis.set(
    cacheKey,
    JSON.stringify({
      access_token,
      expiry_at: expiresAt.toISOString(),
    }),
    "EX",
    ttl > 0 ? ttl : 60,
  );

  return access_token;
};

export const getDhanAccessToken = async (
  broker: string,
  client_id: string,
): Promise<string | null> => {
  const cacheKey = getTokenCacheKey(broker, client_id);
  try {
    // 1️⃣ Try Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);

      if (!isExpired(parsed.expiry_at)) {
        return parsed.access_token;
      }
    }

    // 2️⃣ Check DB
    const tokenDoc = await BrokerToken.findOne({ broker, client_id }).lean();
    if (!tokenDoc) throw new Error("Token not found in DB");

    if (!isExpired(tokenDoc.expires_at)) {
      const ttl =
        Math.floor(
          (new Date(tokenDoc.expires_at).getTime() - Date.now()) / 1000,
        ) - SAFETY_BUFFER_SECONDS;

      await redis.set(
        cacheKey,
        JSON.stringify({
          access_token: tokenDoc.access_token,
          expiry_at: tokenDoc.expires_at.toISOString(),
        }),
        "EX",
        ttl > 0 ? ttl : 60,
      );

      return tokenDoc.access_token;
    }

    // 3️⃣ Distributed Lock (Minimal Add, No Overdesign)
    const lockKey = getLockKey(broker, client_id);

    const lock = await redis.call(
      "SET",
      lockKey,
      "1",
      "NX",
      "EX",
      LOCK_TTL_SECONDS,
    );

    if (lock === "OK") {
      return await refreshDhanToken(broker, client_id);
    }

    // 4️⃣ Retry if another instance is refreshing
    for (let i = 0; i < MAX_RETRY; i++) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

      const retry = await redis.get(cacheKey);
      if (retry) {
        const parsed = JSON.parse(retry);
        if (!isExpired(parsed.expiry_at)) {
          return parsed.access_token;
        }
      }
    }

    throw new Error("Token refresh failed after retry");
  } catch (error: any) {
    console.error("[getDhanAccessToken] Error while getting dhan access token:", error.message);
    return null;
  }
};
