import axios from "axios";
import { ENV } from "../config/env";

export async function fetchBase64Image(displayName: string) {
  const response = await axios.get("https://pro.indianapi.in/logo", {
    params: { stock_name: displayName },
    headers: {
      "X-Api-Key": ENV.INDIAN_API_KEY,
    },
  });

  // 🟡 LOG ONLY WHEN DEBUGGING
  // console.log(displayName, response.data);

  const { content_type, base64_image } = response.data ?? {};

  // ❗ If logo not found → SKIP, not FAIL
  if (!base64_image || !content_type) {
    console.log(`Image not found ${displayName}`);
    // console.log(`Error :`, response.data);
    return null;
  }

  return { content_type, base64_image };
}
