import axios from "axios";

import { redis } from "../config/redis";


export const getConsentId = async (userId: string) => {
  try {
    if (!userId) {
      return { success: false, consentId: null };
    }
    const response = await axios.post(
      "https://auth.dhan.co/partner/generate-consent",
      {},
      {
        headers: {
          partner_id: process.env.DHAN_PARTNER_ID,
          partner_secret: process.env.DHAN_PARTNER_SECRET,
        },
      }
    );

    const consentId = response.data.consentId;
    const cachekey = `dhan_consent:${consentId}`;
    await redis.set(cachekey, userId, "EX", 610); // 1 hour expiry

    const loginUrl =
      response.data.link ||
      `https://auth.dhan.co/consent-login?consentId=${consentId}`;
    return { success: true, consentId, loginUrl };
  } catch (err: any) {
    console.error("Error while getting consent id:", err);
    return { success: false, consentId: null };
  }
};