import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PORTFOLIO_SCORE: process.env.PORTFOLIO_SCORE || "",

  MONGO_URI: process.env.MONGO_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "",

  REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_URL: process.env.REDIS_URL || "",

  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION || "",
  S3_BUCKET: process.env.S3_BUCKET || "",

  DHAN_ACCESS_TOKEN: process.env.DHAN_ACCESS_TOKEN || "",
  DHAN_ACCESS_TOKEN_2: process.env.DHAN_ACCESS_TOKEN_2 || "",

  BROKER_NAME: process.env.BROKER_NAME || "",
  DHAN_CLIENT_ID_ONE: process.env.DHAN_CLIENT_ID_ONE || "", // Ajit sir dhan account
  DHAN_CLIENT_ID_TWO: process.env.DHAN_CLIENT_ID_TWO || "", // Shrawan dhan account

  INDIAN_API_KEY: process.env.INDIAN_API_KEY || "",
  INDIAN_API_BASE_URL: process.env.INDIAN_API_BASE_URL || "",

  MARKET_ANALYSIS_API: process.env.MARKET_ANALYSIS_API || "",

  DHAN_PARTNER_ID: process.env.DHAN_PARTNER_ID || "",
  DHAN_PARTNER_SECRET: process.env.DHAN_PARTNER_SECRET || "",
  FRONTEND_URL: process.env.FRONTEND_URL || "",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_CLOUD_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_CLOUD_SECRET_KEY || "",

  KITE_API_KEY: process.env.KITE_API_KEY || "",
  KITE_API_SECRET: process.env.KITE_API_SECRET || "",

  // AiSensy WhatsApp Integration
  AISENSY_API_KEY: process.env.AISENSY_API_KEY || "",
  AISENSY_CAMPAIGN_NAME: process.env.AISENSY_CAMPAIGN_NAME || "",

  // Weekly Report Config
  WEEKLY_REPORT_ENABLED: process.env.WEEKLY_REPORT_ENABLED === "true",
  WEEKLY_REPORT_TEST_PHONE: process.env.WEEKLY_REPORT_TEST_PHONE || "",

  // Market Report Automation Config
  MARKET_REPORT_ENABLED: process.env.MARKET_REPORT_ENABLED === "true",
  MARKET_SERVICE_URL: process.env.MARKET_ANALYSIS_API || "http://market:5003",
  PDF_SERVICE_URL: process.env.PDF_SERVICE_URL || "http://pdf-service:5008",
};
