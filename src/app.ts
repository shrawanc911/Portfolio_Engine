import express from "express";
import cors from "cors";
import manualStockEntryRoutes from "./routes/manualStockEntry.routes";
import portfolioRoutes from "./routes/portfolio.routes";
import historyDataRoutes from "./routes/historyData.routes";
import stockRoutes from "./routes/stock.routes";
import historyDataRoutesv2 from "./v2/routes/historyData.routes";
import stockRoutesv2 from "./v2/routes/stock.routes";
import screenerRoutes from "./routes/screener.routes";
import zerodhaRoutes from "./routes/zerodha.routes";
import dhanRoutes from "./routes/dhan.routes";
import jobRoutes from "./routes/job.routes";
import weeklyReportRoutes from "./routes/weeklyReport.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import watchlistRoutes from "./routes/watchlist.routes";
import toolsRoutes from "./routes/tools.routes";
import cronRoutes from "./routes/cron.routes";
import { metricsMiddleware, metricsHandler } from "./utils/metrics";

const app = express();

// CORS configuration with specific allowed origins - MUST BE FIRST
const corsOptions = {
  origin: [
    "https://aarthik.ai",
    "https://www.aarthik.ai",
    "https://admin.aarthik.ai",
    "https://dev.aarthik.ai",
    "https://core.aarthik.ai",
    "https://dev-core.aarthik.ai",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "X-Content-Type-Options",
  ],
  exposedHeaders: ["Set-Cookie"],
  preflightContinue: false,
};

app.use(cors(corsOptions));

// 📝 Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${
        res.statusCode
      } - ${duration}ms`,
    );
  });
  next();
});

// 📊 Prometheus metrics
app.use(metricsMiddleware);
app.get("/metrics", metricsHandler);

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "portfolio manager api running....",
  });
});

// Increase JSON/body payload limit
// Apply JSON parser to only non-file routes
app.use((req, res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    next(); // skip JSON parsing for file uploads
  } else {
    express.json({ limit: "50mb" })(req, res, next); // parse JSON normally
    express.urlencoded({ extended: true, limit: "50mb" });
  }
});

// Health check endpoint for Docker health checks
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "Health check ok...",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/manual", manualStockEntryRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/data", historyDataRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/screener", screenerRoutes);
app.use("/api/zerodha", zerodhaRoutes);
app.use("/api/dhan", dhanRoutes);
app.use("/api/job", jobRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/tool", toolsRoutes);

// Internal test routes for weekly reports
app.use("/internal", weeklyReportRoutes);
app.use("/internal/cron", cronRoutes);

app.use("/api/v2/data", historyDataRoutesv2);
app.use("/api/v2/stock", stockRoutesv2);

// Market report PDF generation - MIGRATED TO pdf-service

// Rate Limiter
// app.use("/api", limiter);

// 404 Handler
// app.all("*", (req, res, next) => {
//   res.status(404).json({
//     success: false,
//     message: `Can't find ${req.originalUrl} on this server!`,
//   });
// });

// Global Error Handler
import { globalErrorHandler } from "./middlewares/error.middleware";
app.use(globalErrorHandler);

export default app;
