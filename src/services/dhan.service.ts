import { DhanIntradayPayload, DhanPayload } from "../interface/file.interface";
import { sleep } from "../utils/sleep";
import {
  getDhanAccessToken,
  refreshDhanToken,
} from "./dhanTokenManager.service";

/**
 * Dynamically creates headers for Dhan API requests with a fresh access token.
 */
export const getDhanHeaders = async (
  broker_name: string,
  dhan_client_id: string,
) => {
  const accessToken = await getDhanAccessToken(broker_name, dhan_client_id);

  if (!accessToken) {
    return null;
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "access-token": accessToken || "",
    "client-id": dhan_client_id,
  };
};

const stockInProcess = new Set<number>();

export const fetchDhanData = async (
  payload: DhanPayload,
  broker_name: string,
  dhan_client_id: string,
  retries = 3,
  backoffMs = 1000,
): Promise<any> => {
  const url = "https://api.dhan.co/v2/charts/historical";

  try {
    if (stockInProcess.has(payload.securityId) && retries == 3) {
      console.log(
        `${payload.securityId} is already in process ${payload.exchangeSegment} , ${payload.instrument}`,
      );
      return [];
    }
    console.log(
      `${payload.securityId} is processed ${payload.exchangeSegment} , ${payload.instrument}`,
    );
    stockInProcess.add(payload.securityId);
    const headers = await getDhanHeaders(broker_name, dhan_client_id);

    if (headers === null) {
      throw new Error(`Token not found in DB ${payload.securityId}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    // Handle 401 Unauthorized or 429 Rate Limit
    if (response.status === 401 && retries > 0) {
      console.warn("⚠️ Dhan Auth 401. Reloading token and retrying...");
      await refreshDhanToken(broker_name, dhan_client_id);
      return fetchDhanData(
        payload,
        broker_name,
        dhan_client_id,
        retries - 1,
        backoffMs,
      );
    }

    if (response.status === 429 && retries > 0) {
      console.warn(
        `⚠️ Rate limited for ${payload.securityId}, ${payload.exchangeSegment}. Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
      return fetchDhanData(
        payload,
        broker_name,
        dhan_client_id,
        retries - 1,
        backoffMs * 2,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Dhan API failed for ${payload.securityId} (status ${response.status})`,
      );
    }

    return await response.json();
  } catch (error: any) {
    console.warn(
      `Dhan API failed for ${payload.securityId}, ${payload.exchangeSegment} due to error: ${error}`,
    );
    throw new Error(
      `❌ Dhan API permanently failed for ${payload.securityId}: ${error}`,
    );
  } finally {
    stockInProcess.delete(payload.securityId);
  }
};

export const fetchDhanIntradayData = async (
  payload: DhanIntradayPayload,
  broker_name: string,
  dhan_client_id: string,
  retries = 3,
  backoffMs = 1000,
): Promise<any> => {
  const url = "https://api.dhan.co/v2/charts/intraday";

  try {
    console.log(
      `${payload.securityId} is processed ${payload.exchangeSegment} , ${payload.instrument}`,
    );
    const headers = await getDhanHeaders(broker_name, dhan_client_id);

    if (headers === null) {
      throw new Error(`Token not found in DB ${payload.securityId}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    // Handle 401 Unauthorized or 429 Rate Limit
    if (response.status === 401 && retries > 0) {
      console.warn("⚠️ Dhan Auth 401. Reloading token and retrying...");
      await refreshDhanToken(broker_name, dhan_client_id);
      return fetchDhanIntradayData(
        payload,
        broker_name,
        dhan_client_id,
        retries - 1,
        backoffMs,
      );
    }

    if (response.status === 429 && retries > 0) {
      console.warn(
        `⚠️ Rate limited for ${payload.securityId}, ${payload.exchangeSegment}. Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
      return fetchDhanIntradayData(
        payload,
        broker_name,
        dhan_client_id,
        retries - 1,
        backoffMs * 2,
      );
    }

    if (!response.ok) {
      // console.log(await response.json())
      throw new Error(
        `Dhan API failed for ${payload.securityId} (status ${response.status})`,
      );
    }

    return await response.json();
  } catch (error: any) {
    console.warn(
      `⚠️ Retry for ${payload.securityId}, ${payload.exchangeSegment} due to error: ${error}`,
    );
    throw new Error(
      `❌ Dhan API permanently failed for ${payload.securityId}: ${error}`,
    );
  }
};
